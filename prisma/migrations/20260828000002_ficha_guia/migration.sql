-- Ficha del GUÍA (2026-08-28): replica el alta de MOSAICO (/nuevo-guia).
--
-- `scheduling_guia` ya existía con el enlace de Zoom; aquí gana el resto del
-- perfil. La CUENTA del guía sigue siendo `identity_user` + rol en
-- `access_user_role`: esta tabla es su ficha operativa, no una segunda
-- identidad.

ALTER TABLE "scheduling_guia"
  ADD COLUMN "nombres"           TEXT,
  ADD COLUMN "apellidos"         TEXT,
  ADD COLUMN "doc_numero"        TEXT,
  ADD COLUMN "email"             TEXT,
  ADD COLUMN "telefono"          TEXT,
  ADD COLUMN "pais"              CHAR(2),
  ADD COLUMN "domicilio"         TEXT,
  ADD COLUMN "fecha_nacimiento"  DATE,
  -- Foto: id en `files_object`. Privada como el resto de archivos.
  ADD COLUMN "foto_file_id"      UUID;

-- Dos guías no pueden compartir sala: el enlace de la clase ES la sala de su
-- guía, así que repetirlo mandaría a dos grupos a la misma reunión.
CREATE UNIQUE INDEX "scheduling_guia_zoom_unico"
  ON "scheduling_guia" (TRIM("zoom_url"))
  WHERE "zoom_url" IS NOT NULL AND TRIM("zoom_url") <> '';
