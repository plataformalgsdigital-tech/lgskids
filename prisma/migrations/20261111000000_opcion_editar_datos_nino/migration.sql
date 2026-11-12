-- Editar los datos del niño y de su apoderado desde su ficha (Operación › Kids,
-- 2026-11-11). Opción de pantalla con base `personas.gestionar`: se concede a
-- quien la tiene (producción no corre el seed).
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'op.kids.editar_datos', 'Editar datos del niño y del apoderado', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code = 'personas.gestionar'
  JOIN access_permission po ON po.code = 'op.kids.editar_datos'
ON CONFLICT DO NOTHING;