import { BASE_DE_OPCION, CODIGOS_OP, OPCIONES_MENU, type OpCode } from "./opciones";

/**
 * Catálogo de permisos de la plataforma (Fase 3). Crece por fase.
 * El seed los inserta; el código los referencia SOLO por estas constantes.
 * Las OPCIONES de cada pantalla (`op.*`, tercer nivel del árbol) viven en
 * `opciones.ts`.
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
  /** WhatsApp a los apoderados: Gestión y el botón de credenciales de la ficha. */
  MENSAJES_ENVIAR: "mensajes.enviar",
  MENSAJES_PLANTILLAS: "mensajes.plantillas",
  /**
   * "Solicitar repetir sesión" del modal de la sesión (2026-10-14). Por decisión
   * del negocio, por ahora SOLO superadmin: la migración se lo da solo a ese rol
   * y la matriz del seed no se lo da al admin. Se otorga a otro rol en el panel.
   */
  SESIONES_SOLICITAR_REPETICION: "sesiones.solicitar_repeticion",
  /** Servicio › Casos de atención: ver la bandeja y los casos. */
  CASOS_VER: "casos.ver",
  /** Asignar, contactar, anotar, cerrar y abrir casos desde la bandeja. */
  CASOS_GESTIONAR: "casos.gestionar",
  // ── Visibilidad del menú ────────────────────────────────────────────────
  // Separados a propósito de los permisos funcionales: apagar un ítem del
  // menú NO debe quitarle capacidades a nadie. Un guía puede necesitar
  // `catalogo.ver` para los cuestionarios y aun así no ver "Mantenimiento
  // Académico" en su barra lateral.
  MENU_CALENDARIO: "menu.calendario",
  MENU_SESIONES: "menu.sesiones",
  MENU_MANTENIMIENTO: "menu.mantenimiento",
  MENU_KIDS: "menu.kids",
  MENU_CONTRATOS: "menu.contratos",
  MENU_RESERVAS: "menu.reservas",
  MENU_USUARIOS: "menu.usuarios",
  MENU_REPORTES: "menu.reportes",
  MENU_AUDITORIA: "menu.auditoria",
  MENU_AVISO_LOGIN: "menu.aviso_login",
  /** Administración › Mantenimiento: cargas masivas (hoy, el catálogo Curso por CSV). */
  MENU_MANTENIMIENTO_ADMIN: "menu.mantenimiento_admin",
  MENU_MENSAJES: "menu.mensajes",
  MENU_GUIAS: "menu.guias",
  MENU_MIS_CLASES: "menu.mis_clases",
  MENU_MIS_SALONES: "menu.mis_salones",
  MENU_MIS_NINOS: "menu.mis_ninos",
  /** Servicio › Usuarios sin perfil creado. */
  MENU_SIN_PERFIL: "menu.sin_perfil",
  MENU_SERVICIO_WELCOME: "menu.servicio_welcome",
  MENU_SERVICIO_ASISTENCIA: "menu.servicio_asistencia",
  MENU_SERVICIO_JUSTIFICACION: "menu.servicio_justificacion",
  MENU_SERVICIO_SESIONES: "menu.servicio_sesiones",
  MENU_SERVICIO_CASOS: "menu.servicio_casos",
  MENU_SERVICIO_REACTIVADOS: "menu.servicio_reactivados",
  SECCION_ACADEMICA: "seccion.academica",
  SECCION_OPERACION: "seccion.operacion",
  SECCION_SERVICIO: "seccion.servicio",
  SECCION_ADMINISTRACION: "seccion.administracion",
  SECCION_GUIA: "seccion.guia",
  PANEL_ADMINISTRACION: "panel.administracion",
  PANEL_GUIA: "panel.guia",
  PANEL_APODERADO: "panel.apoderado",
  PANEL_ALUMNO: "panel.alumno",
} as const;

/** Un permiso del catálogo: los funcionales, los de menú y las opciones `op.*`. */
export type PermisoCode = (typeof PERMISOS)[keyof typeof PERMISOS] | OpCode;

/**
 * La matriz de un rol más las opciones `op.*` cuya base ya tiene: una opción
 * solo afina lo que el permiso funcional daba, así que el rol que puede hacer
 * algo recibe también su opción.
 */
function conOpciones(permisos: PermisoCode[]): PermisoCode[] {
  const tiene = new Set<string>(permisos);
  return [
    ...permisos,
    ...CODIGOS_OP.filter((c) => (BASE_DE_OPCION.get(c) ?? []).every((b) => tiene.has(b))),
  ];
}

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

/**
 * Qué hace falta para OTORGAR un rol, sea al crear la cuenta o después.
 *
 * Antes bastaba `usuarios.gestionar` para crear una cuenta con CUALQUIER rol
 * inicial: un coordinador (que no tiene `roles.asignar`) podía fabricarse un
 * admin o un superadmin llamando a la API. Y cualquiera con `roles.asignar`
 * (un admin) podía otorgar la llave maestra.
 * - superadmin → solo otro superadmin.
 * - guía → basta `usuarios.gestionar`: coordinación da de alta a sus guías.
 * - todo lo demás (admin, coordinador, alumno, apoderado y los roles creados
 *   en el panel) → `roles.asignar`.
 */
export type RequisitoOtorgar = "superadmin" | "roles.asignar" | "usuarios.gestionar";

export function requisitoParaOtorgar(roleCode: string): RequisitoOtorgar {
  if (roleCode === ROLES.SUPERADMIN) return "superadmin";
  if (roleCode === ROLES.GUIA) return "usuarios.gestionar";
  return "roles.asignar";
}

/**
 * Qué hace falta para administrar la CUENTA de otro (restablecer su clave,
 * prender o apagar "debe cambiar clave"): tanto como para otorgarle su rol
 * más alto. Si no, un coordinador podría restablecer la clave de un admin y
 * entrar como él.
 */
export function requisitoParaGestionarCuenta(rolesDelOtro: readonly string[]): RequisitoOtorgar {
  if (rolesDelOtro.includes(ROLES.SUPERADMIN)) return "superadmin";
  if (rolesDelOtro.some((r) => r === ROLES.ADMIN || r === ROLES.COORDINADOR)) {
    return "roles.asignar";
  }
  return "usuarios.gestionar";
}

/** Matriz rol → permisos que el seed materializa. */
export const MATRIZ_ROL_PERMISOS: Record<RoleCode, PermisoCode[]> = {
  superadmin: [...Object.values(PERMISOS), ...CODIGOS_OP],
  // Todo, salvo lo que el negocio reservó por ahora al superadmin.
  admin: [
    ...Object.values(PERMISOS).filter((p) => p !== PERMISOS.SESIONES_SOLICITAR_REPETICION),
    ...CODIGOS_OP,
  ],
  coordinador: conOpciones([
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
    PERMISOS.SECCION_SERVICIO,
    PERMISOS.SECCION_ADMINISTRACION,
    PERMISOS.MENU_SIN_PERFIL,
    PERMISOS.MENU_SERVICIO_WELCOME,
    PERMISOS.MENU_SERVICIO_ASISTENCIA,
    PERMISOS.MENU_SERVICIO_JUSTIFICACION,
    PERMISOS.MENU_SERVICIO_SESIONES,
    PERMISOS.MENU_SERVICIO_CASOS,
    PERMISOS.MENU_SERVICIO_REACTIVADOS,
    PERMISOS.MENU_CALENDARIO,
    PERMISOS.MENU_SESIONES,
    PERMISOS.MENU_MANTENIMIENTO,
    PERMISOS.MENU_KIDS,
    PERMISOS.MENU_CONTRATOS,
    PERMISOS.MENU_RESERVAS,
    PERMISOS.MENU_USUARIOS,
    PERMISOS.MENU_REPORTES,
    PERMISOS.MENU_AUDITORIA,
    PERMISOS.MENU_AVISO_LOGIN,
    PERMISOS.MENU_MANTENIMIENTO_ADMIN,
    PERMISOS.MENU_GUIAS,
    PERMISOS.MENSAJES_ENVIAR,
    PERMISOS.MENSAJES_PLANTILLAS,
    PERMISOS.MENU_MENSAJES,
    PERMISOS.CASOS_VER,
    PERMISOS.CASOS_GESTIONAR,
  ]),
  guia: conOpciones([
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
  ]),
  apoderado: [PERMISOS.PANEL_APODERADO],
  alumno: [PERMISOS.PANEL_ALUMNO],
};

/**
 * Secciones del menú: cada una tiene un permiso PADRE y sus ítems hijos.
 *
 * Quitarle el padre a un rol apaga la sección completa aunque los hijos sigan
 * marcados. `seccion.*` y `menu.*` son de VISIBILIDAD (el menú lateral); lo
 * que el servidor exige es el permiso funcional de cada endpoint y, en las
 * acciones, su opción `op.*` (tercer nivel, `opciones.ts`).
 *
 * Es la ÚNICA fuente de la jerarquía: la usan el sidebar para filtrar y la
 * pantalla de Roles para pintar el árbol de casillas.
 */
const SECCIONES_BASE: {
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
      { etiqueta: "Sesiones", permiso: PERMISOS.MENU_SESIONES },
      { etiqueta: "Mantenimiento Académico", permiso: PERMISOS.MENU_MANTENIMIENTO },
      { etiqueta: "Guías", permiso: PERMISOS.MENU_GUIAS },
    ],
  },
  {
    clave: "operacion",
    etiqueta: "Operación",
    permiso: PERMISOS.SECCION_OPERACION,
    hijos: [
      { etiqueta: "Kids", permiso: PERMISOS.MENU_KIDS },
      { etiqueta: "Contratos", permiso: PERMISOS.MENU_CONTRATOS },
      { etiqueta: "Gestión de Reservas", permiso: PERMISOS.MENU_RESERVAS },
    ],
  },
  {
    clave: "servicio",
    etiqueta: "Servicio",
    permiso: PERMISOS.SECCION_SERVICIO,
    hijos: [
      { etiqueta: "Welcome", permiso: PERMISOS.MENU_SERVICIO_WELCOME },
      { etiqueta: "Asistencia", permiso: PERMISOS.MENU_SERVICIO_ASISTENCIA },
      { etiqueta: "Justificación falta", permiso: PERMISOS.MENU_SERVICIO_JUSTIFICACION },
      { etiqueta: "Sesiones", permiso: PERMISOS.MENU_SERVICIO_SESIONES },
      { etiqueta: "Usuarios sin perfil creado", permiso: PERMISOS.MENU_SIN_PERFIL },
      { etiqueta: "Casos de atención", permiso: PERMISOS.MENU_SERVICIO_CASOS },
      { etiqueta: "Reactivados", permiso: PERMISOS.MENU_SERVICIO_REACTIVADOS },
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
      { etiqueta: "Aviso de login", permiso: PERMISOS.MENU_AVISO_LOGIN },
      { etiqueta: "Mantenimiento", permiso: PERMISOS.MENU_MANTENIMIENTO_ADMIN },
      { etiqueta: "Mensajes", permiso: PERMISOS.MENU_MENSAJES },
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

/**
 * El árbol COMPLETO, de tres niveles: cada opción del menú lleva debajo las
 * opciones de su pantalla (`opciones.ts`). Es lo que pinta Roles.
 */
export const SECCIONES_MENU: {
  clave: string;
  etiqueta: string;
  permiso: PermisoCode;
  hijos: {
    etiqueta: string;
    permiso: PermisoCode;
    opciones: { etiqueta: string; permiso: string }[];
  }[];
}[] = SECCIONES_BASE.map((s) => ({
  ...s,
  hijos: s.hijos.map((h) => ({
    ...h,
    opciones: OPCIONES_MENU.filter((o) => o.menu === h.permiso).map((o) => ({
      etiqueta: o.etiqueta,
      permiso: o.permiso,
    })),
  })),
}));
