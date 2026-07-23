/**
 * Worker de tareas programadas de KIDS2026.
 *
 * Cada tarea debe ser IDEMPOTENTE y sin estado en memoria (trampa 2.8.5):
 * si el proceso se reinicia a mitad de una corrida, la siguiente corrida
 * deja todo consistente.
 *
 * Uso local:  pnpm worker:dev
 */
import { procesarVencimientos } from "../src/modules/contracts";
import { sessionService } from "../src/modules/identity";
import { recalculoGlobal } from "../src/modules/progression";
import { closePool } from "../src/platform/db/pool";
import { logger } from "../src/platform/logging/logger";

try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env (producción): las variables vienen del entorno.
}

interface ScheduledTask {
  name: string;
  /** Intervalo entre corridas, en minutos. */
  everyMinutes: number;
  run: () => Promise<void>;
}

const tasks: ScheduledTask[] = [
  {
    name: "identity.purga_refresh_tokens",
    everyMinutes: 60,
    run: async () => {
      const borrados = await sessionService().purgeExpiredRefreshTokens();
      logger.info("Purga de refresh tokens expirados", { borrados });
    },
  },
  {
    // Usa LA función única de vencimiento (+2 días de gracia) vía su gemelo
    // SQL, con cascada de inactivación sincronizada. Idempotente.
    name: "contracts.vencimientos",
    everyMinutes: 6 * 60,
    run: async () => {
      const procesados = await procesarVencimientos();
      logger.info("Barrido de contratos vencidos", { procesados });
    },
  },
  {
    // CAMINO 3 de LA función central de progresión: red de seguridad — si un
    // camino no disparó (bug, caída), aquí se corrige solo (lección de LGS).
    name: "progression.recalculo_global",
    everyMinutes: 12 * 60,
    run: async () => {
      const ninos = await recalculoGlobal();
      logger.info("Recalculo global de progresión", { ninos });
    },
  },
];

let shuttingDown = false;
const timers: NodeJS.Timeout[] = [];

async function runTask(task: ScheduledTask): Promise<void> {
  try {
    await task.run();
  } catch (error) {
    logger.error("Tarea del worker falló", { tarea: task.name, error: String(error) });
  }
}

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Worker: apagado controlado", { signal });
  for (const timer of timers) {
    clearInterval(timer);
  }
  void closePool().finally(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

logger.info("Worker iniciado", { tareas: tasks.map((t) => t.name) });

for (const task of tasks) {
  // Primera corrida al arrancar y luego por intervalo.
  void runTask(task);
  timers.push(
    setInterval(() => {
      if (!shuttingDown) void runTask(task);
    }, task.everyMinutes * 60_000),
  );
}
