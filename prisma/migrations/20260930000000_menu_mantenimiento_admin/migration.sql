-- Administración › Mantenimiento (carga del catálogo Curso por CSV).
--
-- Un permiso de menú nuevo lo crea normalmente el seed, pero en producción el
-- seed NO corre en el despliegue (se corrió una vez, a mano, y crea cuentas
-- con claves que no viven en la app). Sin esta migración el ítem nacería
-- invisible para todos salvo quien tuviera ya el permiso, es decir, nadie.
--
-- Se concede con la MISMA regla que usa el seed: a todo rol que ya tenga
-- `catalogo.gestionar`, que es lo que la pantalla exige para cargar. Solo
-- AÑADE; es idempotente y respeta lo editado en el panel de Roles.

INSERT INTO access_permission (id, code, nombre, updated_at)
VALUES (gen_random_uuid(), 'menu.mantenimiento_admin', 'Mantenimiento (Administración)', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, pn.id
  FROM access_role_permission rp
  JOIN access_permission ph ON ph.id = rp.permission_id AND ph.code = 'catalogo.gestionar'
  JOIN access_permission pn ON pn.code = 'menu.mantenimiento_admin'
ON CONFLICT DO NOTHING;
