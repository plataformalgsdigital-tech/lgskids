/**
 * Vigencia de contratos — LA ÚNICA FUENTE DE VERDAD (sección 2.4).
 *
 * `final_contrato` es DATE puro (sin hora ni zona). Un contrato se considera
 * VENCIDO solo cuando la fecha UTC del servidor es >= 2 días posterior: así
 * el último día del contrato nunca bloquea a un niño cuyo reloj local aún
 * corre ese día.
 *
 * Esta función (y su gemelo SQL de abajo) se usa desde login, panel, cron y
 * consultas. NO reimplementar esta regla en ningún otro lugar.
 */

export const DIAS_GRACIA_VENCIMIENTO = 2;

/**
 * Duración del contrato (regla del negocio, 2026-09-21): el alumno se
 * desactiva a los 12 meses del INICIO del contrato. Antes la fecha de fin se
 * tipeaba a mano y nada la ataba a esta regla. Las pausas (OnHold) la
 * extienden al reactivar, y el vencimiento conserva los días de gracia.
 */
export const MESES_CONTRATO = 12;

/**
 * Fin del contrato = inicio + MESES_CONTRATO meses (YYYY-MM-DD).
 * Si el día no existe en el mes destino se recorta al último (29-feb → 28-feb,
 * 31-ene + 1 mes → 28/29-feb): la misma regla que la aritmética de meses de
 * Postgres, que usó la migración que recalculó los contratos existentes.
 */
export function finalDeContrato(inicio: string, meses: number = MESES_CONTRATO): string {
  const [y, m, d] = inicio.split("-").map(Number);
  const totalMeses = (y ?? 0) * 12 + ((m ?? 1) - 1) + meses;
  const anio = Math.floor(totalMeses / 12);
  const mes = totalMeses % 12; // 0-based
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d ?? 1, ultimoDia);
  return `${String(anio).padStart(4, "0")}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Fecha UTC de hoy como YYYY-MM-DD. */
export function fechaUtcHoy(ahora: Date = new Date()): string {
  return ahora.toISOString().slice(0, 10);
}

/**
 * ¿Está vencido? `finalContrato` y `hoyUtc` en formato YYYY-MM-DD.
 * Vencido ⇔ hoyUtc >= finalContrato + DIAS_GRACIA_VENCIMIENTO días.
 */
export function contratoVencido(finalContrato: string, hoyUtc: string = fechaUtcHoy()): boolean {
  const [y, m, d] = finalContrato.split("-").map(Number);
  const limite = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + DIAS_GRACIA_VENCIMIENTO))
    .toISOString()
    .slice(0, 10);
  return hoyUtc >= limite;
}

/**
 * Gemelo SQL de `contratoVencido` para barridos e informes. Usar SIEMPRE
 * este fragmento (columna sin funciones encima: aprovecha el índice
 * (estado, final_contrato)).
 *
 * OJO: un contrato EN PAUSA no vence mientras dura la pausa —su fin se
 * extiende al reactivarlo—, así que el barrido solo mira contratos APROBADOS.
 */
export const SQL_CONTRATO_VENCIDO = `final_contrato <= (now() AT TIME ZONE 'UTC')::date - ${DIAS_GRACIA_VENCIMIENTO}`;
