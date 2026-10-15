-- Menú: "Guías" pasa de Administración a Académica (2026-10-15). El ítem
-- ahora cuelga de `seccion.academica`: quien hoy lo ve (tiene `menu.guias`)
-- recibe esa sección para no perderlo. Solo AÑADE y es idempotente.
INSERT INTO access_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, ps.id
  FROM access_role_permission rp
  JOIN access_permission pg ON pg.id = rp.permission_id AND pg.code = 'menu.guias'
  JOIN access_permission ps ON ps.code = 'seccion.academica'
ON CONFLICT DO NOTHING;
