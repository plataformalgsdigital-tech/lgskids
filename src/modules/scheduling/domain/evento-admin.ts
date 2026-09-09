/**
 * Reglas del evento ADMINISTRATIVO: reunión o formación cuya audiencia son
 * GUÍAS, no niños.
 *
 * Sus tipos NO son los de una sesión de clase (SESION/CLUB/TALLER, que viven
 * en el enum `scheduling_slot_tipo`): un evento interno no se dicta a un
 * salón, así que tiene su propio vocabulario, tomado del que ya usa el
 * negocio en MOSAICO.
 *
 * La duración también es distinta: una clase dura minutos, una capacitación
 * puede ocupar una jornada. De ahí el rango de 1 a 8 horas.
 */

export const TIPOS_EVENTO_ADMIN = [
  { valor: "MEETING", etiqueta: "Meeting" },
  { valor: "TRAINING", etiqueta: "Training" },
  { valor: "OBSERVATION", etiqueta: "Observation" },
  { valor: "DEVELOPMENT", etiqueta: "Development" },
] as const;

export type TipoEventoAdmin = (typeof TIPOS_EVENTO_ADMIN)[number]["valor"];

/** Códigos sueltos, para validar y para el `z.enum` de la ruta. */
export const CODIGOS_EVENTO_ADMIN = TIPOS_EVENTO_ADMIN.map((t) => t.valor) as unknown as [
  TipoEventoAdmin,
  ...TipoEventoAdmin[],
];

/** Una hora. Menos que eso no es un evento de agenda, es una nota. */
export const DURACION_ADMIN_MIN = 60;
/** Ocho horas: una jornada completa de capacitación. */
export const DURACION_ADMIN_MAX = 480;

export function esTipoEventoAdmin(v: unknown): v is TipoEventoAdmin {
  return (CODIGOS_EVENTO_ADMIN as readonly string[]).includes(String(v));
}

/** Etiqueta legible; devuelve el código si no lo conoce (datos antiguos). */
export function etiquetaEventoAdmin(codigo: string): string {
  return TIPOS_EVENTO_ADMIN.find((t) => t.valor === codigo)?.etiqueta ?? codigo;
}
