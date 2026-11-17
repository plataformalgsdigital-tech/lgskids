-- Gestión Festivos (Académica › Sesiones, 2026-11-16).
--
-- 1) Por qué se agendó: el cambio temporal que coordinación aprueba cuando el
--    salón de un niño no dicta clase por el feriado de OTRO país.
ALTER TABLE "scheduling_agendado" ADD COLUMN IF NOT EXISTS "motivo" TEXT;

-- 2) Dos opciones de pantalla (producción no corre el seed). "Ver" a quien
--    gestiona salones; "aprobar" a quien gestiona salones Y matrículas (es un
--    agendado: lo que ya exige "Agendar" desde la ficha del niño).
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'op.sesiones.festivos', 'Gestión Festivos: ver los feriados y los niños afectados', now()),
    (gen_random_uuid(), 'op.sesiones.festivos_aprobar', 'Gestión Festivos: aprobar el cambio temporal de sesión', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code = 'salones.gestionar'
  JOIN access_permission po ON po.code = 'op.sesiones.festivos'
ON CONFLICT DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission p1 ON p1.id = rp.permission_id AND p1.code = 'salones.gestionar'
  JOIN access_role_permission rp2 ON rp2.role_id = rp.role_id
  JOIN access_permission p2 ON p2.id = rp2.permission_id AND p2.code = 'matriculas.gestionar'
  JOIN access_permission po ON po.code = 'op.sesiones.festivos_aprobar'
ON CONFLICT DO NOTHING;
