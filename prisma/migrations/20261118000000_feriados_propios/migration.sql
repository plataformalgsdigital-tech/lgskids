-- Feriados propios (Académica › Sesiones › Feriados, 2026-11-18).
--
-- Un feriado propio es una fila más de `scheduling_holiday` con fuente 'MANUAL':
-- no hay tabla nueva. Lo único que se agrega es la opción de pantalla que permite
-- crearlos y quitarlos (producción no corre el seed). "Ver" ya existía
-- (`op.sesiones.feriados`).
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'op.sesiones.feriados_crear', 'Feriados: crear y quitar feriados propios', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code = 'salones.gestionar'
  JOIN access_permission po ON po.code = 'op.sesiones.feriados_crear'
ON CONFLICT DO NOTHING;
