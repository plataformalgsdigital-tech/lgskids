import { aFecha, diaSemana, sumarDias } from "./fechas";
import { FERIADOS_EXTRA } from "./feriados-extra";

/**
 * Feriados POR CÓDIGO para CL/CO/EC/PE (sección 2.3): fijos + Semana Santa
 * calculada + traslados de ley. Funciona para años futuros sin
 * mantenimiento. Los feriados por decreto (movibles) van en
 * `feriados-extra.ts`, que SOLO SUMA, nunca anula.
 */

export interface Feriado {
  fecha: string;
  nombre: string;
  fuente: "codigo" | "json";
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function domingoPascua(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return aFecha(year, mes, dia);
}

/**
 * Ley Emiliani (Colombia): el feriado se traslada al LUNES SIGUIENTE si no
 * cae lunes.
 */
function emiliani(fecha: string): string {
  const dow = diaSemana(fecha);
  return dow === 1 ? fecha : sumarDias(fecha, (8 - dow) % 7);
}

/**
 * Trasladables de Chile (leyes 19.973/20.148): si cae martes o miércoles se
 * corre al lunes ANTERIOR; si cae jueves, al lunes SIGUIENTE (viernes/fin de
 * semana/lunes no se mueve).
 */
function trasladableChile(fecha: string): string {
  const dow = diaSemana(fecha);
  if (dow === 2) return sumarDias(fecha, -1);
  if (dow === 3) return sumarDias(fecha, -2);
  if (dow === 4) return sumarDias(fecha, 4);
  return fecha;
}

function feriadosChile(year: number): Feriado[] {
  const pascua = domingoPascua(year);
  return [
    { fecha: aFecha(year, 1, 1), nombre: "Año Nuevo" },
    { fecha: sumarDias(pascua, -2), nombre: "Viernes Santo" },
    { fecha: sumarDias(pascua, -1), nombre: "Sábado Santo" },
    { fecha: aFecha(year, 5, 1), nombre: "Día del Trabajo" },
    { fecha: aFecha(year, 5, 21), nombre: "Glorias Navales" },
    { fecha: aFecha(year, 6, 20), nombre: "Día de los Pueblos Indígenas (aprox.)" },
    { fecha: trasladableChile(aFecha(year, 6, 29)), nombre: "San Pedro y San Pablo" },
    { fecha: aFecha(year, 7, 16), nombre: "Virgen del Carmen" },
    { fecha: aFecha(year, 8, 15), nombre: "Asunción de la Virgen" },
    { fecha: aFecha(year, 9, 18), nombre: "Independencia Nacional" },
    { fecha: aFecha(year, 9, 19), nombre: "Glorias del Ejército" },
    { fecha: trasladableChile(aFecha(year, 10, 12)), nombre: "Encuentro de Dos Mundos" },
    { fecha: aFecha(year, 10, 31), nombre: "Iglesias Evangélicas" },
    { fecha: aFecha(year, 11, 1), nombre: "Todos los Santos" },
    { fecha: aFecha(year, 12, 8), nombre: "Inmaculada Concepción" },
    { fecha: aFecha(year, 12, 25), nombre: "Navidad" },
  ].map((f) => ({ ...f, fuente: "codigo" as const }));
}

function feriadosColombia(year: number): Feriado[] {
  const pascua = domingoPascua(year);
  return [
    { fecha: aFecha(year, 1, 1), nombre: "Año Nuevo" },
    { fecha: emiliani(aFecha(year, 1, 6)), nombre: "Reyes Magos" },
    { fecha: emiliani(aFecha(year, 3, 19)), nombre: "San José" },
    { fecha: sumarDias(pascua, -3), nombre: "Jueves Santo" },
    { fecha: sumarDias(pascua, -2), nombre: "Viernes Santo" },
    { fecha: aFecha(year, 5, 1), nombre: "Día del Trabajo" },
    { fecha: emiliani(sumarDias(pascua, 39)), nombre: "Ascensión del Señor" },
    { fecha: emiliani(sumarDias(pascua, 60)), nombre: "Corpus Christi" },
    { fecha: emiliani(sumarDias(pascua, 68)), nombre: "Sagrado Corazón" },
    { fecha: emiliani(aFecha(year, 6, 29)), nombre: "San Pedro y San Pablo" },
    { fecha: aFecha(year, 7, 20), nombre: "Independencia" },
    { fecha: aFecha(year, 8, 7), nombre: "Batalla de Boyacá" },
    { fecha: emiliani(aFecha(year, 8, 15)), nombre: "Asunción de la Virgen" },
    { fecha: emiliani(aFecha(year, 10, 12)), nombre: "Día de la Raza" },
    { fecha: emiliani(aFecha(year, 11, 1)), nombre: "Todos los Santos" },
    { fecha: emiliani(aFecha(year, 11, 11)), nombre: "Independencia de Cartagena" },
    { fecha: aFecha(year, 12, 8), nombre: "Inmaculada Concepción" },
    { fecha: aFecha(year, 12, 25), nombre: "Navidad" },
  ].map((f) => ({ ...f, fuente: "codigo" as const }));
}

function feriadosEcuador(year: number): Feriado[] {
  const pascua = domingoPascua(year);
  return [
    { fecha: aFecha(year, 1, 1), nombre: "Año Nuevo" },
    { fecha: sumarDias(pascua, -48), nombre: "Carnaval (lunes)" },
    { fecha: sumarDias(pascua, -47), nombre: "Carnaval (martes)" },
    { fecha: sumarDias(pascua, -2), nombre: "Viernes Santo" },
    { fecha: aFecha(year, 5, 1), nombre: "Día del Trabajo" },
    { fecha: aFecha(year, 5, 24), nombre: "Batalla de Pichincha" },
    { fecha: aFecha(year, 8, 10), nombre: "Primer Grito de Independencia" },
    { fecha: aFecha(year, 10, 9), nombre: "Independencia de Guayaquil" },
    { fecha: aFecha(year, 11, 2), nombre: "Día de los Difuntos" },
    { fecha: aFecha(year, 11, 3), nombre: "Independencia de Cuenca" },
    { fecha: aFecha(year, 12, 25), nombre: "Navidad" },
  ].map((f) => ({ ...f, fuente: "codigo" as const }));
}

function feriadosPeru(year: number): Feriado[] {
  const pascua = domingoPascua(year);
  return [
    { fecha: aFecha(year, 1, 1), nombre: "Año Nuevo" },
    { fecha: sumarDias(pascua, -3), nombre: "Jueves Santo" },
    { fecha: sumarDias(pascua, -2), nombre: "Viernes Santo" },
    { fecha: aFecha(year, 5, 1), nombre: "Día del Trabajo" },
    { fecha: aFecha(year, 6, 29), nombre: "San Pedro y San Pablo" },
    { fecha: aFecha(year, 7, 28), nombre: "Fiestas Patrias" },
    { fecha: aFecha(year, 7, 29), nombre: "Fiestas Patrias" },
    { fecha: aFecha(year, 8, 6), nombre: "Batalla de Junín" },
    { fecha: aFecha(year, 8, 30), nombre: "Santa Rosa de Lima" },
    { fecha: aFecha(year, 10, 8), nombre: "Combate de Angamos" },
    { fecha: aFecha(year, 11, 1), nombre: "Todos los Santos" },
    { fecha: aFecha(year, 12, 8), nombre: "Inmaculada Concepción" },
    { fecha: aFecha(year, 12, 9), nombre: "Batalla de Ayacucho" },
    { fecha: aFecha(year, 12, 25), nombre: "Navidad" },
  ].map((f) => ({ ...f, fuente: "codigo" as const }));
}

const CALCULADORAS: Record<string, (year: number) => Feriado[]> = {
  CL: feriadosChile,
  CO: feriadosColombia,
  EC: feriadosEcuador,
  PE: feriadosPeru,
};

/**
 * Feriados de un país y año: calculados por código + curados del JSON
 * (que solo suma). Deduplicados por fecha (gana el de código).
 */
export function feriadosDelPais(countryCode: string, year: number): Feriado[] {
  const calculadora = CALCULADORAS[countryCode];
  const porCodigo = calculadora !== undefined ? calculadora(year) : [];
  const fechas = new Set(porCodigo.map((f) => f.fecha));
  const extras = (FERIADOS_EXTRA[countryCode] ?? [])
    .filter((f) => f.fecha.startsWith(String(year)) && !fechas.has(f.fecha))
    .map((f) => ({ ...f, fuente: "json" as const }));
  return [...porCodigo, ...extras].sort((a, b) => a.fecha.localeCompare(b.fecha));
}
