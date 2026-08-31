-- Invitación de registro del GUÍA (2026-08-29).
--
-- El admin crea la CUENTA en Usuarios y roles; con esto le manda al guía un
-- ENLACE para que complete su propia ficha en el wizard /nuevo-guia, como en
-- MOSAICO.
--
-- Diferencia deliberada con MOSAICO: allí /nuevo-guia es una página ABIERTA
-- —cualquiera con la URL se da de alta como guía y crea su propio usuario—.
-- Aquí el enlace lleva un token ligado a UN guía concreto, de un solo uso y
-- con vencimiento; la cuenta ya existe y el wizard solo completa su ficha.
--
-- Del token se guarda solo el HASH: quien lea la base no puede reconstruir el
-- enlace. El token vive únicamente en la URL que recibe el guía.

CREATE TABLE "scheduling_guia_invitacion" (
  "id"           UUID PRIMARY KEY,
  "guia_user_id" UUID NOT NULL REFERENCES "identity_user"("id") ON DELETE CASCADE,
  "token_hash"   TEXT NOT NULL,
  "creado_por"   UUID NOT NULL REFERENCES "identity_user"("id"),
  "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expira_en"    TIMESTAMPTZ(3) NOT NULL,
  "usado_en"     TIMESTAMPTZ(3),
  "revocado_en"  TIMESTAMPTZ(3)
);

CREATE UNIQUE INDEX "scheduling_guia_invitacion_token"
  ON "scheduling_guia_invitacion" ("token_hash");

CREATE INDEX "scheduling_guia_invitacion_guia"
  ON "scheduling_guia_invitacion" ("guia_user_id", "created_at" DESC);

-- UN solo enlace vivo por guía: emitir uno nuevo revoca el anterior en la
-- misma transacción. El índice lo vuelve invariante, no costumbre.
CREATE UNIQUE INDEX "scheduling_guia_invitacion_vigente"
  ON "scheduling_guia_invitacion" ("guia_user_id")
  WHERE "usado_en" IS NULL AND "revocado_en" IS NULL;
