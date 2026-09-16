/**
 * Extrae las PÁGINAS de un cuadernillo desde su PDF y las adjunta al libro.
 *
 *   pnpm libro:paginas "<ruta del PDF>" JUNIOR ROOKIE "UNIT 0-1"
 *
 * El PDF va en PLIEGOS: una hoja son DOS páginas numeradas del libro. Aquí se
 * rasteriza cada pliego y se parte por la mitad, porque lo que el niño pasa es
 * la PÁGINA, no la hoja. Los pliegos que en la transcripción tienen una sola
 * página (portadas y láminas a doble página) se suben enteros.
 *
 * La imagen entra por `subirArchivo`, así que se optimiza a WebP como todo el
 * arte. Reejecutar reemplaza: la página apunta a la última subida.
 *
 * Requiere `pdftoppm` (poppler) en el PATH.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { subirArchivo } from "@/modules/files";
import { execute, queryRows } from "@/platform/db/query";

try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env (CI): las variables ya vienen del entorno.
}

/** 240 ppp sobre una diapositiva 16:9 deja cada media página cerca de 1600 px. */
const DPI = 240;

interface FilaPagina {
  id: string;
  pagina: number;
  pliego: number | null;
}

async function main(): Promise<void> {
  const [pdf, curso, nivel, codigo] = process.argv.slice(2);
  if (pdf === undefined || curso === undefined || nivel === undefined || codigo === undefined) {
    console.error('Uso: pnpm libro:paginas "<pdf>" <CURSO> <NIVEL> "<CÓDIGO>"');
    process.exit(1);
  }

  const libro = await queryRows<{ id: string }>(
    `SELECT id FROM catalog_libro
      WHERE curso = $1::catalog_course_tipo AND nivel = $2 AND codigo = $3`,
    [curso, nivel, codigo],
  );
  const libroId = libro[0]?.id;
  if (libroId === undefined) {
    console.error(`No hay libro ${curso}·${nivel}·${codigo}. Impórtalo primero.`);
    process.exit(1);
  }

  const paginas = await queryRows<FilaPagina>(
    `SELECT id, pagina, pliego FROM catalog_libro_pagina WHERE libro_id = $1 ORDER BY pagina`,
    [libroId],
  );

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

  // Qué páginas comparten pliego decide si hay que partir la hoja.
  const porPliego = new Map<number, FilaPagina[]>();
  for (const p of paginas) {
    if (p.pliego === null) continue;
    const lista = porPliego.get(p.pliego) ?? [];
    lista.push(p);
    porPliego.set(p.pliego, lista);
  }

  const dir = mkdtempSync(join(tmpdir(), "libro-"));
  try {
    console.log(`Rasterizando ${String(porPliego.size)} pliegos a ${String(DPI)} ppp…`);
    execFileSync("pdftoppm", ["-png", "-r", String(DPI), pdf, join(dir, "p")], {
      stdio: "pipe",
    });
    const archivos = readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .sort();
    console.log(`  ${String(archivos.length)} hojas generadas`);

    let subidas = 0;
    for (const [pliego, lista] of [...porPliego.entries()].sort((a, b) => a[0] - b[0])) {
      // pdftoppm numera desde 1 con relleno de ceros; el pliego N es la hoja N.
      const hoja = archivos.find((f) => {
        const m = /-(\d+)\.png$/.exec(f);
        return m !== null && Number(m[1]) === pliego;
      });
      if (hoja === undefined) {
        console.log(`  ✘ pliego ${String(pliego)}: no se generó la hoja`);
        continue;
      }
      const bytes = readFileSync(join(dir, hoja));
      const meta = await sharp(bytes).metadata();
      const ancho = meta.width ?? 0;
      const alto = meta.height ?? 0;

      const ordenadas = [...lista].sort((a, b) => a.pagina - b.pagina);
      for (let i = 0; i < ordenadas.length; i++) {
        const p = ordenadas[i]!;
        // Dos páginas en la hoja: la de ORDEN menor es la izquierda. Una sola:
        // la hoja entera (las portadas de cada parada y las láminas a doble
        // página). Esta regla siempre fue correcta; lo que desalineó el libro
        // la primera vez fue la numeración de los pliegos y una página que
        // faltaba, no el reparto izquierda/derecha.
        const mitad = ordenadas.length === 1 ? "entera" : i === 0 ? "izq" : "der";
        // El ráster crudo de un pliego denso pasa de 10 MB, y ese tope se mide
        // sobre lo que ENTRA (a propósito: protege la subida de un usuario).
        // Así que el recorte sale ya en WebP, dentro de presupuesto; el
        // optimizador de `files` lo normaliza después como a cualquier arte.
        const recortado =
          mitad === "entera"
            ? sharp(bytes)
            : sharp(bytes).extract({
                left: mitad === "izq" ? 0 : Math.floor(ancho / 2),
                top: 0,
                width: Math.floor(ancho / 2),
                height: alto,
              });
        const recorte = await recortado
          .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 88 })
          .toBuffer();

        const { id } = await subirArchivo({
          actorUserId,
          nombreOriginal: `${codigo} p${String(p.pagina)}.webp`,
          mime: "image/webp",
          bytes: recorte,
          entidad: "catalog_libro_pagina",
          entidadId: p.id,
        });
        await execute(`UPDATE catalog_libro_pagina SET imagen_file_id = $2 WHERE id = $1`, [
          p.id,
          id,
        ]);
        subidas++;
      }
      process.stdout.write(`\r  subidas ${String(subidas)}/${String(paginas.length)}`);
    }
    console.log(`\n✔ ${String(subidas)} páginas con imagen`);

    const sin = await queryRows<{ n: string }>(
      `SELECT COUNT(*)::text n FROM catalog_libro_pagina
        WHERE libro_id = $1 AND imagen_file_id IS NULL`,
      [libroId],
    );
    if (sin[0]?.n !== "0") console.log(`⚠ ${sin[0]?.n ?? "?"} páginas siguen sin imagen`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

void main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error("✘", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
