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
 */
export const SQL_CONTRATO_VENCIDO = `final_contrato <= (now() AT TIME ZONE 'UTC')::date - ${DIAS_GRACIA_VENCIMIENTO}`;
