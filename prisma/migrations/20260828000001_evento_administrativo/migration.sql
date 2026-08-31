-- Evento ADMINISTRATIVO (2026-08-28): reunión, capacitación o taller interno
-- cuya audiencia son GUÍAS, no niños.
--
-- Vive en su propia tabla, NO en `scheduling_session`, a propósito: una sesión
-- arrastra lista de matriculados, asistencia y progresión. Un evento interno no
-- tiene nada de eso, y meterlo ahí lo haría aparecer en la agenda de los
-- alumnos, en las listas de asistencia y en el conteo de sesiones del guía.

CREATE TABLE "scheduling_evento_admin" (
  "id"              UUID PRIMARY KEY,
  "tipo"            TEXT NOT NULL,              -- SESION | CLUB | TALLER
  "titulo"          TEXT,
  "fecha"           DATE NOT NULL,
  -- Instante en UTC, calculado desde la hora de pared y la zona elegida.
  "starts_at"       TIMESTAMPTZ(3) NOT NULL,
  "timezone"        TEXT NOT NULL,
  "duracion_min"    INTEGER NOT NULL,
  -- Contexto opcional: un evento interno puede referirse a una campaña o a un
  -- salón concreto, pero no lo necesita para existir.
  "campania"        TEXT,
  "pais"            CHAR(2),
  "curso"           TEXT,
  "classroom_id"    UUID REFERENCES "scheduling_classroom"("id") ON DELETE SET NULL,
  "nivel"           TEXT,
  "limite_usuarios" INTEGER,
  "observaciones"   TEXT,
  "creado_por"      UUID NOT NULL REFERENCES "identity_user"("id"),
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "scheduling_evento_admin_fecha_idx" ON "scheduling_evento_admin" ("fecha");

-- Audiencia: los guías que verán el evento en SU calendario. Sin filas no lo
-- ve nadie, así que el alta siempre inserta al menos uno.
CREATE TABLE "scheduling_evento_admin_guia" (
  "evento_id"    UUID NOT NULL REFERENCES "scheduling_evento_admin"("id") ON DELETE CASCADE,
  "guia_user_id" UUID NOT NULL REFERENCES "identity_user"("id") ON DELETE CASCADE,
  PRIMARY KEY ("evento_id", "guia_user_id")
);

CREATE INDEX "scheduling_evento_admin_guia_idx"
  ON "scheduling_evento_admin_guia" ("guia_user_id");
