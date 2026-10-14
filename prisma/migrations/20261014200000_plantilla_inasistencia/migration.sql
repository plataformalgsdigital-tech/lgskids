-- Plantilla del aviso de inasistencia (2026-10-14): la propone Servicio ›
-- Asistencia al escribirle a la familia de un niño AUSENTE. Quien envía puede
-- editar el texto antes; el contenido se cambia en Administración › Mensajes.
-- `{{fecha}}` es la fecha de la sesión ("jueves 12 de octubre").
INSERT INTO "notifications_plantilla" (id, slug, nombre, descripcion, contenido) VALUES
    (gen_random_uuid(), 'inasistencia-kids', 'Aviso de inasistencia',
     'Servicio › Asistencia: a la familia de un niño que no asistió a su sesión.',
     E'¡Hola {{apoderado}}! 👋 Te escribimos de *LGS Kids*.\n\nNotamos que *{{nombre}}* no asistió a su sesión del {{fecha}} ({{salon}}). ¿Está todo bien?\n\nSi hubo algún inconveniente, cuéntanos por este medio para registrarlo. ¡Lo esperamos en la próxima sesión! 🚀')
ON CONFLICT (slug) DO NOTHING;
