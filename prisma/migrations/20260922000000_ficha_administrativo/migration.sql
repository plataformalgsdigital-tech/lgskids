-- Gestión de usuarios por TIPO (2026-09-22).

-- La ficha del personal administrativo gana el número de identificación, como
-- el alta de MOSAICO. El resto de sus datos ya estaba (nombres, apellidos,
-- teléfono) y el correo vive en la cuenta (`identity_user.email`).
ALTER TABLE "identity_perfil" ADD COLUMN "doc_numero" TEXT;

-- Un correo REAL no se repite entre cuentas: dos cuentas con el mismo correo
-- son la misma persona dada de alta dos veces. Los correos SINTÉTICOS de los
-- alumnos quedan fuera (son únicos por construcción, derivan del usuario) y
-- los hermanos siguen pudiendo compartir el correo del apoderado, que vive en
-- `people_person`, no en la cuenta.
CREATE UNIQUE INDEX "identity_user_email_real_unico"
  ON "identity_user" (LOWER("email"))
  WHERE "email" IS NOT NULL AND NOT "email_sintetico";
