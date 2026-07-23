/**
 * Catálogo de permisos de la plataforma (Fase 3). Crece por fase.
 * El seed los inserta; el código los referencia SOLO por estas constantes.
 */
export const PERMISOS = {
  USUARIOS_GESTIONAR: "usuarios.gestionar",
  ROLES_ASIGNAR: "roles.asignar",
  AUDITORIA_VER: "auditoria.ver",
  CATALOGO_GESTIONAR: "catalogo.gestionar",
  CATALOGO_VER: "catalogo.ver",
  PERSONAS_GESTIONAR: "personas.gestionar",
  PERSONAS_VER: "personas.ver",
  CONTRATOS_GESTIONAR: "contratos.gestionar",
  CONTRATOS_VER: "contratos.ver",
  SALONES_GESTIONAR: "salones.gestionar",
  SALONES_VER: "salones.ver",
  MATRICULAS_GESTIONAR: "matriculas.gestionar",
  MATRICULAS_VER: "matriculas.ver",
  ASISTENCIA_GESTIONAR: "asistencia.gestionar",
  ASISTENCIA_VER: "asistencia.ver",
  EVALUACIONES_GESTIONAR: "evaluaciones.gestionar",
  EVALUACIONES_VER: "evaluaciones.ver",
  PROGRESION_VER: "progresion.ver",
  PANEL_ADMINISTRACION: "panel.administracion",
  PANEL_GUIA: "panel.guia",
  PANEL_APODERADO: "panel.apoderado",
  PANEL_ALUMNO: "panel.alumno",
} as const;

export type PermisoCode = (typeof PERMISOS)[keyof typeof PERMISOS];

/** Roles semilla. */
export const ROLES = {
  ADMIN: "admin",
  COORDINADOR: "coordinador",
  GUIA: "guia",
  APODERADO: "apoderado",
  ALUMNO: "alumno",
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

/** Matriz rol → permisos que el seed materializa. */
export const MATRIZ_ROL_PERMISOS: Record<RoleCode, PermisoCode[]> = {
  admin: Object.values(PERMISOS),
  coordinador: [
    PERMISOS.USUARIOS_GESTIONAR,
    PERMISOS.AUDITORIA_VER,
    PERMISOS.CATALOGO_GESTIONAR,
    PERMISOS.CATALOGO_VER,
    PERMISOS.PERSONAS_GESTIONAR,
    PERMISOS.PERSONAS_VER,
    PERMISOS.CONTRATOS_GESTIONAR,
    PERMISOS.CONTRATOS_VER,
    PERMISOS.SALONES_GESTIONAR,
    PERMISOS.SALONES_VER,
    PERMISOS.MATRICULAS_GESTIONAR,
    PERMISOS.MATRICULAS_VER,
    PERMISOS.ASISTENCIA_GESTIONAR,
    PERMISOS.ASISTENCIA_VER,
    PERMISOS.EVALUACIONES_GESTIONAR,
    PERMISOS.EVALUACIONES_VER,
    PERMISOS.PROGRESION_VER,
    PERMISOS.PANEL_ADMINISTRACION,
  ],
  guia: [
    PERMISOS.PANEL_GUIA,
    PERMISOS.CATALOGO_VER,
    PERMISOS.SALONES_VER,
    PERMISOS.MATRICULAS_VER,
    PERMISOS.ASISTENCIA_GESTIONAR,
    PERMISOS.ASISTENCIA_VER,
    PERMISOS.EVALUACIONES_GESTIONAR,
    PERMISOS.EVALUACIONES_VER,
    PERMISOS.PROGRESION_VER,
  ],
  apoderado: [PERMISOS.PANEL_APODERADO],
  alumno: [PERMISOS.PANEL_ALUMNO],
};
