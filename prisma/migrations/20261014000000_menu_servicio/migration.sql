-- Menú: sección SERVICIO (2026-10-14) con su primer ítem, "Usuarios sin perfil
-- creado". Producción no corre el seed, así que los permisos se crean y se
-- conceden aquí, con la misma regla que el seed: solo AÑADE y es idempotente.
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'seccion.servicio', 'Sección Servicio (menú)', now()),
    (gen_random_uuid(), 'menu.sin_perfil', 'Usuarios sin perfil creado', now())
ON CONFLICT (code) DO NOTHING;

-- Quien ya ve a los niños (`personas.ver`) ve la sección y el ítem. El guía no
-- tiene `personas.ver`, así que no la recibe.
INSERT INTO access_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, pn.id
  FROM access_role_permission rp
  JOIN access_permission ph ON ph.id = rp.permission_id AND ph.code = 'personas.ver'
  JOIN access_permission pn ON pn.code IN ('seccion.servicio', 'menu.sin_perfil')
ON CONFLICT DO NOTHING;
