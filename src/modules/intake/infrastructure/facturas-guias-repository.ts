import { execute, queryOne, queryRows } from "@/platform/db/query";

/** Factura de un guía (tabla liquidacion_factura_guia). */
export interface FacturaGuiaRow {
  id: string;
  guiaUserId: string;
  username: string;
  periodo: string;
  corte: "MES" | "Q1" | "Q2";
  fileId: string;
  nombre: string;
  mime: string;
  estado: string;
  motivo: string | null;
  lgsFacturaId: string | null;
  subidaEn: string;
  actualizadoEn: string;
}

const SELECT = `SELECT f.id, f.guia_user_id AS "guiaUserId", u.username, f.periodo, f.corte,
                       f.file_id AS "fileId", f.nombre, f.mime, f.estado, f.motivo,
                       f.lgs_factura_id AS "lgsFacturaId",
                       f.subida_en::text AS "subidaEn", f.actualizado_en::text AS "actualizadoEn"
                  FROM liquidacion_factura_guia f
                  JOIN identity_user u ON u.id = f.guia_user_id`;

export function facturasDeGuia(guiaUserId: string, periodo: string): Promise<FacturaGuiaRow[]> {
  return queryRows<FacturaGuiaRow>(
    `${SELECT} WHERE f.guia_user_id = $1 AND f.periodo = $2 ORDER BY f.subida_en DESC`,
    [guiaUserId, periodo],
  );
}

export function facturaPorId(id: string): Promise<FacturaGuiaRow | null> {
  return queryOne<FacturaGuiaRow>(`${SELECT} WHERE f.id = $1`, [id]);
}

/** Las que LGS aún no tomó. */
export function facturasEnviando(): Promise<FacturaGuiaRow[]> {
  return queryRows<FacturaGuiaRow>(
    `${SELECT} WHERE f.estado = 'ENVIANDO' ORDER BY f.subida_en LIMIT 100`,
  );
}

/** Nueva factura del corte: la anterior viva del mismo corte queda REEMPLAZADA. */
export async function registrarFactura(input: {
  guiaUserId: string;
  periodo: string;
  corte: string;
  fileId: string;
  nombre: string;
  mime: string;
}): Promise<string> {
  await execute(
    `UPDATE liquidacion_factura_guia SET estado = 'REEMPLAZADA', actualizado_en = now()
      WHERE guia_user_id = $1 AND periodo = $2 AND corte = $3
        AND estado IN ('ENVIANDO', 'RECIBIDA', 'DEVUELTA', 'RECHAZADA')`,
    [input.guiaUserId, input.periodo, input.corte],
  );
  const row = await queryOne<{ id: string }>(
    `INSERT INTO liquidacion_factura_guia (guia_user_id, periodo, corte, file_id, nombre, mime)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.guiaUserId, input.periodo, input.corte, input.fileId, input.nombre, input.mime],
  );
  if (row === null) throw new Error("No se pudo registrar la factura.");
  return row.id;
}

export async function actualizarEstadoFactura(
  id: string,
  estado: string,
  motivo: string | null,
  lgsFacturaId: string | null,
): Promise<boolean> {
  const n = await execute(
    `UPDATE liquidacion_factura_guia
        SET estado = $2, motivo = $3, lgs_factura_id = COALESCE($4, lgs_factura_id), actualizado_en = now()
      WHERE id = $1 AND estado <> 'REEMPLAZADA'`,
    [id, estado, motivo, lgsFacturaId],
  );
  return n > 0;
}
