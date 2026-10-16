-- OPCIONES de cada pantalla (2026-10-15): el TERCER nivel del árbol de
-- permisos (sección → opción del menú → vistas, pestañas, tarjetas y acciones).
-- Generada desde src/modules/access/domain/opciones.ts: cada opción se crea y
-- se le da a los roles que YA tienen su permiso base, así que nadie pierde
-- nada; desde aquí se puede quitar acción por acción en Roles y permisos.
-- Solo AÑADE y es idempotente.

INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'op.calendario.vista_mes', 'Vista Calendario (mes)', now()),
    (gen_random_uuid(), 'op.calendario.vista_agenda', 'Vista Agenda (día)', now()),
    (gen_random_uuid(), 'op.calendario.vista_lista', 'Lista de salones', now()),
    (gen_random_uuid(), 'op.calendario.evento_academico', 'Evento académico: crear, editar y borrar (sesión extra, club, taller, Welcome)', now()),
    (gen_random_uuid(), 'op.calendario.evento_admin', 'Evento administrativo: crear y editar', now()),
    (gen_random_uuid(), 'op.calendario.salon_crear', 'Crear salón', now()),
    (gen_random_uuid(), 'op.calendario.salon_editar', 'Editar salón (cupo, guía, activar/desactivar) y eliminarlo', now()),
    (gen_random_uuid(), 'op.calendario.regenerar', 'Regenerar sesiones del salón', now()),
    (gen_random_uuid(), 'op.calendario.cambiar_guia', 'Cambiar el guía de una sesión', now()),
    (gen_random_uuid(), 'op.calendario.suspender', 'Suspender un día', now()),
    (gen_random_uuid(), 'op.calendario.registrar', 'Registrar (cerrar) la sesión', now()),
    (gen_random_uuid(), 'op.calendario.reabrir', 'Reabrir una sesión registrada', now()),
    (gen_random_uuid(), 'op.calendario.asistencia', 'Pasar lista y marcar asistencia (también en la ficha del niño)', now()),
    (gen_random_uuid(), 'op.calendario.misiones', 'Abrir y cerrar misiones del libro', now()),
    (gen_random_uuid(), 'op.calendario.reportar_caso', 'Reportar caso desde la sesión (Requiere atención)', now()),
    (gen_random_uuid(), 'op.calendario.cancelacion_avisar', 'Avisar cancelación de una sesión', now()),
    (gen_random_uuid(), 'op.calendario.cancelacion_resolver', 'Cancelar o cubrir una sesión (y resolver avisos)', now()),
    (gen_random_uuid(), 'op.calendario.welcome_asistencia', 'Pasar lista del Welcome', now()),
    (gen_random_uuid(), 'op.calendario.contenido', 'Pestañas Libros, Material y Recursos', now()),
    (gen_random_uuid(), 'op.calendario.cuestionario', 'Registrar cuestionarios', now()),
    (gen_random_uuid(), 'op.sesiones.refuerzos', 'Refuerzos: ver y autorizar', now()),
    (gen_random_uuid(), 'op.sesiones.cancelaciones', 'Cancelaciones (bandeja)', now()),
    (gen_random_uuid(), 'op.sesiones.eventos_admin', 'Eventos administrativos (consulta)', now()),
    (gen_random_uuid(), 'op.sesiones.eventos_admin_lista', 'Pasar lista de eventos administrativos', now()),
    (gen_random_uuid(), 'op.sesiones.suspensiones', 'Suspensiones', now()),
    (gen_random_uuid(), 'op.sesiones.feriados', 'Feriados', now()),
    (gen_random_uuid(), 'op.mant.contenido', 'Gestión de Contenido', now()),
    (gen_random_uuid(), 'op.mant.referencia', 'Referencia de cursos', now()),
    (gen_random_uuid(), 'op.mant.lecciones_editar', 'Crear, editar y borrar lecciones', now()),
    (gen_random_uuid(), 'op.mant.campanias', 'Campañas (consulta)', now()),
    (gen_random_uuid(), 'op.mant.campania_crear', 'Crear campaña', now()),
    (gen_random_uuid(), 'op.mant.campania_editar', 'Editar campaña (nombre y fechas, fin del programa)', now()),
    (gen_random_uuid(), 'op.mant.campania_eliminar', 'Eliminar campaña', now()),
    (gen_random_uuid(), 'op.mant.campania_salones', 'Generar, agregar y eliminar salones de una campaña', now()),
    (gen_random_uuid(), 'op.mant.colisiones', 'Colisiones de guías', now()),
    (gen_random_uuid(), 'op.mant.horarios', 'Horarios (consulta)', now()),
    (gen_random_uuid(), 'op.mant.horarios_editar', 'Crear, editar, activar y eliminar horarios', now()),
    (gen_random_uuid(), 'op.mant.subir_csv', 'Tarjeta Subir curso (CSV)', now()),
    (gen_random_uuid(), 'op.mant.imagenes', 'Imágenes de curso (consulta y descarga)', now()),
    (gen_random_uuid(), 'op.mant.imagenes_subir', 'Subir imágenes de curso', now()),
    (gen_random_uuid(), 'op.mant.material', 'Material del alumno (consulta)', now()),
    (gen_random_uuid(), 'op.mant.material_subir', 'Subir y quitar material del alumno', now()),
    (gen_random_uuid(), 'op.mant.videos', 'Videos del libro (consulta)', now()),
    (gen_random_uuid(), 'op.mant.videos_subir', 'Subir, publicar y borrar videos', now()),
    (gen_random_uuid(), 'op.mant.juegos', 'Enlaces de juegos (consulta)', now()),
    (gen_random_uuid(), 'op.mant.juegos_editar', 'Ubicar los juegos en la lámina', now()),
    (gen_random_uuid(), 'op.mant.mapa', 'Editor de mapa (consulta)', now()),
    (gen_random_uuid(), 'op.mant.mapa_editar', 'Guardar las posiciones del mapa', now()),
    (gen_random_uuid(), 'op.guias.ficha_editar', 'Editar la ficha del guía', now()),
    (gen_random_uuid(), 'op.guias.enlace', 'Generar y revocar el enlace de ficha', now()),
    (gen_random_uuid(), 'op.kids.csv', 'Descargar CSV', now()),
    (gen_random_uuid(), 'op.kids.academic_info', 'Pestaña Academic Info', now()),
    (gen_random_uuid(), 'op.kids.whatsapp_acceso', 'Enviar acceso por WhatsApp', now()),
    (gen_random_uuid(), 'op.kids.enlace_perfil', 'Enviar enlace de perfil (con o sin Welcome)', now()),
    (gen_random_uuid(), 'op.kids.agendar_welcome', 'Agendar o cambiar el Welcome', now()),
    (gen_random_uuid(), 'op.kids.academic_change', 'Academic Change (ajuste de nivel y lección)', now()),
    (gen_random_uuid(), 'op.kids.casos', 'Ver los casos de atención del niño', now()),
    (gen_random_uuid(), 'op.contratos.csv', 'Descargar CSV', now()),
    (gen_random_uuid(), 'op.contratos.aprobar', 'Aprobar contrato (crea la cuenta)', now()),
    (gen_random_uuid(), 'op.contratos.matricular', 'Matricular', now()),
    (gen_random_uuid(), 'op.contratos.cambiar_salon', 'Cambiar de salón', now()),
    (gen_random_uuid(), 'op.contratos.cambiar_curso', 'Cambiar de curso (promover/degradar)', now()),
    (gen_random_uuid(), 'op.contratos.onhold', 'Pausar (OnHold) y reactivar', now()),
    (gen_random_uuid(), 'op.contratos.extender', 'Extender vigencia', now()),
    (gen_random_uuid(), 'op.contratos.inactivar', 'Inactivar contrato', now()),
    (gen_random_uuid(), 'op.reservas.lista', 'Reservas sin aprobar', now()),
    (gen_random_uuid(), 'op.reservas.nueva', 'Nueva reserva', now()),
    (gen_random_uuid(), 'op.servicio.welcome_eventos', 'Eventos Welcome', now()),
    (gen_random_uuid(), 'op.servicio.welcome_reagendamientos', 'Gestión de reagendamientos', now()),
    (gen_random_uuid(), 'op.servicio.welcome_pendientes', 'Pendientes de agendar', now()),
    (gen_random_uuid(), 'op.servicio.welcome_video', 'Video Welcome (consulta)', now()),
    (gen_random_uuid(), 'op.servicio.video_enviar', 'Enviar el video Welcome', now()),
    (gen_random_uuid(), 'op.servicio.video_config', 'Configurar el enlace del video', now()),
    (gen_random_uuid(), 'op.servicio.welcome_csv', 'Descargar CSV', now()),
    (gen_random_uuid(), 'op.servicio.asistencia_csv', 'Descargar CSV', now()),
    (gen_random_uuid(), 'op.servicio.whatsapp_inasistencia', 'WhatsApp al apoderado por inasistencia', now()),
    (gen_random_uuid(), 'op.servicio.justificar', 'Justificar una falta (con soporte)', now()),
    (gen_random_uuid(), 'op.servicio.sesiones_csv', 'Descargar CSV', now()),
    (gen_random_uuid(), 'op.servicio.sin_perfil_csv', 'Descargar CSV', now()),
    (gen_random_uuid(), 'op.casos.adicionar', 'Adicionar caso desde la bandeja', now()),
    (gen_random_uuid(), 'op.casos.asignar', 'Asignar o escalar un caso', now()),
    (gen_random_uuid(), 'op.casos.gestionar', 'Registrar contactos, acuerdo y notas', now()),
    (gen_random_uuid(), 'op.casos.cerrar', 'Cerrar un caso', now()),
    (gen_random_uuid(), 'op.casos.csv', 'Descargar CSV', now()),
    (gen_random_uuid(), 'op.usuarios.tab_usuarios', 'Pestaña Usuarios', now()),
    (gen_random_uuid(), 'op.usuarios.tab_roles', 'Pestaña Roles y permisos (crear roles y editar permisos)', now()),
    (gen_random_uuid(), 'op.usuarios.estudiante', 'Tarjeta Estudiante', now()),
    (gen_random_uuid(), 'op.usuarios.administrativo', 'Crear administrativo', now()),
    (gen_random_uuid(), 'op.usuarios.guia', 'Crear guía y enlace abierto de registro', now()),
    (gen_random_uuid(), 'op.usuarios.consultar', 'Consultar usuarios', now()),
    (gen_random_uuid(), 'op.usuarios.csv', 'Exportar CSV de usuarios', now()),
    (gen_random_uuid(), 'op.usuarios.clave', 'Restablecer clave, "cambiar al entrar" y solicitudes de clave', now()),
    (gen_random_uuid(), 'op.usuarios.editar', 'Editar datos de la cuenta', now()),
    (gen_random_uuid(), 'op.usuarios.estado', 'Inactivar y reactivar cuentas', now()),
    (gen_random_uuid(), 'op.usuarios.eliminar', 'Eliminar cuentas', now()),
    (gen_random_uuid(), 'op.usuarios.roles', 'Asignar y quitar roles a un usuario', now()),
    (gen_random_uuid(), 'op.admin.aviso_login', 'Prender, apagar y cambiar el aviso', now()),
    (gen_random_uuid(), 'op.admin.carga_csv', 'Carga del catálogo Curso (CSV)', now()),
    (gen_random_uuid(), 'op.mensajes.gestion', 'Gestión: enviar mensajes', now()),
    (gen_random_uuid(), 'op.mensajes.historial', 'Historial de envíos', now())
ON CONFLICT (code) DO NOTHING;

-- op.calendario.vista_mes ← salones.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.ver')
  JOIN access_permission po ON po.code = 'op.calendario.vista_mes'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.vista_agenda ← salones.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.ver')
  JOIN access_permission po ON po.code = 'op.calendario.vista_agenda'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.vista_lista ← salones.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.ver')
  JOIN access_permission po ON po.code = 'op.calendario.vista_lista'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.evento_academico ← eventos.crear
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('eventos.crear')
  JOIN access_permission po ON po.code = 'op.calendario.evento_academico'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.evento_admin ← eventos.crear
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('eventos.crear')
  JOIN access_permission po ON po.code = 'op.calendario.evento_admin'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.salon_crear ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.salon_crear'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.salon_editar ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.salon_editar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.regenerar ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.regenerar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.cambiar_guia ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.cambiar_guia'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.suspender ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.suspender'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.registrar ← asistencia.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('asistencia.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.registrar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.reabrir ← asistencia.gestionar + salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('asistencia.gestionar', 'salones.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.reabrir'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 2
ON CONFLICT DO NOTHING;

-- op.calendario.asistencia ← asistencia.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('asistencia.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.asistencia'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.misiones ← asistencia.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('asistencia.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.misiones'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.reportar_caso ← asistencia.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('asistencia.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.reportar_caso'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.cancelacion_avisar ← asistencia.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('asistencia.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.cancelacion_avisar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.cancelacion_resolver ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.cancelacion_resolver'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.welcome_asistencia ← asistencia.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('asistencia.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.welcome_asistencia'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.contenido ← catalogo.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.ver')
  JOIN access_permission po ON po.code = 'op.calendario.contenido'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.calendario.cuestionario ← evaluaciones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('evaluaciones.gestionar')
  JOIN access_permission po ON po.code = 'op.calendario.cuestionario'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.sesiones.refuerzos ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.sesiones.refuerzos'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.sesiones.cancelaciones ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.sesiones.cancelaciones'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.sesiones.eventos_admin ← salones.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.ver')
  JOIN access_permission po ON po.code = 'op.sesiones.eventos_admin'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.sesiones.eventos_admin_lista ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.sesiones.eventos_admin_lista'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.sesiones.suspensiones ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.sesiones.suspensiones'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.sesiones.feriados ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.sesiones.feriados'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.contenido ← catalogo.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.ver')
  JOIN access_permission po ON po.code = 'op.mant.contenido'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.referencia ← catalogo.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.ver')
  JOIN access_permission po ON po.code = 'op.mant.referencia'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.lecciones_editar ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.lecciones_editar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.campanias ← catalogo.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.ver')
  JOIN access_permission po ON po.code = 'op.mant.campanias'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.campania_crear ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.campania_crear'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.campania_editar ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.campania_editar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.campania_eliminar ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.campania_eliminar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.campania_salones ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.campania_salones'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.colisiones ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.colisiones'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.horarios ← salones.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.ver')
  JOIN access_permission po ON po.code = 'op.mant.horarios'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.horarios_editar ← salones.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('salones.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.horarios_editar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.subir_csv ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.subir_csv'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.imagenes ← catalogo.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.ver')
  JOIN access_permission po ON po.code = 'op.mant.imagenes'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.imagenes_subir ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.imagenes_subir'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.material ← catalogo.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.ver')
  JOIN access_permission po ON po.code = 'op.mant.material'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.material_subir ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.material_subir'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.videos ← catalogo.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.ver')
  JOIN access_permission po ON po.code = 'op.mant.videos'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.videos_subir ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.videos_subir'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.juegos ← catalogo.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.ver')
  JOIN access_permission po ON po.code = 'op.mant.juegos'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.juegos_editar ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.juegos_editar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.mapa ← catalogo.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.ver')
  JOIN access_permission po ON po.code = 'op.mant.mapa'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mant.mapa_editar ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.mant.mapa_editar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.guias.ficha_editar ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.guias.ficha_editar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.guias.enlace ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.guias.enlace'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.kids.csv ← personas.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('personas.ver')
  JOIN access_permission po ON po.code = 'op.kids.csv'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.kids.academic_info ← personas.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('personas.ver')
  JOIN access_permission po ON po.code = 'op.kids.academic_info'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.kids.whatsapp_acceso ← mensajes.enviar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('mensajes.enviar')
  JOIN access_permission po ON po.code = 'op.kids.whatsapp_acceso'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.kids.enlace_perfil ← mensajes.enviar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('mensajes.enviar')
  JOIN access_permission po ON po.code = 'op.kids.enlace_perfil'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.kids.agendar_welcome ← matriculas.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('matriculas.gestionar')
  JOIN access_permission po ON po.code = 'op.kids.agendar_welcome'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.kids.academic_change ← matriculas.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('matriculas.gestionar')
  JOIN access_permission po ON po.code = 'op.kids.academic_change'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.kids.casos ← casos.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('casos.ver')
  JOIN access_permission po ON po.code = 'op.kids.casos'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.contratos.csv ← contratos.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('contratos.ver')
  JOIN access_permission po ON po.code = 'op.contratos.csv'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.contratos.aprobar ← contratos.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('contratos.gestionar')
  JOIN access_permission po ON po.code = 'op.contratos.aprobar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.contratos.matricular ← matriculas.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('matriculas.gestionar')
  JOIN access_permission po ON po.code = 'op.contratos.matricular'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.contratos.cambiar_salon ← matriculas.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('matriculas.gestionar')
  JOIN access_permission po ON po.code = 'op.contratos.cambiar_salon'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.contratos.cambiar_curso ← contratos.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('contratos.gestionar')
  JOIN access_permission po ON po.code = 'op.contratos.cambiar_curso'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.contratos.onhold ← contratos.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('contratos.gestionar')
  JOIN access_permission po ON po.code = 'op.contratos.onhold'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.contratos.extender ← contratos.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('contratos.gestionar')
  JOIN access_permission po ON po.code = 'op.contratos.extender'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.contratos.inactivar ← contratos.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('contratos.gestionar')
  JOIN access_permission po ON po.code = 'op.contratos.inactivar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.reservas.lista ← contratos.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('contratos.ver')
  JOIN access_permission po ON po.code = 'op.reservas.lista'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.reservas.nueva ← contratos.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('contratos.gestionar')
  JOIN access_permission po ON po.code = 'op.reservas.nueva'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.welcome_eventos ← personas.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('personas.ver')
  JOIN access_permission po ON po.code = 'op.servicio.welcome_eventos'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.welcome_reagendamientos ← personas.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('personas.ver')
  JOIN access_permission po ON po.code = 'op.servicio.welcome_reagendamientos'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.welcome_pendientes ← personas.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('personas.ver')
  JOIN access_permission po ON po.code = 'op.servicio.welcome_pendientes'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.welcome_video ← personas.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('personas.ver')
  JOIN access_permission po ON po.code = 'op.servicio.welcome_video'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.video_enviar ← mensajes.enviar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('mensajes.enviar')
  JOIN access_permission po ON po.code = 'op.servicio.video_enviar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.video_config ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.servicio.video_config'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.welcome_csv ← personas.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('personas.ver')
  JOIN access_permission po ON po.code = 'op.servicio.welcome_csv'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.asistencia_csv ← asistencia.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('asistencia.ver')
  JOIN access_permission po ON po.code = 'op.servicio.asistencia_csv'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.whatsapp_inasistencia ← mensajes.enviar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('mensajes.enviar')
  JOIN access_permission po ON po.code = 'op.servicio.whatsapp_inasistencia'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.justificar ← asistencia.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('asistencia.gestionar')
  JOIN access_permission po ON po.code = 'op.servicio.justificar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.sesiones_csv ← personas.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('personas.ver')
  JOIN access_permission po ON po.code = 'op.servicio.sesiones_csv'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.servicio.sin_perfil_csv ← personas.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('personas.ver')
  JOIN access_permission po ON po.code = 'op.servicio.sin_perfil_csv'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.casos.adicionar ← casos.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('casos.gestionar')
  JOIN access_permission po ON po.code = 'op.casos.adicionar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.casos.asignar ← casos.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('casos.gestionar')
  JOIN access_permission po ON po.code = 'op.casos.asignar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.casos.gestionar ← casos.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('casos.gestionar')
  JOIN access_permission po ON po.code = 'op.casos.gestionar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.casos.cerrar ← casos.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('casos.gestionar')
  JOIN access_permission po ON po.code = 'op.casos.cerrar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.casos.csv ← casos.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('casos.ver')
  JOIN access_permission po ON po.code = 'op.casos.csv'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.tab_usuarios ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.usuarios.tab_usuarios'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.tab_roles ← roles.asignar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('roles.asignar')
  JOIN access_permission po ON po.code = 'op.usuarios.tab_roles'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.estudiante ← contratos.ver
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('contratos.ver')
  JOIN access_permission po ON po.code = 'op.usuarios.estudiante'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.administrativo ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.usuarios.administrativo'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.guia ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.usuarios.guia'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.consultar ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.usuarios.consultar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.csv ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.usuarios.csv'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.clave ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.usuarios.clave'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.editar ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.usuarios.editar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.estado ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.usuarios.estado'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.eliminar ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.usuarios.eliminar'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.usuarios.roles ← usuarios.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('usuarios.gestionar')
  JOIN access_permission po ON po.code = 'op.usuarios.roles'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.admin.aviso_login ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.admin.aviso_login'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.admin.carga_csv ← catalogo.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('catalogo.gestionar')
  JOIN access_permission po ON po.code = 'op.admin.carga_csv'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mensajes.gestion ← mensajes.enviar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('mensajes.enviar')
  JOIN access_permission po ON po.code = 'op.mensajes.gestion'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

-- op.mensajes.historial ← mensajes.enviar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code IN ('mensajes.enviar')
  JOIN access_permission po ON po.code = 'op.mensajes.historial'
 GROUP BY rp.role_id, po.id
HAVING count(DISTINCT pb.code) = 1
ON CONFLICT DO NOTHING;

