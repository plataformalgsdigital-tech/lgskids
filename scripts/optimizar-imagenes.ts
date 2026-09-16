/**
 * Reencoda las imágenes YA subidas, que entraron antes de que se optimizara al
 * subir.
 *
 *   pnpm imagenes:optimizar             # muestra qué haría, sin tocar nada
 *   pnpm imagenes:optimizar --aplicar
 *
 * La lógica vive en el módulo `files`; esto solo la invoca e imprime.
 */
import { UMBRAL_REOPTIMIZAR, reoptimizarImagenes } from "@/modules/files";

try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env (CI): las variables ya vienen del entorno.
}

function kb(n: number): string {
  return `${String(Math.round(n / 1024))} kB`;
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--aplicar");
  console.log(
    `Imágenes por encima de ${kb(UMBRAL_REOPTIMIZAR)}` +
      (aplicar ? "" : "   (simulación: usa --aplicar para escribir)"),
  );

  const r = await reoptimizarImagenes({ aplicar });
  if (r.length === 0) {
    console.log("No hay imágenes que optimizar.");
    return;
  }

  let antes = 0;
  let despues = 0;
  let tocadas = 0;
  let fallos = 0;

  for (const x of r) {
    const corto = x.id.slice(0, 8);
    if (x.estado === "error") {
      fallos++;
      console.log(`  ✘ ${corto} se deja intacta: ${x.error ?? ""}`);
      continue;
    }
    antes += x.original;
    despues += x.final;
    if (x.estado === "ya-optima") {
      console.log(`  = ${corto} ${x.entidad ?? "-"} ${kb(x.original)} (ya óptima)`);
      continue;
    }
    tocadas++;
    const ahorro = Math.round((1 - x.final / x.original) * 100);
    console.log(
      `  ↓ ${corto} ${x.entidad ?? "-"} ${kb(x.original)} → ${kb(x.final)} (−${String(ahorro)} %)`,
    );
  }

  console.log("");
  if (antes > 0) {
    console.log(
      `Total: ${kb(antes)} → ${kb(despues)} ` +
        `(−${String(Math.round((1 - despues / antes) * 100))} %)`,
    );
  }
  console.log(`${String(tocadas)} optimizadas · ${String(fallos)} con error`);
  if (!aplicar && tocadas > 0) console.log("Nada se escribió. Repite con --aplicar.");
}

void main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error("✘", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
