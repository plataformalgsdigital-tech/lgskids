/**
 * MAPA DE LA BASE (2026-10-23): para qué sirve cada tabla y dónde se ve en el
 * panel, agrupadas por TEMA del negocio (no por módulo técnico). Lo usa el
 * explorador (Base de datos) para buscar "¿dónde está la asistencia?" sin abrir
 * las tablas de una en una.
 *
 * Una tabla nueva sin entrada aquí aparece igual, pero sin descripción, y la
 * prueba de integración del explorador lo marca: al crear una tabla, súmala.
 */

export const TEMAS = [
  "Niños y familias",
  "Contratos y matrícula",
  "Calendario y salones",
  "Welcome",
  "Guías",
  "Asistencia y avance",
  "Contenido académico",
  "Mensajes",
  "Casos de atención",
  "Cuentas y permisos",
  "Sistema",
] as const;

export type Tema = (typeof TEMAS)[number];

export interface EntradaMapa {
  tema: Tema;
  /** Para qué sirve, en una frase. */
  para: string;
  /** Dónde se ve o se edita en el panel (si se ve en alguna parte). */
  pantalla: string | null;
}

export const MAPA_TABLAS: Record<string, EntradaMapa> = {
  // —— Niños y familias ——
  people_person: {
    tema: "Niños y familias",
    para: "Toda PERSONA: niños, titulares y apoderados (nombre, documento, país, correo, teléfono, perfil del niño).",
    pantalla: "Operación › Kids (ficha del niño) y Contratos",
  },
  people_guardianship: {
    tema: "Niños y familias",
    para: "Qué apoderado tiene cada niño y su parentesco.",
    pantalla: "Ficha del niño › Apoderados",
  },

  // —— Contratos y matrícula ——
  contracts_contract: {
    tema: "Contratos y matrícula",
    para: "Contratos: titular, niño, país, curso, inicio y fin, estado y N° de LGS.",
    pantalla: "Operación › Contratos y Gestión de Reservas",
  },
  contracts_onhold: {
    tema: "Contratos y matrícula",
    para: "Pausas (OnHold) de un contrato: desde, hasta, motivo y días devueltos.",
    pantalla: "Ficha del contrato › Pausar / Reactivar",
  },
  contracts_extension: {
    tema: "Contratos y matrícula",
    para: "Extensiones de vigencia hechas a mano a un contrato.",
    pantalla: "Ficha del contrato › Extender vigencia",
  },
  contracts_enlace_perfil: {
    tema: "Contratos y matrícula",
    para: "Enlaces de creación de perfil enviados al apoderado (estado, con o sin Welcome).",
    pantalla: "Ficha del niño › Perfil y Welcome · Servicio › Usuarios sin perfil creado",
  },
  enrollment_enrollment: {
    tema: "Contratos y matrícula",
    para: "Matrículas: en qué salón está cada niño (RESERVADA, ACTIVA, FINALIZADA, CANCELADA). La lista del salón sale de aquí.",
    pantalla: "Ficha del niño › Academic Info · cupos de la campaña",
  },

  // —— Calendario y salones ——
  scheduling_classroom: {
    tema: "Calendario y salones",
    para: "Salones: curso, guía, cupo, zona horaria, país de feriados, activo.",
    pantalla: "Académica › Calendario · ficha de la campaña",
  },
  scheduling_slot: {
    tema: "Calendario y salones",
    para: "Horario semanal de cada salón (día, hora, duración, sesión o club).",
    pantalla: "Detalle del salón",
  },
  scheduling_session: {
    tema: "Calendario y salones",
    para: "Cada SESIÓN del calendario (clases, clubes, talleres, extras): fecha, hora, guía efectivo, registro.",
    pantalla: "Académica › Calendario (modal de la sesión)",
  },
  scheduling_holiday: {
    tema: "Calendario y salones",
    para: "Feriados por país que corren las sesiones al final del curso.",
    pantalla: null,
  },
  scheduling_suspension: {
    tema: "Calendario y salones",
    para: "Días suspendidos de un salón, con su motivo.",
    pantalla: "Detalle del salón › Suspender · Servicio › Sesiones",
  },
  scheduling_horario: {
    tema: "Calendario y salones",
    para: "Catálogo de horarios (Salón 01–12 por curso y grupo de país) para crear salones.",
    pantalla: "Mantenimiento Académico › Horarios",
  },
  scheduling_horario_slot: {
    tema: "Calendario y salones",
    para: "Los bloques (día y hora) de cada horario del catálogo.",
    pantalla: "Mantenimiento Académico › Horarios",
  },
  scheduling_tanda_club: {
    tema: "Calendario y salones",
    para: "Tandas de clubs: un Club que se repite cada semana entre un inicio y un final; sus sesiones la referencian (tanda_id).",
    pantalla: "Calendario › Evento académico › Club",
  },
  catalog_libro_voz: {
    tema: "Contenido académico",
    para: "Voces del libro: un audio de ElevenLabs por frase que lee el libro interactivo (por curso·nivel), con quién la dice y su estado (pendiente, generado, error).",
    pantalla: "Mantenimiento Académico › Voces del libro",
  },
  catalog_libro_intervencion: {
    tema: "Contenido académico",
    para: "Frases de los personajes (Simba, Rooky, Dodo, la guía) que aparecen al abrir una página del libro interactivo: instrucciones y ánimo.",
    pantalla: "Mantenimiento Académico › Voces del libro",
  },
  scheduling_link_club: {
    tema: "Calendario y salones",
    para: "Links de Clubes: salas propias de los Clubs (nombre, día de la semana, horario y link), distintas de la del advisor; la sesión del Club la referencia (link_club_id).",
    pantalla: "Sesiones › Links de Clubes",
  },
  scheduling_agendado: {
    tema: "Calendario y salones",
    para: "Niños agendados a una sesión de OTRO salón (recuperación, club, taller abierto).",
    pantalla: "Ficha del niño › Academic management › Agendar",
  },
  scheduling_cancelacion: {
    tema: "Calendario y salones",
    para: "Avisos del guía de que no puede dictar una sesión, y si se canceló o se cubrió.",
    pantalla: "Sesiones › Cancelaciones",
  },
  scheduling_repeticion: {
    tema: "Calendario y salones",
    para: "Solicitudes del guía para repetir una sesión (refuerzos).",
    pantalla: "Sesiones › Refuerzos",
  },
  scheduling_evento_admin: {
    tema: "Calendario y salones",
    para: "Eventos administrativos para guías (reuniones, capacitaciones).",
    pantalla: "Sesiones › Eventos administrativos",
  },
  scheduling_evento_admin_guia: {
    tema: "Calendario y salones",
    para: "Qué guías van a cada evento administrativo y si asistieron.",
    pantalla: "Sesiones › Eventos administrativos",
  },

  // —— Welcome ——
  scheduling_welcome: {
    tema: "Welcome",
    para: "Sesiones Welcome: fecha, guía, nivel, límite y a qué campaña/país/curso/salón aplican.",
    pantalla: "Calendario (eventos verdes) · Servicio › Welcome",
  },
  scheduling_welcome_reserva: {
    tema: "Welcome",
    para: "Qué niño agendó qué Welcome (ACTIVA, REAGENDADA, CANCELADA) y si asistió.",
    pantalla: "Servicio › Welcome · ficha del niño",
  },
  scheduling_welcome_video_envio: {
    tema: "Welcome",
    para: "Envíos del video Welcome a quien faltó a sus dos Welcome.",
    pantalla: "Servicio › Welcome › Video Welcome",
  },

  // —— Guías ——
  scheduling_guia: {
    tema: "Guías",
    para: "Ficha del guía: nombre, documento, contacto, país, sala de Zoom y foto.",
    pantalla: "Académica › Guías",
  },
  scheduling_guia_invitacion: {
    tema: "Guías",
    para: "Enlaces para que el guía complete su ficha (vigente, usado, vencido).",
    pantalla: "Académica › Guías › Enlace de registro",
  },
  reporting_guia_mes: {
    tema: "Guías",
    para: "Estadística mensual congelada de cada guía (sesiones dictadas, canceladas, casos).",
    pantalla: "Administración › Reportes",
  },

  // —— Asistencia y avance ——
  attendance_attendance: {
    tema: "Asistencia y avance",
    para: "Asistencia de cada niño a cada sesión (asistió, ausente, justificado), comentario y nota del guía.",
    pantalla: "Modal de la sesión · Servicio › Asistencia · ficha del niño",
  },
  assessment_attempt: {
    tema: "Asistencia y avance",
    para: "Intentos de cuestionarios (prácticas y Level Up) con su puntaje.",
    pantalla: "Página de asistencia de la sesión",
  },
  progression_level_progress: {
    tema: "Asistencia y avance",
    para: "Avance DERIVADO de cada niño por nivel (no editar: se recalcula solo).",
    pantalla: "Ficha del niño › Academic Info",
  },
  progression_award: {
    tema: "Asistencia y avance",
    para: "Medallas y diplomas ganados (DERIVADOS) y si ya se avisó por WhatsApp.",
    pantalla: "Panel del niño › ¿Cómo voy?",
  },
  progression_ubicacion: {
    tema: "Asistencia y avance",
    para: "Punto de partida fijado por coordinación (nivel y lecciones convalidadas).",
    pantalla: "Academic management › Ajuste",
  },

  // —— Contenido académico ——
  catalog_campaign: {
    tema: "Contenido académico",
    para: "Campañas: nombre, inicio, fin del programa y cierre de ventas.",
    pantalla: "Mantenimiento Académico › Campañas",
  },
  catalog_course: {
    tema: "Contenido académico",
    para: "Los dos cursos de cada campaña (Junior y Youngster) con su inicio y fin.",
    pantalla: "Ficha de la campaña",
  },
  catalog_level: {
    tema: "Contenido académico",
    para: "Los 5 niveles de cada curso (Rookie → Ultimate Stage) y su duración.",
    pantalla: null,
  },
  catalog_lesson: {
    tema: "Contenido académico",
    para: "Las 4 lecciones de práctica de cada nivel por campaña (las que cuenta la progresión).",
    pantalla: null,
  },
  catalog_quiz: {
    tema: "Contenido académico",
    para: "Cuestionarios de práctica y Level Up de cada nivel por campaña.",
    pantalla: "Página de asistencia (cuestionario)",
  },
  catalog_curso: {
    tema: "Contenido académico",
    para: "Catálogo MAESTRO de lecciones (curso·nivel·unidad·lección): temario, actividades, material, evaluaciones.",
    pantalla: "Gestión de Contenido · Referencia curricular · Carga catálogo Curso (CSV)",
  },
  catalog_arte_hotspot: {
    tema: "Contenido académico",
    para: "Posiciones de unidades y premios sobre las islas y el mapa del panel del niño.",
    pantalla: "Mantenimiento Académico › Editor de mapa",
  },
  catalog_mision_autorizada: {
    tema: "Contenido académico",
    para: "Unidades del libro que el guía abrió a cada niño en clase.",
    pantalla: "Modal de la sesión › Misiones",
  },
  catalog_material_video: {
    tema: "Contenido académico",
    para: "Videos del libro interactivo (por curso, nivel y página) y su estado.",
    pantalla: "Mantenimiento Académico › Videos del libro",
  },
  catalog_insignia: {
    tema: "Contenido académico",
    para: "Nombres de las insignias por parada del mapa (del libro retirado; dormida).",
    pantalla: null,
  },
  catalog_libro: {
    tema: "Contenido académico",
    para: "Libro interactivo VIEJO (retirado 2026-09-17): dormida, sin código que la lea.",
    pantalla: null,
  },
  catalog_libro_pagina: {
    tema: "Contenido académico",
    para: "Páginas del libro interactivo viejo (dormida).",
    pantalla: null,
  },
  catalog_libro_audio: {
    tema: "Contenido académico",
    para: "Audios del libro interactivo viejo (dormida).",
    pantalla: null,
  },

  // —— Mensajes ——
  notifications_plantilla: {
    tema: "Mensajes",
    para: "Plantillas de WhatsApp (bienvenida, enlace de perfil, inasistencia, clave…).",
    pantalla: "Administración › Mensajes › Plantillas",
  },
  notifications_outbox: {
    tema: "Mensajes",
    para: "Historial y cola de WhatsApp enviados (a quién, texto, estado, reintentos).",
    pantalla: "Administración › Mensajes › Historial",
  },

  // —— Casos de atención ——
  casos_caso: {
    tema: "Casos de atención",
    para: "Casos de atención: niño, tipo, estado, área, acuerdo y cierre.",
    pantalla: "Servicio › Casos de atención",
  },
  casos_reporte: {
    tema: "Casos de atención",
    para: 'Reportes del guía ("Requiere atención") que abren o se suman a un caso.',
    pantalla: "Servicio › Casos de atención",
  },
  casos_contacto: {
    tema: "Casos de atención",
    para: "Intentos de contacto con la familia en un caso.",
    pantalla: "Ficha del caso",
  },
  casos_seguimiento: {
    tema: "Casos de atención",
    para: "Bitácora del caso: cambios de estado, área, notas y conclusión.",
    pantalla: "Ficha del caso",
  },

  // —— Cuentas y permisos ——
  identity_user: {
    tema: "Cuentas y permisos",
    para: "Cuentas para entrar (usuario, correo, estado, cambiar clave). Las claves no se muestran.",
    pantalla: "Administración › Usuarios y roles › Consultar",
  },
  identity_perfil: {
    tema: "Cuentas y permisos",
    para: "Ficha del personal administrativo (nombre, teléfono, documento).",
    pantalla: "Usuarios y roles › Consultar (editar)",
  },
  identity_solicitud_clave: {
    tema: "Cuentas y permisos",
    para: 'Registro de "¿Olvidaste tu clave?": quién, cuándo, a qué número salió el enlace y cómo se atendió.',
    pantalla: "Usuarios y roles (solicitudes y registro de 60 días)",
  },
  identity_enlace_clave: {
    tema: "Cuentas y permisos",
    para: "Enlaces de un solo uso para elegir clave nueva (vigente, usado, vencido).",
    pantalla: null,
  },
  identity_refresh_token: {
    tema: "Cuentas y permisos",
    para: "Sesiones abiertas (tokens de refresco); revocar = cerrar sesión.",
    pantalla: null,
  },
  identity_login_attempt: {
    tema: "Cuentas y permisos",
    para: "Intentos de entrada (usuario, IP, éxito): frenan los ataques de fuerza bruta.",
    pantalla: null,
  },
  access_role: {
    tema: "Cuentas y permisos",
    para: "Roles (superadmin, admin, coordinador, guía, alumno…).",
    pantalla: "Usuarios y roles › Roles",
  },
  access_permission: {
    tema: "Cuentas y permisos",
    para: "Catálogo de permisos (funcionales, de menú y opciones de pantalla).",
    pantalla: "Usuarios y roles › Roles",
  },
  access_role_permission: {
    tema: "Cuentas y permisos",
    para: "Qué permisos tiene cada rol (las casillas de Roles).",
    pantalla: "Usuarios y roles › Roles",
  },
  access_user_role: {
    tema: "Cuentas y permisos",
    para: "Qué rol tiene cada cuenta y para qué país.",
    pantalla: "Usuarios y roles › Consultar",
  },
  access_country: {
    tema: "Cuentas y permisos",
    para: "Países de la plataforma (CL, CO, EC, PE).",
    pantalla: null,
  },

  // —— Sistema ——
  files_object: {
    tema: "Sistema",
    para: "Todos los ARCHIVOS subidos (fotos, arte, material, soportes): nombre, tipo, dónde están guardados.",
    pantalla: null,
  },
  audit_log: {
    tema: "Sistema",
    para: "Auditoría: quién hizo qué, cuándo y desde qué IP.",
    pantalla: "Administración › Auditoría",
  },
  platform_config: {
    tema: "Sistema",
    para: "Ajustes sueltos (aviso de login, registro abierto de guías, video Welcome…).",
    pantalla: "Aviso de login · Usuarios y roles › Guía · Servicio › Welcome",
  },
  _prisma_migrations: {
    tema: "Sistema",
    para: "Migraciones aplicadas a la base (no tocar).",
    pantalla: null,
  },
};
