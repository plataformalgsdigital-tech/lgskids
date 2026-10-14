-- "Solicitar repetir sesión" (modal de la sesión) pasa a tener permiso propio
-- (2026-10-14). Por decisión del negocio, POR AHORA solo lo usa el superadmin:
-- se le concede a ese rol y a ninguno más. Para abrirlo a otro rol, se marca
-- en Usuarios y roles.
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'sesiones.solicitar_repeticion', 'Solicitar repetir sesión', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM access_role r
  JOIN access_permission p ON p.code = 'sesiones.solicitar_repeticion'
 WHERE r.code = 'superadmin'
ON CONFLICT DO NOTHING;
