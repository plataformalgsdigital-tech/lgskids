/**
 * Carga un libro transcrito (content/libros/*.json) a la base.
 *
 *   pnpm libro:importar content/libros/junior-rookie-unit-0-1.json
 *
 * Reemplaza el libro completo: es la unidad que se edita. Los elementos
 * marcados `confirmar` se cargan igual —son contenido válido con una nota
 * pendiente— pero el script los CUENTA al final para que no se olviden.
 */
import { readFileSync } from "node:fs";
import { importarLibro, type PaginaLibro } from "@/modules/catalog";
import { queryRows } from "@/platform/db/query";

try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env (CI): las variables ya vienen del entorno.
}

interface Transcripcion {
  _meta: { curso: string; nivel: string; libro: string; fuente?: string };
  insignias?: { parada: number; nombre: string }[];
  paradas: { parada: number; titulo: string; paginas: PaginaLibro[] }[];
  _pendientes?: string[];
}

async function main(): Promise<void> {
  const ruta = process.argv[2];
  if (ruta === undefined) {
    console.error("Falta la ruta del JSON.\n  pnpm libro:importar content/libros/<archivo>.json");
    process.exit(1);
  }

  const t = JSON.parse(readFileSync(ruta, "utf8")) as Transcripcion;

  // La transcripción agrupa por parada (así se lee el material); la base
  // guarda páginas planas, que es como se recorre el libro.
  const paginas = t.paradas.flatMap((p) => p.paginas.map((g) => ({ ...g, parada: p.parada })));

  const actor = await queryRows<{ id: string }>(
    `SELECT u.id FROM identity_user u
       JOIN access_user_role ur ON ur.user_id = u.id
       JOIN access_role r ON r.id = ur.role_id
      WHERE lower(r.nombre) = 'superadmin' LIMIT 1`,
  );
  const actorUserId = actor[0]?.id;
  if (actorUserId === undefined) {
    console.error("No hay usuario superadmin: corre `pnpm seed` primero.");
    process.exit(1);
  }

  const r = await importarLibro({
    actorUserId,
    libro: {
      curso: t._meta.curso,
      nivel: t._meta.nivel,
      codigo: t._meta.libro,
      titulo: t.paradas.map((p) => p.titulo).join(" · "),
      fuente: t._meta.fuente ?? null,
      paginas,
      // `exactOptionalPropertyTypes`: la clave va o no va, nunca va en undefined.
      ...(t.insignias === undefined
        ? {}
        : { insignias: t.insignias.map((i) => ({ parada: i.parada, nombre: i.nombre })) }),
    },
  });

  const elementos = paginas.reduce((n, p) => n + p.elementos.length, 0);
  const porConfirmar = paginas.reduce(
    (n, p) =>
      n +
      p.elementos.filter(
        (e) =>
          e["confirmar"] !== undefined ||
          (Array.isArray(e["campos"]) &&
            (e["campos"] as { confirmar?: unknown }[]).some((c) => c.confirmar !== undefined)),
      ).length,
    0,
  );

  console.log(`✔ ${t._meta.curso} · ${t._meta.nivel} · ${t._meta.libro}`);
  console.log(`  ${String(r.paginas)} páginas · ${String(elementos)} elementos`);
  console.log(`  ${String(r.insignias)} insignias`);
  if (porConfirmar > 0) console.log(`  ⚠ ${String(porConfirmar)} elementos marcados «confirmar»`);
  if (t._pendientes && t._pendientes.length > 0) {
    console.log(`  ⚠ ${String(t._pendientes.length)} pendientes globales sin resolver:`);
    for (const p of t._pendientes) console.log(`     · ${p.slice(0, 96)}`);
  }
}

void main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error("✘", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
