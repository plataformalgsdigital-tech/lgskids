/**
 * Estructura curricular de LGS Kids (decisión funcional 2026-07-22):
 * 4 niveles por curso; 4 lecciones por nivel, cada una con cuestionario de
 * práctica; un Level Up por nivel cuya aprobación promueve al siguiente.
 */

export const NIVELES = [
  { codigo: "ROOKIE", nombre: "Rookie", orden: 1 },
  { codigo: "CHAMPION", nombre: "Champion", orden: 2 },
  { codigo: "ELITE", nombre: "Elite", orden: 3 },
  { codigo: "LEGENDARY", nombre: "Legendary", orden: 4 },
] as const;

export type NivelCodigo = (typeof NIVELES)[number]["codigo"];

export const LECCIONES_POR_NIVEL = 4;

export const TIPOS_CURSO = [
  { tipo: "JUNIOR", nombre: "Junior", edadMin: 6, edadMax: 9 },
  { tipo: "YOUNGSTER", nombre: "Youngster", edadMin: 10, edadMax: 13 },
] as const;

export type CursoTipo = (typeof TIPOS_CURSO)[number]["tipo"];
