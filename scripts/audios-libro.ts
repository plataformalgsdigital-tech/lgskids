/**
 * Sube las pistas de audio de un cuadernillo y las engancha a su pliego.
 *
 *   pnpm libro:audios Audios/Junior_Rookie JUNIOR ROOKIE "UNIT 0-1"
 *
 * Los archivos vienen nombrados `PAG<pliego>-<orden>.<ext>`, donde el pliego es
 * la HOJA del PDF (= la diapositiva del digibook), no la página impresa. Se
 * verificó contrastando qué diapositivas llevan audio incrustado con los
 * nombres de la carpeta: coinciden 13 de 14.
 *
 * El VIDEO (`-V01.mp4`) se SALTA a propósito: los del cuadernillo llegan a
 * 47 MB, muy por encima del tope de `files`, y servir eso por una ruta
 * autenticada de Node es trabajo de un CDN. Se siguen enlazando.
 *
 * Reejecutar reemplaza: la pista vigente de un (pliego, orden) es la última.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { libroIdPorCodigo, registrarAudioLibro } from "@/modules/catalog";
import { subirArchivo } from "@/modules/files";
import { queryRows } from "@/platform/db/query";

try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env (CI): las variables ya vienen del entorno.
}

const MIME_POR_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};

async function main(): Promise<void> {
  const [carpeta, curso, nivel, codigo] = process.argv.slice(2);
  if (carpeta === undefined || curso === undefined || nivel === undefined || codigo === undefined) {
    console.error('Uso: pnpm libro:audios <carpeta> <CURSO> <NIVEL> "<CÓDIGO>"');
    process.exit(1);
  }

  const libroId = await libroIdPorCodigo(curso, nivel, codigo);
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

  const archivos = readdirSync(carpeta).sort();
  let subidas = 0;
  let saltados = 0;
  let bytesOrig = 0;

  for (const f of archivos) {
    const m = /^PAG(\d+)-(\d+)\.(mp3|m4a)$/i.exec(f);
    if (m === null) {
      saltados++;
      continue; // videos y cualquier otra cosa
    }
    const pliego = Number(m[1]);
    const orden = Number(m[2]);
    const mime = MIME_POR_EXT[m[3]!.toLowerCase()]!;
    const bytes = readFileSync(join(carpeta, f));
    bytesOrig += bytes.length;

    const { id } = await subirArchivo({
      actorUserId,
      nombreOriginal: f,
      mime,
      bytes,
      entidad: "catalog_libro_audio",
      entidadId: `${codigo}:${String(pliego)}:${String(orden)}`,
    });
    await registrarAudioLibro({
      libroId,
      pliego,
      orden,
      fileId: id,
      nombreOriginal: f,
    });
    subidas++;
    process.stdout.write(`\r  ${String(subidas)} pistas`);
  }

  console.log(
    `\n✔ ${String(subidas)} pistas subidas · ${String(saltados)} saltadas (video u otro)`,
  );
  console.log(`  ${String(Math.round(bytesOrig / 1024))} kB de audio`);

  // Qué páginas impresas quedan con sonido: es lo que el niño va a notar.
  // Las pistas se cuentan APARTE de las páginas: un pliego tiene dos páginas,
  // así que unirlas antes de contar multiplicaba cada pista por dos y el
  // informe decía 26 donde había 13.
  const cobertura = await queryRows<{ pliego: number; pistas: string; paginas: string }>(
    `WITH pistas AS (
       SELECT pliego, COUNT(*)::text AS n
         FROM catalog_libro_audio WHERE libro_id = $1 GROUP BY pliego
     ), paginas AS (
       SELECT pliego,
              string_agg(COALESCE(numero_impreso::text, 'portada'), ' | ' ORDER BY pagina) AS etiquetas
         FROM catalog_libro_pagina WHERE libro_id = $1 GROUP BY pliego
     )
     SELECT t.pliego, t.n AS pistas, COALESCE(g.etiquetas, '—') AS paginas
       FROM pistas t LEFT JOIN paginas g USING (pliego)
      ORDER BY t.pliego`,
    [libroId],
  );
  console.log("\n  pliego → páginas impresas (pistas)");
  for (const c of cobertura) {
    console.log(`    ${String(c.pliego).padStart(2)} → ${c.paginas.padEnd(14)} (${c.pistas})`);
  }

  const sin = await queryRows<{ n: string }>(
    `SELECT COUNT(*)::text n FROM catalog_libro_pagina p
      WHERE p.libro_id = $1
        AND NOT EXISTS (SELECT 1 FROM catalog_libro_audio a
                         WHERE a.libro_id = p.libro_id AND a.pliego = p.pliego)`,
    [libroId],
  );
  console.log(`\n  ${sin[0]?.n ?? "?"} páginas siguen sin sonido (el impreso tampoco lo tenía).`);
}

void main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error("✘", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
