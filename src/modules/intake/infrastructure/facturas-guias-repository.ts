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
  /** Qué cobra: NORMAL | EXAM_INTERN | FESTIVO | OTRO (un corte puede cobrarse en varias). */
  concepto: string | null;
  /** 'agregar' (se suma a las del corte) | 'reemplazar' (sustituye a todas). */
  modo: string;
  /** Factura del mismo corte que esta sustituye (Reemplazar una). */
  reemplazaId: string | null;
  subidaEn: string;
  actualizadoEn: string;
}

const SELECT = `SELECT f.id, f.guia_user_id AS "guiaUserId", u.username, f.periodo, f.corte,
                       f.file_id AS "fileId", f.nombre, f.mime, f.estado, f.motivo,
                       f.lgs_factura_id AS "lgsFacturaId", f.concepto, f.modo,
                       f.reemplaza_id AS "reemplazaId",
                       f.subida_en::text AS "subidaEn", f.actualizado_en::text AS "actualizadoEn"
                  FROM liquidacion_factura_guia f
                  JOIN identity_user u ON u.id = f.guia_user_id`;

/** Estados de una factura que sigue "viva" en el corte (cuenta para el tope y se puede quitar). */
export const ESTADOS_VIVOS = ["ENVIANDO", "RECIBIDA"] as const;

export function facturasDeGuia(guiaUserId: string, periodo: string): Promise<FacturaGuiaRow[]> {
  return queryRows<FacturaGuiaRow>(
    `${SELECT} WHERE f.guia_user_id = $1 AND f.periodo = $2 ORDER BY f.subida_en DESC`,
    [guiaUserId, periodo],
  );
}

export function facturaPorId(id: string): Promise<FacturaGuiaRow | null> {
  return queryOne<FacturaGuiaRow>(`${SELECT} WHERE f.id = $1`, [id]);
}

/** Las que LGS aún no tomó (en el orden en que se subieron). */
export function facturasEnviando(): Promise<FacturaGuiaRow[]> {
  return queryRows<FacturaGuiaRow>(
    `${SELECT} WHERE f.estado = 'ENVIANDO' ORDER BY f.subida_en LIMIT 100`,
  );
}

export async function vivasDelCorte(
  guiaUserId: string,
  periodo: string,
  corte: string,
): Promise<number> {
  const r = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM liquidacion_factura_guia
      WHERE guia_user_id = $1 AND periodo = $2 AND corte = $3 AND estado IN ('ENVIANDO', 'RECIBIDA')`,
    [guiaUserId, periodo, corte],
  );
  return Number(r?.n ?? 0);
}

/**
 * Nueva factura del corte.
 *  - reemplazar (por defecto): las vivas, devueltas o no recibidas del corte quedan REEMPLAZADA.
 *  - agregar: se suma a las vivas; las devueltas/no recibidas quedan REEMPLAZADA (conjunto nuevo).
 *  - reemplazaId: solo esa queda REEMPLAZADA.
 */
export async function registrarFactura(input: {
  guiaUserId: string;
  periodo: string;
  corte: string;
  fileId: string;
  nombre: string;
  mime: string;
  concepto: string | null;
  modo: "agregar" | "reemplazar";
  reemplazaId: string | null;
}): Promise<string> {
  if (input.reemplazaId !== null) {
    await execute(
      `UPDATE liquidacion_factura_guia SET estado = 'REEMPLAZADA', actualizado_en = now()
        WHERE id = $1 AND guia_user_id = $2`,
      [input.reemplazaId, input.guiaUserId],
    );
  } else {
    const estados =
      input.modo === "agregar"
        ? ["DEVUELTA", "RECHAZADA"]
        : ["ENVIANDO", "RECIBIDA", "DEVUELTA", "RECHAZADA"];
    await execute(
      `UPDATE liquidacion_factura_guia SET estado = 'REEMPLAZADA', actualizado_en = now()
        WHERE guia_user_id = $1 AND periodo = $2 AND corte = $3 AND estado = ANY($4::text[])`,
      [input.guiaUserId, input.periodo, input.corte, estados],
    );
  }
  const row = await queryOne<{ id: string }>(
    `INSERT INTO liquidacion_factura_guia
       (guia_user_id, periodo, corte, file_id, nombre, mime, concepto, modo, reemplaza_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      input.guiaUserId,
      input.periodo,
      input.corte,
      input.fileId,
      input.nombre,
      input.mime,
      input.concepto,
      input.modo,
      input.reemplazaId,
    ],
  );
  if (row === null) throw new Error("No se pudo registrar la factura.");
  return row.id;
}

/** Retira una factura del corte (queda REEMPLAZADA; no se borra). */
export async function retirarFactura(id: string): Promise<void> {
  await execute(
    `UPDATE liquidacion_factura_guia SET estado = 'REEMPLAZADA', actualizado_en = now() WHERE id = $1`,
    [id],
  );
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
