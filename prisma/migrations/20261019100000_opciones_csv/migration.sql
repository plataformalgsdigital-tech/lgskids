-- Descargas CSV nuevas (2026-10-19): salones de una campaña, guías y reservas
-- sin aprobar. Cada una es una opción de pantalla (op.*) que se concede, como
-- las demás, a quien ya tiene su permiso BASE (producción no corre el seed).
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'op.mant.campania_csv', 'Descargar CSV de los salones de la campaña', now()),
    (gen_random_uuid(), 'op.guias.csv', 'Descargar CSV de los guías', now()),
    (gen_random_uuid(), 'op.reservas.csv', 'Descargar CSV de reservas sin aprobar', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id
  JOIN access_permission po ON (po.code, pb.code) IN (
       ('op.mant.campania_csv', 'catalogo.ver'),
       ('op.guias.csv', 'usuarios.gestionar'),
       ('op.reservas.csv', 'contratos.ver'))
ON CONFLICT DO NOTHING;
