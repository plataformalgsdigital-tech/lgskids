import { utcToZonedParts, wallTimeToUtc } from "@/platform/time";

/**
 * EL DESFASE ENTRE LOS DOS GRUPOS NO ES FIJO.
 *
 * Vive en `src/ui` —con `zoom-window` y `fecha-local`— porque lo usa una
 * pantalla de CLIENTE: importarlo desde `@/modules/scheduling` arrastraría el
 * módulo entero al navegador (argon2, pg) y el build se cae. Es lógica pura y
 * se prueba como tal.
 *
 * El grupo 01 opera en `America/Santiago` y el 02 en `America/Bogota`. Chile
 * cambia la hora dos veces al año y Colombia no, así que el MISMO horario —el
 * de las 17:00 de Chile— lo viven los demás a las 15:00 media parte del año y a
 * las 16:00 la otra. La sesión siempre sale bien, porque se guarda como
 * INSTANTE (regla 3); lo que se rompe es la cabeza de quien coordina y la
 * agenda del guía que está en otro país.
 *
 * Por eso estas funciones son PURAS y se calculan SOBRE UNA FECHA: preguntar
 * "¿a qué hora es allá?" sin decir cuándo no tiene respuesta.
 */

export const ZONA_POR_GRUPO: Record<string, string> = {
  "01": "America/Santiago",
  "02": "America/Bogota", // CO/EC/PE comparten UTC-5 todo el año
};

/** El grupo que NO es ese: solo hay dos, y se comparan entre sí. */
export function otroGrupo(grupo: string): string {
  return grupo === "01" ? "02" : "01";
}

const dosDigitos = (n: number): string => String(n).padStart(2, "0");

/**
 * La hora de pared `hora` del `grupo`, vista desde el OTRO grupo, en `fecha`.
 * Devuelve "HH:MM" y, cuando cae en otro día, lo dice ("15:00 (día anterior)").
 */
export function horaEnElOtroGrupo(
  hora: string,
  grupo: string,
  fecha: string,
): { hora: string; dias: -1 | 0 | 1 } {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const zonaOrigen = ZONA_POR_GRUPO[grupo] ?? ZONA_POR_GRUPO["01"];
  const zonaDestino = ZONA_POR_GRUPO[otroGrupo(grupo)] ?? ZONA_POR_GRUPO["02"];

  const instante = wallTimeToUtc(
    { year: y ?? 0, month: m ?? 1, day: d ?? 1, hour: hh ?? 0, minute: mm ?? 0 },
    zonaOrigen as string,
  );
  const alla = utcToZonedParts(instante, zonaDestino as string);
  const mismoDia = alla.year === y && alla.month === m && alla.day === d;
  const dias: -1 | 0 | 1 = mismoDia
    ? 0
    : new Date(Date.UTC(alla.year, alla.month - 1, alla.day)).getTime() <
        Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)
      ? -1
      : 1;
  return { hora: `${dosDigitos(alla.hour)}:${dosDigitos(alla.minute)}`, dias };
}

/** Horas de diferencia entre los dos grupos en esa fecha (positivo: 01 va por delante). */
export function desfaseHoras(fecha: string): number {
  const mediodia = "12:00";
  const alla = horaEnElOtroGrupo(mediodia, "01", fecha);
  const [h] = alla.hora.split(":").map(Number);
  return 12 - (h ?? 12);
}

/** Tope de búsqueda del próximo cambio: poco más de un año cubre los dos saltos. */
const DIAS_A_MIRAR = 400;

/**
 * Primera fecha, a partir de `desde`, en la que el desfase entre los dos grupos
 * CAMBIA — o null si no cambia en el año siguiente (no debería pasar mientras
 * Chile tenga horario de verano). Se busca por día contra la base IANA del
 * runtime: hardcodear "el primer domingo de abril" es exactamente el tipo de
 * regla que se mueve por decreto y nadie recuerda actualizar.
 */
export function proximoCambioDeDesfase(desde: string): { fecha: string; desfase: number } | null {
  const actual = desfaseHoras(desde);
  const [y, m, d] = desde.split("-").map(Number);
  const base = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  for (let i = 1; i <= DIAS_A_MIRAR; i += 1) {
    const dia = new Date(base + i * 86_400_000);
    const fecha = `${dia.getUTCFullYear()}-${dosDigitos(dia.getUTCMonth() + 1)}-${dosDigitos(dia.getUTCDate())}`;
    const desfase = desfaseHoras(fecha);
    if (desfase !== actual) return { fecha, desfase };
  }
  return null;
}
