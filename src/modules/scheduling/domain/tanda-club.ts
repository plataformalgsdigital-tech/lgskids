/**
 * TANDA DE CLUBS (2026-10-23): un Club se crea una vez y se repite CADA SEMANA,
 * el mismo día y hora, entre el inicio y el final de la tanda (por defecto, el
 * inicio y el fin de los cursos de la campaña en matrícula, o de la activa).
 *
 * Regla pura: qué fechas tiene la tanda. Feriados y fechas ya pasadas los
 * descarta quien crea las sesiones, que conoce los salones.
 */

/** Tope de semanas: un año de curso más el margen de los corrimientos. */
export const MAX_SEMANAS_TANDA = 60;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const aUtc = (f: string): number => Date.parse(`${f}T00:00:00Z`);
const deUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const SEMANA = 7 * 86_400_000;

/**
 * Las fechas de la tanda: el MISMO día de la semana que `fecha`, desde el
 * inicio hasta el final (ambos incluidos). `fecha` es la que se eligió en el
 * formulario y tiene que caer dentro de la tanda. Devuelve el mensaje de error
 * como `problema` en vez de lanzar, para que la regla se pueda probar sola.
 */
export function fechasTanda(input: {
  fecha: string;
  inicio: string;
  fin: string;
}): { fechas: string[]; problema: null } | { fechas: []; problema: string } {
  const { fecha, inicio, fin } = input;
  if (![fecha, inicio, fin].every((f) => FECHA.test(f) && !Number.isNaN(aUtc(f)))) {
    return { fechas: [], problema: "Las fechas de la tanda deben ser YYYY-MM-DD." };
  }
  if (inicio > fin) {
    return { fechas: [], problema: "El inicio de la tanda debe ser anterior a su final." };
  }
  if (fecha < inicio || fecha > fin) {
    return {
      fechas: [],
      problema:
        "La fecha del Club tiene que estar dentro de la tanda (entre su inicio y su final).",
    };
  }
  // La primera fecha de la tanda con el día de la semana de `fecha`.
  const desfase = ((((aUtc(fecha) - aUtc(inicio)) / 86_400_000) % 7) + 7) % 7;
  const fechas: string[] = [];
  for (let t = aUtc(inicio) + desfase * 86_400_000; t <= aUtc(fin); t += SEMANA) {
    fechas.push(deUtc(t));
  }
  if (fechas.length > MAX_SEMANAS_TANDA) {
    return {
      fechas: [],
      problema: `Una tanda de clubs admite hasta ${String(MAX_SEMANAS_TANDA)} semanas.`,
    };
  }
  return { fechas, problema: null };
}

/** Días entre dos fechas YYYY-MM-DD (b − a): para mover toda la tanda al editar. */
export function diasEntre(a: string, b: string): number {
  return Math.round((aUtc(b) - aUtc(a)) / 86_400_000);
}

/** La fecha `f` corrida `dias` días. */
export function sumarDias(f: string, dias: number): string {
  return deUtc(aUtc(f) + dias * 86_400_000);
}
