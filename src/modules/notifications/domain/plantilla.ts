/**
 * PLANTILLAS de mensaje (2026-10-07), con la misma sintaxis que LGS: texto
 * libre con marcadores `{{clave}}` (se admiten espacios dentro de las llaves).
 * Un marcador desconocido queda vacío, igual que en LGS.
 */

export const MARCADORES = [
  "nombre",
  "nombreCompleto",
  "apoderado",
  "usuario",
  "clave",
  "curso",
  "salon",
  "campania",
  "contrato",
  "plataforma",
  "enlace",
] as const;

export type Marcador = (typeof MARCADORES)[number];

export const DESCRIPCION_MARCADOR: Record<Marcador, string> = {
  nombre: "Primer nombre del niño",
  nombreCompleto: "Nombres y apellidos del niño",
  apoderado: "Primer nombre del apoderado",
  usuario: "Usuario del niño en la plataforma",
  clave: "Clave del niño (solo desde su ficha)",
  curso: "Junior o Youngster",
  salon: "Salón del niño",
  campania: "Campaña",
  contrato: "N° de contrato",
  plataforma: "País",
  enlace: "Enlace de creación de perfil (solo el envío automático y la ficha)",
};

/**
 * La CLAVE solo viaja desde la ficha del niño, de a un envío y sin quedar
 * escrita en el historial. Un envío masivo con `{{clave}}` dejaría las claves
 * de todo un salón en la cola de envíos, en texto plano.
 *
 * El ENLACE de creación de perfil es igual de secreto: con él se fija la clave
 * del niño. Tampoco va en envíos masivos ni queda escrito en el historial.
 */
export const MARCADOR_SECRETO: Marcador = "clave";
export const MARCADORES_SECRETOS: readonly Marcador[] = ["clave", "enlace"];

const RE_MARCADOR = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export type ContextoMensaje = Partial<Record<Marcador, string | null>>;

export function rellenarPlantilla(contenido: string, ctx: ContextoMensaje): string {
  return contenido.replace(RE_MARCADOR, (_, clave: string) => {
    const valor = (ctx as Record<string, string | null | undefined>)[clave];
    return valor ?? "";
  });
}

export function marcadoresDe(contenido: string): string[] {
  const vistos = new Set<string>();
  for (const m of contenido.matchAll(RE_MARCADOR)) {
    if (m[1] !== undefined) vistos.add(m[1]);
  }
  return [...vistos];
}

/** ¿Lleva un dato secreto (la clave o el enlace de perfil)? Entonces no va en masa. */
export function usaClave(contenido: string): boolean {
  return marcadoresDe(contenido).some((m) => (MARCADORES_SECRETOS as string[]).includes(m));
}

/** El texto que se GUARDA en el historial: ni la clave ni el enlace quedan escritos. */
export function rellenarParaHistorial(contenido: string, ctx: ContextoMensaje): string {
  return rellenarPlantilla(contenido, { ...ctx, clave: "••••••", enlace: "(enlace personal)" });
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
export const LARGO_MAXIMO_CONTENIDO = 1000;
/** La plantilla del botón de la ficha del niño. */
export const SLUG_CREDENCIALES = "credenciales-kids";
/** La del enlace de creación de perfil: sale sola al aprobar el contrato. */
export const SLUG_CREACION_PERFIL = "creacion-perfil-kids";
