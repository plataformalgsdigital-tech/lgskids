import { contarOcurrencias, primeraOcurrencia, sumarDias } from "./fechas";

/**
 * GENERACIÓN DETERMINÍSTICA DE SESIONES (sección 2.3) — las reglas que
 * costaron caro:
 *
 * 1. El número TOTAL de sesiones es NOMINAL: cuántas ocurrencias del día de
 *    semana caben en [inicioCurso, finalCurso]. `finalCurso` NUNCA se
 *    reescribe — extenderlo haría que cada regeneración agregue sesiones.
 * 2. Feriados (del calendario del salón) y suspensiones NO se dictan: la
 *    sesión SE CORRE AL FINAL, conservando el total. El fin REAL del curso
 *    es la fecha de la última sesión, que puede caer después de finalCurso.
 * 3. La función es PURA y determinística: mismas entradas → mismas fechas.
 *    Regenerar N veces produce exactamente el mismo conjunto (invariante
 *    cubierto por pruebas).
 */
export function generarFechasSlot(input: {
  inicioCurso: string; // YYYY-MM-DD
  finalCurso: string; // YYYY-MM-DD — ventana NOMINAL, jamás se modifica
  diaSemana: number; // 0=domingo … 6=sábado (en la zona operativa del salón)
  noDictables: ReadonlySet<string>; // feriados del salón + suspensiones (fechas)
}): { fechas: string[]; nominal: number } {
  const nominal = contarOcurrencias(input.inicioCurso, input.finalCurso, input.diaSemana);
  const fechas: string[] = [];
  let cursor = primeraOcurrencia(input.inicioCurso, input.diaSemana);
  // Tope de seguridad: nominal + 120 semanas de corrimiento es imposible en
  // la práctica; evita bucles infinitos ante datos corruptos.
  let guard = nominal + 120;
  while (fechas.length < nominal && guard > 0) {
    if (!input.noDictables.has(cursor)) {
      fechas.push(cursor);
    }
    cursor = sumarDias(cursor, 7);
    guard -= 1;
  }
  return { fechas, nominal };
}
