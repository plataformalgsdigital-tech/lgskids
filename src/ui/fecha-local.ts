/**
 * Fecha y hora de un INSTANTE en el reloj de quien mira.
 *
 * Un evento administrativo es un instante: se escribe con la hora de quien lo
 * crea y cada quien lo ve en la suya. Una reunión creada a las 13:00 en
 * Colombia la ve a las 15:00 quien entra desde Chile.
 *
 * Por eso el DÍA también hay que derivarlo del instante y no del que se guardó
 * al crearlo: un evento de las 23:30 en Colombia cae al día siguiente para
 * Chile, y pintarlo en la celda del día guardado lo mostraría con una hora que
 * no coincide con su casilla.
 */

/** `YYYY-MM-DD` del instante, en la zona del navegador. */
export function fechaLocal(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${String(d.getFullYear())}-${mes}-${dia}`;
}

/** `HH:MM` del instante, en la zona del navegador. */
export function horaLocal(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
