/**
 * Menú lateral del panel: secciones, su permiso PADRE y sus ítems. Vive fuera
 * del layout (que es JSX) para que `menu.test.ts` pueda comprobar que cada
 * sección e ítem tiene sus permisos y que coincide con `SECCIONES_MENU` del
 * módulo access, que es lo que pinta el árbol de casillas en Roles.
 */

// El orden y el permiso PADRE de cada sección los define el módulo access
// (SECCIONES_MENU), que es la única fuente de la jerarquía.
export const SECCIONES = [
  "Tablero",
  "Académica",
  "Operación",
  "Servicio",
  "Administración",
  "Guía",
] as const;

/** Permiso padre por sección: sin él, la sección no se dibuja. */
export const PERMISO_SECCION: Record<(typeof SECCIONES)[number], string> = {
  Tablero: "panel.tablero",
  Académica: "seccion.academica",
  Operación: "seccion.operacion",
  Servicio: "seccion.servicio",
  Administración: "seccion.administracion",
  Guía: "seccion.guia",
};

export const MENU: {
  seccion: (typeof SECCIONES)[number];
  /** Permiso de VISIBILIDAD del ítem: apagarlo lo oculta sin quitar capacidades. */
  permisoMenu?: string;
  permiso: string;
  etiqueta: string;
  color: string;
  href?: string;
  pronto?: boolean;
  /**
   * Solo para el ROL superadmin, no para un permiso. Lo usa la base de datos,
   * que abre TODAS las tablas: si colgara de una casilla marcable, cualquiera
   * con `roles.asignar` podría dársela a sí mismo.
   */
  soloSuperadmin?: boolean;
}[] = [
  // ── Tablero: pantalla de entrada, encima de todo ──────────
  {
    seccion: "Tablero",
    permiso: "panel.tablero",
    etiqueta: "Tablero",
    color: "var(--lgs-purpura)",
    href: "/panel/tablero",
  },
  // ── Académica (Campañas y Horarios viven dentro de Mantenimiento Académico) ──
  {
    seccion: "Académica",
    permiso: "salones.ver",
    etiqueta: "Calendario",
    color: "var(--lgs-verde)",
    href: "/panel/calendario",
    permisoMenu: "menu.calendario",
  },
  {
    seccion: "Académica",
    // La ACCIÓN es de coordinación (`salones.gestionar`); el guía solicita el
    // refuerzo desde el modal de la sesión, no desde aquí.
    permiso: "salones.gestionar",
    etiqueta: "Sesiones",
    color: "var(--lgs-azul)",
    href: "/panel/sesiones",
    permisoMenu: "menu.sesiones",
  },
  {
    seccion: "Académica",
    permiso: "catalogo.ver",
    etiqueta: "Mantenimiento Académico",
    color: "var(--lgs-purpura)",
    href: "/panel/mantenimiento-cursos",
    permisoMenu: "menu.mantenimiento",
  },
  // ── Operación ──────────────────────────────────────────────
  {
    seccion: "Operación",
    permiso: "personas.ver",
    etiqueta: "Kids",
    color: "var(--lgs-cian)",
    href: "/panel/personas",
    permisoMenu: "menu.kids",
  },
  {
    seccion: "Operación",
    permiso: "contratos.ver",
    etiqueta: "Contratos",
    color: "var(--lgs-magenta)",
    href: "/panel/contratos",
    permisoMenu: "menu.contratos",
  },
  {
    seccion: "Operación",
    permiso: "contratos.gestionar",
    etiqueta: "Gestión de Reservas",
    color: "var(--lgs-purpura)",
    href: "/panel/reservas",
    permisoMenu: "menu.reservas",
  },
  // ── Servicio (atención a las familias). Las que aún no tienen pantalla
  //    abren la página "en construcción" (`servicio/[opcion]`). ──────────
  {
    seccion: "Servicio",
    permiso: "personas.ver",
    etiqueta: "Welcome",
    color: "var(--lgs-verde)",
    href: "/panel/servicio/welcome",
    permisoMenu: "menu.servicio_welcome",
  },
  {
    seccion: "Servicio",
    // La consulta exige además `personas.ver` en el servidor (ver la ruta).
    permiso: "asistencia.ver",
    etiqueta: "Asistencia",
    color: "var(--lgs-azul)",
    href: "/panel/servicio/asistencia",
    permisoMenu: "menu.servicio_asistencia",
  },
  {
    seccion: "Servicio",
    permiso: "personas.ver",
    etiqueta: "Sesiones",
    color: "var(--lgs-cian)",
    href: "/panel/servicio/sesiones",
    permisoMenu: "menu.servicio_sesiones",
  },
  {
    seccion: "Servicio",
    permiso: "personas.ver",
    etiqueta: "Usuarios sin perfil creado",
    color: "var(--lgs-magenta)",
    href: "/panel/servicio/sin-perfil",
    permisoMenu: "menu.sin_perfil",
  },
  {
    seccion: "Servicio",
    permiso: "personas.ver",
    etiqueta: "Casos de atención",
    color: "var(--lgs-amarillo)",
    href: "/panel/servicio/casos-atencion",
    permisoMenu: "menu.servicio_casos",
  },
  {
    seccion: "Servicio",
    permiso: "personas.ver",
    etiqueta: "Reactivados",
    color: "var(--lgs-purpura)",
    href: "/panel/servicio/reactivados",
    permisoMenu: "menu.servicio_reactivados",
  },
  // ── Administración ─────────────────────────────────────────
  {
    seccion: "Administración",
    permiso: "usuarios.gestionar",
    etiqueta: "Usuarios y roles",
    color: "var(--lgs-cian)",
    href: "/panel/usuarios",
    permisoMenu: "menu.usuarios",
  },
  {
    seccion: "Administración",
    permiso: "usuarios.gestionar",
    permisoMenu: "menu.guias",
    etiqueta: "Guías",
    color: "var(--lgs-amarillo)",
    href: "/panel/guias",
  },
  {
    seccion: "Administración",
    permiso: "reportes.ver",
    etiqueta: "Reportes",
    color: "var(--lgs-purpura)",
    href: "/panel/reportes",
    permisoMenu: "menu.reportes",
  },
  {
    seccion: "Administración",
    permiso: "auditoria.ver",
    etiqueta: "Auditoría",
    color: "var(--lgs-verde)",
    href: "/panel/auditoria",
    permisoMenu: "menu.auditoria",
  },
  {
    seccion: "Administración",
    permiso: "catalogo.gestionar",
    etiqueta: "Aviso de login",
    color: "var(--lgs-amarillo)",
    href: "/panel/aviso-login",
    permisoMenu: "menu.aviso_login",
  },
  {
    seccion: "Administración",
    permiso: "catalogo.gestionar",
    etiqueta: "Mantenimiento",
    color: "var(--lgs-azul)",
    href: "/panel/mantenimiento",
    permisoMenu: "menu.mantenimiento_admin",
  },
  {
    seccion: "Administración",
    permiso: "mensajes.enviar",
    etiqueta: "Mensajes",
    color: "var(--lgs-verde)",
    href: "/panel/mensajes",
    permisoMenu: "menu.mensajes",
  },
  {
    seccion: "Administración",
    // `permiso` queda como red: quien la ve es superadmin, que los tiene todos.
    permiso: "auditoria.ver",
    etiqueta: "Base de datos",
    color: "var(--lgs-rosa)",
    href: "/panel/base-datos",
    soloSuperadmin: true,
  },
  // ── Guía (restringido a sus salones/sesiones/niños) ────────
  {
    seccion: "Guía",
    permiso: "panel.guia",
    etiqueta: "Mis clases",
    color: "var(--lgs-verde)",
    href: "/panel/mis-clases",
    permisoMenu: "menu.mis_clases",
  },
  {
    seccion: "Guía",
    permiso: "panel.guia",
    etiqueta: "Mis salones",
    color: "var(--lgs-amarillo)",
    href: "/panel/mis-salones",
    permisoMenu: "menu.mis_salones",
  },
  {
    seccion: "Guía",
    permiso: "panel.guia",
    etiqueta: "Mis niños",
    color: "var(--lgs-magenta)",
    href: "/panel/mis-ninos",
    permisoMenu: "menu.mis_ninos",
  },
];
