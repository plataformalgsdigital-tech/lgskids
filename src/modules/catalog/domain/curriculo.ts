/**
 * Estructura curricular de LGS Kids (2026-08-24): 5 niveles por curso, 4
 * lecciones por nivel (cada una con cuestionario de práctica) y un Level Up por
 * nivel cuya aprobación promueve al siguiente. Cada nivel tiene una DURACIÓN en
 * meses; la suma (2+2+3+3+2) = 12 meses = vigencia de la campaña.
 */

export const NIVELES = [
  { codigo: "ROOKIE", nombre: "Rookie", orden: 1, duracionMeses: 2 },
  { codigo: "CHAMPION", nombre: "Champion", orden: 2, duracionMeses: 2 },
  { codigo: "ELITE", nombre: "Elite", orden: 3, duracionMeses: 3 },
  { codigo: "LEGENDARY", nombre: "Legendary", orden: 4, duracionMeses: 3 },
  { codigo: "ULTIMATE", nombre: "Ultimate Stage", orden: 5, duracionMeses: 2 },
] as const;

export type NivelCodigo = (typeof NIVELES)[number]["codigo"];

export const LECCIONES_POR_NIVEL = 4;

export const TIPOS_CURSO = [
  { tipo: "JUNIOR", nombre: "Junior", edadMin: 6, edadMax: 9 },
  { tipo: "YOUNGSTER", nombre: "Youngster", edadMin: 10, edadMax: 13 },
] as const;

export type CursoTipo = (typeof TIPOS_CURSO)[number]["tipo"];
