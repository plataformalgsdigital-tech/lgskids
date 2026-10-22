-- Contacto REAL del niño y "¿Olvidaste tu clave?" por WhatsApp (2026-10-21).
--
-- 1) El niño usa el correo y el celular de su APODERADO (así viene de LGS). Su
--    cuenta deja el correo inventado (@alumnos.lgskidsplataforma.com) y lleva el
--    de la familia. Los hermanos COMPARTEN ese correo, así que la cuenta lo marca
--    `email_familiar` y el índice de "correo único" no lo cuenta: sigue valiendo
--    solo para el correo PROPIO del personal y de los guías.
ALTER TABLE "identity_user" ADD COLUMN "email_familiar" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX "identity_user_email_real_unico";
CREATE UNIQUE INDEX "identity_user_email_real_unico"
  ON "identity_user" (LOWER("email"))
  WHERE "email" IS NOT NULL AND NOT "email_sintetico" AND NOT "email_familiar";

-- 1a) El registro del niño toma lo que le falte de su apoderado (el primero con
--     teléfono, el mismo orden que usa el envío de WhatsApp).
UPDATE "people_person" n
   SET "email"    = COALESCE(NULLIF(TRIM(n."email"), ''), ap."email"),
       "telefono" = COALESCE(NULLIF(TRIM(n."telefono"), ''), ap."telefono"),
       "updated_at" = now()
  FROM (
    SELECT DISTINCT ON (g."nino_id") g."nino_id",
           NULLIF(TRIM(a."email"), '') AS "email", NULLIF(TRIM(a."telefono"), '') AS "telefono"
      FROM "people_guardianship" g JOIN "people_person" a ON a."id" = g."apoderado_id"
     ORDER BY g."nino_id", (NULLIF(TRIM(a."telefono"), '') IS NULL), a."created_at"
  ) ap
 WHERE n."id" = ap."nino_id"
   AND ((NULLIF(TRIM(n."email"), '') IS NULL AND ap."email" IS NOT NULL)
     OR (NULLIF(TRIM(n."telefono"), '') IS NULL AND ap."telefono" IS NOT NULL));

-- 1b) La cuenta del niño cambia el correo inventado por el de la familia (si lo hay).
UPDATE "identity_user" u
   SET "email" = LOWER(TRIM(p."email")), "email_sintetico" = false, "email_familiar" = true,
       "updated_at" = now()
  FROM "people_person" p
 WHERE p."user_id" = u."id"
   AND u."email_sintetico"
   AND NULLIF(TRIM(p."email"), '') IS NOT NULL;

-- 2) Enlace de UN SOLO USO para elegir clave nueva, que llega por WhatsApp al
--    teléfono YA registrado (el del apoderado para un niño; el propio para el
--    personal y los guías). De la base solo sale el hash del token.
CREATE TABLE "identity_enlace_clave" (
  "id"           UUID        NOT NULL,
  "user_id"      UUID        NOT NULL,
  "solicitud_id" UUID,
  "token_hash"   TEXT        NOT NULL,
  "enviado_a"    TEXT,
  "creado_en"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expira_en"    TIMESTAMPTZ NOT NULL,
  "usado_en"     TIMESTAMPTZ,
  "revocado_en"  TIMESTAMPTZ,
  CONSTRAINT "identity_enlace_clave_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_enlace_clave_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "identity_user" ("id") ON DELETE CASCADE,
  CONSTRAINT "identity_enlace_clave_solicitud_fkey" FOREIGN KEY ("solicitud_id")
    REFERENCES "identity_solicitud_clave" ("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "identity_enlace_clave_token" ON "identity_enlace_clave" ("token_hash");
-- Un solo enlace vivo por cuenta: pedir otro revoca el anterior.
CREATE UNIQUE INDEX "identity_enlace_clave_vigente" ON "identity_enlace_clave" ("user_id")
  WHERE "usado_en" IS NULL AND "revocado_en" IS NULL;
CREATE INDEX "identity_enlace_clave_user_creado" ON "identity_enlace_clave" ("user_id", "creado_en");

-- 3) La solicitud sigue siendo el REGISTRO: ahora dice además a dónde se mandó
--    el enlace (o por qué no) y si se resolvió sola con él.
ALTER TABLE "identity_solicitud_clave"
  ADD COLUMN "enlace_enviado_a"  TEXT,
  ADD COLUMN "enlace_enviado_en" TIMESTAMPTZ,
  ADD COLUMN "enlace_problema"   TEXT,
  ADD COLUMN "resuelta_por_enlace" BOOLEAN NOT NULL DEFAULT false;

-- 4) La plantilla del WhatsApp. {{enlace}} es secreto: se envía al momento y el
--    historial lo guarda tapado.
INSERT INTO "notifications_plantilla" (id, slug, nombre, descripcion, contenido) VALUES
    (gen_random_uuid(), 'restablecer-clave', 'Restablecer clave',
     'Llega cuando alguien pide "¿Olvidaste tu clave?" en la entrada: al apoderado si es un niño, o al propio guía o administrativo. Marcadores: {{nombre}}, {{apoderado}}, {{usuario}} y {{enlace}}.',
     $plantilla$🔑 ¡Hola! Recibimos una solicitud para cambiar la clave de LGS Kids del usuario 👤 *{{usuario}}* ({{nombre}}).

👉 Para elegir una clave nueva, entra a este enlace:
{{enlace}}

⏰ El enlace sirve una sola vez y vence en 24 horas.

Si no pediste el cambio, ignora este mensaje: tu clave actual sigue funcionando. 🤝$plantilla$)
ON CONFLICT (slug) DO NOTHING;
