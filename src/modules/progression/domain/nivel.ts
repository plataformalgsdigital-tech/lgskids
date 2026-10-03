/**
 * EL ESTADO DE UN NIVEL, dada la evidencia y la UBICACIÓN académica.
 *
 * Es la regla de la función central puesta aparte, pura y con pruebas: lo que
 * se puede romper aquí es una decisión, no una consulta.
 *
 * - Evidencia: las prácticas aprobadas y el Level Up, de assessment.
 * - Ubicación: el punto de partida que decide coordinación (nivel + lecciones
 *   dadas por cursadas). Es un PISO: nunca resta lo ganado.
 *
 * Un nivel ANTERIOR a la ubicación queda COMPLETADO por convalidación. Si el
 * niño no lo ganó con sus evaluaciones, es `convalidado`: no da medalla, porque
 * la medalla dice "lo lograste" y aquí lo decidió alguien.
 */
export type PosicionRespectoUbicacion = "ANTES" | "EN" | "DESPUES" | "SIN_UBICACION";

export interface EstadoNivel {
  lecciones: number;
  levelUp: boolean;
  completado: boolean;
  /** Completado por la ubicación, sin haberlo ganado: sin medalla. */
  convalidado: boolean;
}

export function estadoNivel(input: {
  totalPracticas: number;
  practicasAprobadas: number;
  levelUpAprobado: boolean;
  posicion: PosicionRespectoUbicacion;
  /** Lecciones dadas por cursadas en el nivel de la ubicación. */
  leccionesUbicadas: number;
}): EstadoNivel {
  const ganado = input.practicasAprobadas >= input.totalPracticas && input.levelUpAprobado;

  if (input.posicion === "ANTES") {
    return {
      lecciones: Math.max(input.practicasAprobadas, input.totalPracticas),
      levelUp: input.levelUpAprobado,
      completado: true,
      convalidado: !ganado,
    };
  }
  if (input.posicion === "EN") {
    const lecciones = Math.max(
      input.practicasAprobadas,
      Math.min(Math.max(input.leccionesUbicadas, 0), input.totalPracticas),
    );
    // Las lecciones se pueden convalidar, el Level Up no: sigue siendo la
    // evaluación que cierra el nivel.
    return {
      lecciones,
      levelUp: input.levelUpAprobado,
      completado: lecciones >= input.totalPracticas && input.levelUpAprobado,
      convalidado: false,
    };
  }
  return {
    lecciones: input.practicasAprobadas,
    levelUp: input.levelUpAprobado,
    completado: ganado,
    convalidado: false,
  };
}

/** Dónde queda un nivel respecto de la ubicación (por su orden en el curso). */
export function posicionRespecto(
  ordenNivel: number,
  ordenUbicacion: number | null,
): PosicionRespectoUbicacion {
  if (ordenUbicacion === null) return "SIN_UBICACION";
  if (ordenNivel < ordenUbicacion) return "ANTES";
  if (ordenNivel === ordenUbicacion) return "EN";
  return "DESPUES";
}
