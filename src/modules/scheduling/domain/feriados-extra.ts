/**
 * Feriados MOVIBLES POR DECRETO, curados a mano (sección 2.3).
 *
 * REGLA: este archivo SOLO SUMA feriados; nunca anula los calculados por
 * código. Agregar aquí los decretos de cada año (puentes, feriados únicos,
 * elecciones, censos) apenas se publiquen.
 */

export const FERIADOS_EXTRA: Record<string, { fecha: string; nombre: string }[]> = {
  CL: [
    // Ejemplo de decreto: { fecha: "2026-01-02", nombre: "Feriado puente (decreto)" },
  ],
  CO: [],
  EC: [],
  PE: [
    // Perú suele decretar "días no laborables" para el sector público que
    // NO suspenden clases privadas: solo agregar los que apliquen a LGS.
  ],
};
