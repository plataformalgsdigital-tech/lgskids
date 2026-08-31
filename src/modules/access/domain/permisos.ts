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
  /** Crear eventos sueltos en el calendario (sesión extra, club, taller). */
  EVENTOS_CREAR: "eventos.crear",
  SALONES_VER: "salones.ver",
  MATRICULAS_GESTIONAR: "matriculas.gestionar",
  MATRICULAS_VER: "matriculas.ver",
  ASISTENCIA_GESTIONAR: "asistencia.gestionar",
  ASISTENCIA_VER: "asistencia.ver",
  EVALUACIONES_GESTIONAR: "evaluaciones.gestionar",
  EVALUACIONES_VER: "evaluaciones.ver",
  PROGRESION_VER: "progresion.ver",
  REPORTES_VER: "reportes.ver",
  ARCHIVOS_GESTIONAR: "archivos.gestionar",
  ARCHIVOS_VER: "archivos.ver",
  PANEL_TABLERO: "panel.tablero",
  // ── Visibilidad del menú ────────────────────────────────────────────────
  // Separados a propósito de los permisos funcionales: apagar un ítem del
  // menú NO debe quitarle capacidades a nadie. Un guía puede necesitar
  // `catalogo.ver` para los cuestionarios y aun así no ver "Mantenimiento
  // Académico" en su barra lateral.
  MENU_CALENDARIO: "menu.calendario",
  MENU_MANTENIMIENTO: "menu.mantenimiento",
  MENU_KIDS: "menu.kids",
  MENU_CONTRATOS: "menu.contratos",
  MENU_RESERVAS: "menu.reservas",
  MENU_USUARIOS: "menu.usuarios",
  MENU_REPORTES: "menu.reportes",
  MENU_AUDITORIA: "menu.auditoria",
  MENU_AVISO_LOGIN: "menu.aviso_login",
  MENU_GUIAS: "menu.guias",
  MENU_MIS_CLASES: "menu.mis_clases",
  MENU_MIS_SALONES: "menu.mis_salones",
  MENU_MIS_NINOS: "menu.mis_ninos",
  SECCION_ACADEMICA: "seccion.academica",
  SECCION_OPERACION: "seccion.operacion",
  SECCION_ADMINISTRACION: "seccion.administracion",
  SECCION_GUIA: "seccion.guia",
  PANEL_ADMINISTRACION: "panel.administracion",
  PANEL_GUIA: "panel.guia",
  PANEL_APODERADO: "panel.apoderado",
  PANEL_ALUMNO: "panel.alumno",
} as const;

export type PermisoCode = (typeof PERMISOS)[keyof typeof PERMISOS];

/** Roles semilla. */
export const ROLES = {
  /**
   * SUPERADMIN: alcance total y sin restricciones — SIEMPRE tiene TODOS los
   * permisos (presentes y futuros) con alcance global. Existe para que
   * `admin` pueda restringirse en el futuro sin perder la llave maestra.
   */
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  COORDINADOR: "coordinador",
  GUIA: "guia",
  APODERADO: "apoderado",
  ALUMNO: "alumno",
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

/** Matriz rol → permisos que el seed materializa. */
export const MATRIZ_ROL_PERMISOS: Record<RoleCode, PermisoCode[]> = {
  superadmin: Object.values(PERMISOS),
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
    PERMISOS.EVENTOS_CREAR,
    PERMISOS.MATRICULAS_GESTIONAR,
    PERMISOS.MATRICULAS_VER,
    PERMISOS.ASISTENCIA_GESTIONAR,
    PERMISOS.ASISTENCIA_VER,
    PERMISOS.EVALUACIONES_GESTIONAR,
    PERMISOS.EVALUACIONES_VER,
    PERMISOS.PROGRESION_VER,
    PERMISOS.REPORTES_VER,
    PERMISOS.ARCHIVOS_GESTIONAR,
    PERMISOS.ARCHIVOS_VER,
    PERMISOS.PANEL_ADMINISTRACION,
    PERMISOS.PANEL_TABLERO,
    PERMISOS.SECCION_ACADEMICA,
    PERMISOS.SECCION_OPERACION,
    PERMISOS.SECCION_ADMINISTRACION,
    PERMISOS.MENU_CALENDARIO,
    PERMISOS.MENU_MANTENIMIENTO,
    PERMISOS.MENU_KIDS,
    PERMISOS.MENU_CONTRATOS,
    PERMISOS.MENU_RESERVAS,
    PERMISOS.MENU_USUARIOS,
    PERMISOS.MENU_REPORTES,
    PERMISOS.MENU_AUDITORIA,
    PERMISOS.MENU_AVISO_LOGIN,
    PERMISOS.MENU_GUIAS,
  ],
  guia: [
    PERMISOS.PANEL_GUIA,
    PERMISOS.PANEL_TABLERO,
    PERMISOS.SECCION_ACADEMICA,
    PERMISOS.SECCION_GUIA,
    PERMISOS.MENU_CALENDARIO,
    PERMISOS.MENU_MIS_CLASES,
    PERMISOS.MENU_MIS_SALONES,
    PERMISOS.MENU_MIS_NINOS,
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

/**
 * Secciones del menú: cada una tiene un permiso PADRE y sus ítems hijos.
 *
 * Quitarle el padre a un rol apaga la sección completa aunque los hijos sigan
 * marcados. La regla se aplica en el servidor igual que en el menú: el permiso
 * de sección se exige ADEMÁS del permiso propio de cada pantalla, nunca en su
 * lugar.
 *
 * Es la ÚNICA fuente de la jerarquía: la usan el sidebar para filtrar y la
 * pantalla de Roles para pintar el árbol de casillas.
 */
export const SECCIONES_MENU: {
  clave: string;
  etiqueta: string;
  permiso: PermisoCode;
  hijos: { etiqueta: string; permiso: PermisoCode }[];
}[] = [
  {
    clave: "tablero",
    etiqueta: "Tablero",
    permiso: PERMISOS.PANEL_TABLERO,
    hijos: [],
  },
  {
    clave: "academica",
    etiqueta: "Académica",
    permiso: PERMISOS.SECCION_ACADEMICA,
    hijos: [
      { etiqueta: "Calendario", permiso: PERMISOS.MENU_CALENDARIO },
      { etiqueta: "Mantenimiento Académico", permiso: PERMISOS.MENU_MANTENIMIENTO },
    ],
  },
  {
    clave: "operacion",
    etiqueta: "Operación",
    permiso: PERMISOS.SECCION_OPERACION,
    hijos: [
      { etiqueta: "Kids", permiso: PERMISOS.MENU_KIDS },
      { etiqueta: "Contratos", permiso: PERMISOS.MENU_CONTRATOS },
      { etiqueta: "Reservas (LGS)", permiso: PERMISOS.MENU_RESERVAS },
    ],
  },
  {
    clave: "administracion",
    etiqueta: "Administración",
    permiso: PERMISOS.SECCION_ADMINISTRACION,
    hijos: [
      { etiqueta: "Usuarios y roles", permiso: PERMISOS.MENU_USUARIOS },
      { etiqueta: "Reportes", permiso: PERMISOS.MENU_REPORTES },
      { etiqueta: "Auditoría", permiso: PERMISOS.MENU_AUDITORIA },
      { etiqueta: "Guías", permiso: PERMISOS.MENU_GUIAS },
      { etiqueta: "Aviso de login", permiso: PERMISOS.MENU_AVISO_LOGIN },
    ],
  },
  {
    clave: "guia",
    etiqueta: "Guía",
    permiso: PERMISOS.SECCION_GUIA,
    hijos: [
      { etiqueta: "Mis clases", permiso: PERMISOS.MENU_MIS_CLASES },
      { etiqueta: "Mis salones", permiso: PERMISOS.MENU_MIS_SALONES },
      { etiqueta: "Mis niños", permiso: PERMISOS.MENU_MIS_NINOS },
    ],
  },
];
