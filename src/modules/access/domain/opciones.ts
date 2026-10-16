/**
 * OPCIONES de cada pantalla del menú (2026-10-15): el TERCER nivel del árbol
 * de permisos — sección (`seccion.*`) → opción del menú (`menu.*`) → vistas,
 * pestañas, tarjetas y acciones dentro de la pantalla (`op.*`).
 *
 * Cada opción declara su BASE: el permiso funcional que la acción ya exigía.
 * Una opción solo cuenta si el rol tiene las DOS cosas (`AccessProfile`), así
 * que marcar una opción nunca da una capacidad que el rol no tenía: solo deja
 * QUITAR, acción por acción, lo que el permiso funcional daba en bloque.
 *
 * Dónde se exige:
 *  - las ACCIONES (escriben algo), en el SERVIDOR, además del permiso
 *    funcional de siempre;
 *  - las VISTAS, pestañas y tarjetas, en la pantalla (como `menu.*`): sus
 *    datos salen de consultas que comparten otras pantallas.
 *
 * Un permiso que ya existía y es justo una de estas acciones (por ejemplo
 * `sesiones.solicitar_repeticion` o `mensajes.plantillas`) se reutiliza: va
 * en el árbol con `base` vacía.
 *
 * Una opción nueva necesita MIGRACIÓN (producción no corre el seed): la crea y
 * se la da a los roles que tienen su base, para que nadie pierda nada.
 */

export interface OpcionMenu {
  /** Código del permiso. */
  permiso: string;
  etiqueta: string;
  /** El `menu.*` de la pantalla donde vive (el padre en el árbol). */
  menu: string;
  /** Permisos funcionales que además tiene que tener el rol. */
  base: readonly string[];
}

// Genérica para conservar el código LITERAL: `OpcionCode` sale de aquí y el
// compilador rechaza una opción mal escrita en el código que la exige.
const op = <P extends string>(
  menu: string,
  permiso: P,
  etiqueta: string,
  base: readonly string[],
): OpcionMenu & { permiso: P } => ({ menu, permiso, etiqueta, base });

export const OPCIONES_MENU = [
  // ── Académica › Calendario ────────────────────────────────────────────
  op("menu.calendario", "op.calendario.vista_mes", "Vista Calendario (mes)", ["salones.ver"]),
  op("menu.calendario", "op.calendario.vista_agenda", "Vista Agenda (día)", ["salones.ver"]),
  op("menu.calendario", "op.calendario.vista_lista", "Lista de salones", ["salones.ver"]),
  op(
    "menu.calendario",
    "op.calendario.evento_academico",
    "Evento académico: crear, editar y borrar (sesión extra, club, taller, Welcome)",
    ["eventos.crear"],
  ),
  op("menu.calendario", "op.calendario.evento_admin", "Evento administrativo: crear y editar", [
    "eventos.crear",
  ]),
  op("menu.calendario", "op.calendario.salon_crear", "Crear salón", ["salones.gestionar"]),
  op(
    "menu.calendario",
    "op.calendario.salon_editar",
    "Editar salón (cupo, guía, activar/desactivar) y eliminarlo",
    ["salones.gestionar"],
  ),
  op("menu.calendario", "op.calendario.regenerar", "Regenerar sesiones del salón", [
    "salones.gestionar",
  ]),
  op("menu.calendario", "op.calendario.cambiar_guia", "Cambiar el guía de una sesión", [
    "salones.gestionar",
  ]),
  op("menu.calendario", "op.calendario.suspender", "Suspender un día", ["salones.gestionar"]),
  op("menu.calendario", "op.calendario.registrar", "Registrar (cerrar) la sesión", [
    "asistencia.gestionar",
  ]),
  op("menu.calendario", "op.calendario.reabrir", "Reabrir una sesión registrada", [
    "asistencia.gestionar",
    "salones.gestionar",
  ]),
  op("menu.calendario", "sesiones.solicitar_repeticion", "Solicitar repetir sesión", []),
  op(
    "menu.calendario",
    "op.calendario.asistencia",
    "Pasar lista y marcar asistencia (también en la ficha del niño)",
    ["asistencia.gestionar"],
  ),
  op("menu.calendario", "op.calendario.misiones", "Abrir y cerrar misiones del libro", [
    "asistencia.gestionar",
  ]),
  op(
    "menu.calendario",
    "op.calendario.reportar_caso",
    "Reportar caso desde la sesión (Requiere atención)",
    ["asistencia.gestionar"],
  ),
  op("menu.calendario", "op.calendario.cancelacion_avisar", "Avisar cancelación de una sesión", [
    "asistencia.gestionar",
  ]),
  op(
    "menu.calendario",
    "op.calendario.cancelacion_resolver",
    "Cancelar o cubrir una sesión (y resolver avisos)",
    ["salones.gestionar"],
  ),
  op("menu.calendario", "op.calendario.welcome_asistencia", "Pasar lista del Welcome", [
    "asistencia.gestionar",
  ]),
  op("menu.calendario", "op.calendario.contenido", "Pestañas Libros, Material y Recursos", [
    "catalogo.ver",
  ]),
  op("menu.calendario", "op.calendario.cuestionario", "Registrar cuestionarios", [
    "evaluaciones.gestionar",
  ]),

  // ── Académica › Sesiones ──────────────────────────────────────────────
  op("menu.sesiones", "op.sesiones.refuerzos", "Refuerzos: ver y autorizar", ["salones.gestionar"]),
  op("menu.sesiones", "op.sesiones.cancelaciones", "Cancelaciones (bandeja)", [
    "salones.gestionar",
  ]),
  op("menu.sesiones", "op.sesiones.eventos_admin", "Eventos administrativos (consulta)", [
    "salones.ver",
  ]),
  op("menu.sesiones", "op.sesiones.eventos_admin_lista", "Pasar lista de eventos administrativos", [
    "salones.gestionar",
  ]),
  op("menu.sesiones", "op.sesiones.suspensiones", "Suspensiones", ["salones.gestionar"]),
  op("menu.sesiones", "op.sesiones.feriados", "Feriados", ["salones.gestionar"]),

  // ── Académica › Mantenimiento Académico ───────────────────────────────
  op("menu.mantenimiento", "op.mant.contenido", "Gestión de Contenido", ["catalogo.ver"]),
  op("menu.mantenimiento", "op.mant.referencia", "Referencia de cursos", ["catalogo.ver"]),
  op("menu.mantenimiento", "op.mant.lecciones_editar", "Crear, editar y borrar lecciones", [
    "catalogo.gestionar",
  ]),
  op("menu.mantenimiento", "op.mant.campanias", "Campañas (consulta)", ["catalogo.ver"]),
  op("menu.mantenimiento", "op.mant.campania_crear", "Crear campaña", ["catalogo.gestionar"]),
  op(
    "menu.mantenimiento",
    "op.mant.campania_editar",
    "Editar campaña (nombre y fechas, fin del programa)",
    ["catalogo.gestionar"],
  ),
  op("menu.mantenimiento", "op.mant.campania_eliminar", "Eliminar campaña", ["catalogo.gestionar"]),
  op(
    "menu.mantenimiento",
    "op.mant.campania_salones",
    "Generar, agregar y eliminar salones de una campaña",
    ["salones.gestionar"],
  ),
  op("menu.mantenimiento", "op.mant.colisiones", "Colisiones de guías", ["salones.gestionar"]),
  op("menu.mantenimiento", "op.mant.horarios", "Horarios (consulta)", ["salones.ver"]),
  op(
    "menu.mantenimiento",
    "op.mant.horarios_editar",
    "Crear, editar, activar y eliminar horarios",
    ["salones.gestionar"],
  ),
  op("menu.mantenimiento", "op.mant.subir_csv", "Tarjeta Subir curso (CSV)", [
    "catalogo.gestionar",
  ]),
  op("menu.mantenimiento", "op.mant.imagenes", "Imágenes de curso (consulta y descarga)", [
    "catalogo.ver",
  ]),
  op("menu.mantenimiento", "op.mant.imagenes_subir", "Subir imágenes de curso", [
    "catalogo.gestionar",
  ]),
  op("menu.mantenimiento", "op.mant.material", "Material del alumno (consulta)", ["catalogo.ver"]),
  op("menu.mantenimiento", "op.mant.material_subir", "Subir y quitar material del alumno", [
    "catalogo.gestionar",
  ]),
  op("menu.mantenimiento", "op.mant.videos", "Videos del libro (consulta)", ["catalogo.ver"]),
  op("menu.mantenimiento", "op.mant.videos_subir", "Subir, publicar y borrar videos", [
    "catalogo.gestionar",
  ]),
  op("menu.mantenimiento", "op.mant.juegos", "Enlaces de juegos (consulta)", ["catalogo.ver"]),
  op("menu.mantenimiento", "op.mant.juegos_editar", "Ubicar los juegos en la lámina", [
    "catalogo.gestionar",
  ]),
  op("menu.mantenimiento", "op.mant.mapa", "Editor de mapa (consulta)", ["catalogo.ver"]),
  op("menu.mantenimiento", "op.mant.mapa_editar", "Guardar las posiciones del mapa", [
    "catalogo.gestionar",
  ]),

  // ── Académica › Guías ─────────────────────────────────────────────────
  op("menu.guias", "op.guias.ficha_editar", "Editar la ficha del guía", ["usuarios.gestionar"]),
  op("menu.guias", "op.guias.enlace", "Generar y revocar el enlace de ficha", [
    "usuarios.gestionar",
  ]),

  // ── Operación › Kids ──────────────────────────────────────────────────
  op("menu.kids", "op.kids.csv", "Descargar CSV", ["personas.ver"]),
  op("menu.kids", "op.kids.academic_info", "Pestaña Academic Info", ["personas.ver"]),
  op("menu.kids", "op.kids.whatsapp_acceso", "Enviar acceso por WhatsApp", ["mensajes.enviar"]),
  op("menu.kids", "op.kids.enlace_perfil", "Enviar enlace de perfil (con o sin Welcome)", [
    "mensajes.enviar",
  ]),
  op("menu.kids", "op.kids.agendar_welcome", "Agendar o cambiar el Welcome", [
    "matriculas.gestionar",
  ]),
  op("menu.kids", "op.kids.academic_change", "Academic management (ajuste de nivel y lección)", [
    "matriculas.gestionar",
  ]),
  op("menu.kids", "op.kids.casos", "Ver los casos de atención del niño", ["casos.ver"]),

  // ── Operación › Contratos ─────────────────────────────────────────────
  op("menu.contratos", "op.contratos.csv", "Descargar CSV", ["contratos.ver"]),
  op("menu.contratos", "op.contratos.aprobar", "Aprobar contrato (crea la cuenta)", [
    "contratos.gestionar",
  ]),
  op("menu.contratos", "op.contratos.matricular", "Matricular", ["matriculas.gestionar"]),
  op("menu.contratos", "op.contratos.cambiar_salon", "Cambiar de salón", ["matriculas.gestionar"]),
  op("menu.contratos", "op.contratos.cambiar_curso", "Cambiar de curso (promover/degradar)", [
    "contratos.gestionar",
  ]),
  op("menu.contratos", "op.contratos.onhold", "Pausar (OnHold) y reactivar", [
    "contratos.gestionar",
  ]),
  op("menu.contratos", "op.contratos.extender", "Extender vigencia", ["contratos.gestionar"]),
  op("menu.contratos", "op.contratos.inactivar", "Inactivar contrato", ["contratos.gestionar"]),

  // ── Operación › Gestión de Reservas ───────────────────────────────────
  op("menu.reservas", "op.reservas.lista", "Reservas sin aprobar", ["contratos.ver"]),
  op("menu.reservas", "op.reservas.nueva", "Nueva reserva", ["contratos.gestionar"]),

  // ── Servicio › Welcome ────────────────────────────────────────────────
  op("menu.servicio_welcome", "op.servicio.welcome_eventos", "Eventos Welcome", ["personas.ver"]),
  op("menu.servicio_welcome", "op.servicio.welcome_reagendamientos", "Gestión de reagendamientos", [
    "personas.ver",
  ]),
  op("menu.servicio_welcome", "op.servicio.welcome_pendientes", "Pendientes de agendar", [
    "personas.ver",
  ]),
  op("menu.servicio_welcome", "op.servicio.welcome_video", "Video Welcome (consulta)", [
    "personas.ver",
  ]),
  op("menu.servicio_welcome", "op.servicio.video_enviar", "Enviar el video Welcome", [
    "mensajes.enviar",
  ]),
  op("menu.servicio_welcome", "op.servicio.video_config", "Configurar el enlace del video", [
    "catalogo.gestionar",
  ]),
  op("menu.servicio_welcome", "op.servicio.welcome_csv", "Descargar CSV", ["personas.ver"]),

  // ── Servicio › Asistencia / Justificación falta ───────────────────────
  op("menu.servicio_asistencia", "op.servicio.asistencia_csv", "Descargar CSV", ["asistencia.ver"]),
  op(
    "menu.servicio_asistencia",
    "op.servicio.whatsapp_inasistencia",
    "WhatsApp al apoderado por inasistencia",
    ["mensajes.enviar"],
  ),
  op(
    "menu.servicio_justificacion",
    "op.servicio.justificar",
    "Justificar una falta (con soporte)",
    ["asistencia.gestionar"],
  ),

  // ── Servicio › Sesiones / Sin perfil ──────────────────────────────────
  op("menu.servicio_sesiones", "op.servicio.sesiones_csv", "Descargar CSV", ["personas.ver"]),
  op("menu.sin_perfil", "op.servicio.sin_perfil_csv", "Descargar CSV", ["personas.ver"]),

  // ── Servicio › Casos de atención ──────────────────────────────────────
  op("menu.servicio_casos", "op.casos.adicionar", "Adicionar caso desde la bandeja", [
    "casos.gestionar",
  ]),
  op("menu.servicio_casos", "op.casos.asignar", "Asignar o escalar un caso", ["casos.gestionar"]),
  op("menu.servicio_casos", "op.casos.gestionar", "Registrar contactos, acuerdo y notas", [
    "casos.gestionar",
  ]),
  op("menu.servicio_casos", "op.casos.cerrar", "Cerrar un caso", ["casos.gestionar"]),
  op("menu.servicio_casos", "op.casos.csv", "Descargar CSV", ["casos.ver"]),

  // ── Administración › Usuarios y roles ─────────────────────────────────
  op("menu.usuarios", "op.usuarios.tab_usuarios", "Pestaña Usuarios", ["usuarios.gestionar"]),
  op(
    "menu.usuarios",
    "op.usuarios.tab_roles",
    "Pestaña Roles y permisos (crear roles y editar permisos)",
    ["roles.asignar"],
  ),
  op("menu.usuarios", "op.usuarios.estudiante", "Tarjeta Estudiante", ["contratos.ver"]),
  op("menu.usuarios", "op.usuarios.administrativo", "Crear administrativo", ["usuarios.gestionar"]),
  op("menu.usuarios", "op.usuarios.guia", "Crear guía y enlace abierto de registro", [
    "usuarios.gestionar",
  ]),
  op("menu.usuarios", "op.usuarios.consultar", "Consultar usuarios", ["usuarios.gestionar"]),
  op("menu.usuarios", "op.usuarios.csv", "Exportar CSV de usuarios", ["usuarios.gestionar"]),
  op(
    "menu.usuarios",
    "op.usuarios.clave",
    'Restablecer clave, "cambiar al entrar" y solicitudes de clave',
    ["usuarios.gestionar"],
  ),
  op("menu.usuarios", "op.usuarios.editar", "Editar datos de la cuenta", ["usuarios.gestionar"]),
  op("menu.usuarios", "op.usuarios.estado", "Inactivar y reactivar cuentas", [
    "usuarios.gestionar",
  ]),
  op("menu.usuarios", "op.usuarios.eliminar", "Eliminar cuentas", ["usuarios.gestionar"]),
  op("menu.usuarios", "op.usuarios.roles", "Asignar y quitar roles a un usuario", [
    "usuarios.gestionar",
  ]),

  // ── Administración › Aviso de login / Mantenimiento / Mensajes ────────
  op("menu.aviso_login", "op.admin.aviso_login", "Prender, apagar y cambiar el aviso", [
    "catalogo.gestionar",
  ]),
  op("menu.mantenimiento_admin", "op.admin.carga_csv", "Carga del catálogo Curso (CSV)", [
    "catalogo.gestionar",
  ]),
  op("menu.mensajes", "op.mensajes.gestion", "Gestión: enviar mensajes", ["mensajes.enviar"]),
  op("menu.mensajes", "op.mensajes.historial", "Historial de envíos", ["mensajes.enviar"]),
  op("menu.mensajes", "mensajes.plantillas", "Crear y editar plantillas", []),
];

/** Los códigos de todas las opciones (`op.*` y los reutilizados). */
export type OpcionCode = (typeof OPCIONES_MENU)[number]["permiso"];
/** Solo las nuevas, las que viven en `access_permission` con prefijo `op.`. */
export type OpCode = Extract<OpcionCode, `op.${string}`>;

/** Base de cada opción NUEVA (`op.*`): lo que además tiene que tener el rol. */
export const BASE_DE_OPCION: ReadonlyMap<string, readonly string[]> = new Map(
  OPCIONES_MENU.filter((o) => o.permiso.startsWith("op.")).map((o) => [o.permiso, o.base]),
);

/** Los códigos `op.*`, para el catálogo y la matriz de roles. */
/**
 * Tope de permisos que acepta guardar UN rol. Era 100, y con las ~100 opciones
 * de pantalla cualquier rol lo pasaba: guardar respondía "La entrada no es
 * válida". `opciones.test.ts` comprueba que el catálogo entero quepa.
 */
export const MAX_PERMISOS_POR_ROL = 1000;

export const CODIGOS_OP: readonly OpCode[] = OPCIONES_MENU.map((o) => o.permiso).filter(
  (c): c is OpCode => c.startsWith("op."),
);

export function esOpcion(code: string): boolean {
  return BASE_DE_OPCION.has(code);
}
