import { execute, queryOne, queryRows } from "@/platform/db/query";

/**
 * Acceso a datos de `catalog_arte_hotspot`. `data` es JSONB libre (la capa de
 * aplicación lo normaliza). Una fila por (scope, curso, nivel).
 */

export async function getHotspotData(scope: string, curso: string, nivel: string): Promise<unknown | null> {
  const row = await queryOne<{ data: unknown }>(
    `SELECT data FROM catalog_arte_hotspot
      WHERE scope = $1 AND curso = $2::catalog_course_tipo AND nivel = $3`,
    [scope, curso, nivel],
  );
  return row?.data ?? null;
}

export async function upsertHotspot(
  id: string,
  scope: string,
  curso: string,
  nivel: string,
  dataJson: string,
): Promise<void> {
  await execute(
    `INSERT INTO catalog_arte_hotspot (id, scope, curso, nivel, data, updated_at)
     VALUES ($1, $2, $3::catalog_course_tipo, $4, $5::jsonb, now())
     ON CONFLICT (scope, curso, nivel)
     DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [id, scope, curso, nivel, dataJson],
  );
}

export async function listHotspotsCurso(
  curso: string,
): Promise<{ scope: string; nivel: string; data: unknown }[]> {
  return queryRows<{ scope: string; nivel: string; data: unknown }>(
    `SELECT scope, nivel, data FROM catalog_arte_hotspot WHERE curso = $1::catalog_course_tipo`,
    [curso],
  );
}
