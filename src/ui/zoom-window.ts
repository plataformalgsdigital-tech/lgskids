/**
 * Reglas de acceso a Zoom de la clase (replicadas de MOSAICO). Lógica PURA,
 * segura para el cliente: compara contra el INSTANTE de inicio (UTC ms), nunca
 * contra la hora local, así el ícono se abre a la vez en todos los husos.
 *
 * - Ventana de ingreso: [inicio − 5 min, inicio + 15 min]. Dentro de ella el
 *   alumno puede entrar (da igual si llega puntual o hasta +15).
 * - Al entrar (dentro de la ventana) gana RECONEXIÓN personal hasta 10 min
 *   antes del fin (fin = inicio + duración). Nunca acorta la ventana de ingreso.
 * - Estados: espera → disponible → (vencido | cerrado).
 * - No hay penalización de asistencia por entrar tarde: la asistencia se marca
 *   aparte; entrar "a tiempo" solo otorga el derecho de reconexión.
 */

export const ZOOM_ABRE_MIN_ANTES = 5;
export const ZOOM_CIERRA_MIN_DESPUES = 15;
export const ZOOM_RECONEXION_MARGEN_FINAL_MIN = 10;

const MIN = 60_000;

export type EstadoZoom = "espera" | "disponible" | "vencido" | "cerrado";

export interface VentanaZoom {
  inicioMs: number; // instante de inicio (UTC ms)
  ahoraMs: number;
  duracionMin: number; // duración de la sesión
  tieneAcceso: boolean; // el alumno ya ingresó (reconexión)
}

function hitos(inicioMs: number, duracionMin: number) {
  const abre = inicioMs - ZOOM_ABRE_MIN_ANTES * MIN;
  const cierraIngreso = inicioMs + ZOOM_CIERRA_MIN_DESPUES * MIN;
  const finMs = inicioMs + Math.max(duracionMin, 0) * MIN;
  const cierraReconexion = Math.max(cierraIngreso, finMs - ZOOM_RECONEXION_MARGEN_FINAL_MIN * MIN);
  return { abre, cierraIngreso, cierraReconexion };
}

export function estadoZoom(v: VentanaZoom): EstadoZoom {
  const { abre, cierraIngreso, cierraReconexion } = hitos(v.inicioMs, v.duracionMin);
  if (v.ahoraMs < abre) return "espera";
  if (v.ahoraMs <= cierraIngreso) return "disponible";
  if (v.tieneAcceso) return v.ahoraMs <= cierraReconexion ? "disponible" : "cerrado";
  return "vencido";
}

/** Próximo instante (ms) en que cambia el estado, para reprogramar sin recargar. */
export function proximoCambioZoom(v: VentanaZoom): number | null {
  const { abre, cierraIngreso, cierraReconexion } = hitos(v.inicioMs, v.duracionMin);
  const candidatos = [abre, cierraIngreso, cierraReconexion]
    .filter((t) => t > v.ahoraMs)
    .sort((a, b) => a - b);
  return candidatos[0] ?? null;
}

/** Mensaje según estado (y si ya ingresó, para el caso de reconexión). */
export function mensajeZoom(estado: EstadoZoom, tieneAcceso: boolean): string {
  switch (estado) {
    case "espera":
      return "El enlace se habilita 5 min antes de la clase. Recuerda refrescar el navegador.";
    case "disponible":
      return tieneAcceso
        ? "Ya ingresaste. Si se te cae la conexión, puedes volver a entrar desde aquí."
        : "Enlace listo (disponible hasta 15 min después del inicio). Da clic en el ícono.";
    case "vencido":
      return "El plazo para ingresar venció (15 min después del inicio). Comunícate con la guía.";
    case "cerrado":
      return "La clase ya terminó.";
  }
}
