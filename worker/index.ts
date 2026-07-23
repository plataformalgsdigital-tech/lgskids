/**
 * Worker de tareas programadas de KIDS2026.
 *
 * Fase 2: esqueleto con registro de tareas y apagado controlado. Las tareas
 * reales (vencimiento de contratos, recordatorios, notificaciones) se agregan
 * en sus fases; cada una debe ser idempotente y no depender de estado en
 * memoria (trampa 2.8.5).
 */
import { logger } from "../src/platform/logging/logger";

interface ScheduledTask {
  name: string;
  /** Expresión cron (min hora díaMes mes díaSemana), evaluada en UTC. */
  cron: string;
  run: () => Promise<void>;
}

/** Registro de tareas — vacío en Fase 2, se llena en Fases 5+. */
const tasks: ScheduledTask[] = [];

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Worker: apagado controlado", { signal });
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

logger.info("Worker iniciado", { tareas: tasks.map((t) => t.name) });

// Bucle mínimo de vida: mantiene el proceso activo hasta que existan tareas
// reales con su planificador (Fase 5+).
setInterval(() => {
  if (!shuttingDown) {
    logger.debug("Worker vivo", { tareas: tasks.length });
  }
}, 60_000);
