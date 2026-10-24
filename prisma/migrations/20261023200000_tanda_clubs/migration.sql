-- TANDA DE CLUBS (2026-10-23): un Club que se repite cada semana entre el inicio y
-- el final de la tanda. La tanda guarda su rango; cada semana es una sesión suelta
-- (sin slot: la regeneración del horario no la toca) que la referencia.
CREATE TABLE "scheduling_tanda_club" (
  "id"          UUID PRIMARY KEY,
  "inicio"      DATE NOT NULL,
  "fin"         DATE NOT NULL CHECK ("fin" >= "inicio"),
  "creado_por"  UUID REFERENCES "identity_user"("id") ON DELETE SET NULL,
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "scheduling_session"
  ADD COLUMN "tanda_id" UUID REFERENCES "scheduling_tanda_club"("id") ON DELETE SET NULL;

CREATE INDEX "scheduling_session_tanda_id_idx" ON "scheduling_session" ("tanda_id")
  WHERE "tanda_id" IS NOT NULL;
