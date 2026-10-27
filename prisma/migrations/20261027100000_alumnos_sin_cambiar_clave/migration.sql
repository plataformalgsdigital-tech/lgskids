-- Los ALUMNOS no cambian la clave al entrar (2026-10-27, decisión del negocio):
-- entran con la que reciben. Desde ahora su cuenta nace sin la marca
-- (`provisionarUsuarioAlumno`); aquí se apaga en las que ya existen.
-- Alumno = cuenta ligada a una persona y sin ningún rol que no sea `alumno`
-- (el personal y los guías conservan la marca).
UPDATE identity_user u
   SET debe_cambiar_password = false, updated_at = now()
 WHERE u.debe_cambiar_password
   AND EXISTS (SELECT 1 FROM people_person p WHERE p.user_id = u.id)
   AND NOT EXISTS (
         SELECT 1
           FROM access_user_role ur
           JOIN access_role r ON r.id = ur.role_id
          WHERE ur.user_id = u.id AND r.code <> 'alumno'
       );
