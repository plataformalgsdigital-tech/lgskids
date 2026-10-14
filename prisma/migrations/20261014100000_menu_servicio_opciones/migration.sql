-- Menú › Servicio (2026-10-14): Welcome, Asistencia, Sesiones, Casos de atención
-- y Reactivados. Por ahora abren la página "en construcción"; el permiso de menú
-- existe desde ya para poder apagarlas por rol. Misma regla que la sección: a
-- quien tenga `personas.ver`. Solo AÑADE y es idempotente.
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'menu.servicio_welcome', 'Welcome (Servicio)', now()),
    (gen_random_uuid(), 'menu.servicio_asistencia', 'Asistencia (Servicio)', now()),
    (gen_random_uuid(), 'menu.servicio_sesiones', 'Sesiones (Servicio)', now()),
    (gen_random_uuid(), 'menu.servicio_casos', 'Casos de atención', now()),
    (gen_random_uuid(), 'menu.servicio_reactivados', 'Reactivados', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, pn.id
  FROM access_role_permission rp
  JOIN access_permission ph ON ph.id = rp.permission_id AND ph.code = 'personas.ver'
  JOIN access_permission pn ON pn.code IN (
       'menu.servicio_welcome', 'menu.servicio_asistencia', 'menu.servicio_sesiones',
       'menu.servicio_casos', 'menu.servicio_reactivados')
ON CONFLICT DO NOTHING;
