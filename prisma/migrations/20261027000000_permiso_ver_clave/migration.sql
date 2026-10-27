-- "Ver clave" pasa a ser un permiso marcable (2026-10-27): antes era solo del ROL
-- superadmin. Nace solo en ese rol; para dárselo a otro, un SUPERADMIN lo marca en
-- Usuarios y roles › Roles (la aplicación rechaza que lo marque, lo quite u otorgue
-- un rol que lo tenga quien no sea superadmin).
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'usuarios.ver_clave', 'Ver clave de las cuentas', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM access_role r
  JOIN access_permission p ON p.code = 'usuarios.ver_clave'
 WHERE r.code = 'superadmin'
ON CONFLICT DO NOTHING;
