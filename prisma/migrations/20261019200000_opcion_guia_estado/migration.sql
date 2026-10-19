-- Activar y desactivar al guía desde su ficha (Académica › Guías, 2026-10-19).
-- Opción de pantalla con base `usuarios.gestionar`: se concede a quien la tiene
-- (producción no corre el seed).
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'op.guias.estado', 'Activar y desactivar al guía', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code = 'usuarios.gestionar'
  JOIN access_permission po ON po.code = 'op.guias.estado'
ON CONFLICT DO NOTHING;
