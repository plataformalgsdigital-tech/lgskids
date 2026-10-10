-- WELCOME (2026-10-09): la sesión de bienvenida que el niño AGENDA al crear su
-- perfil, antes de que empiece su curso.
--
-- Vive en tablas propias, no en `scheduling_session`: no pertenece a un salón
-- (un mismo Welcome puede servir a varios salones, países y campañas), el niño
-- lo ELIGE —excepción deliberada al modelo de cohortes: todavía no tiene
-- clases— y su asistencia no es la de una clase, así que no debe pasar por
-- `attendance_attendance` ni por la función central de progresión (regla 4).
--
-- Los filtros en NULL significan "todos". El instante es UNO solo: lo dicta un
-- guía en una sala de Zoom, y cada quien lo ve en su propia hora.

CREATE TABLE "scheduling_welcome" (
  "id"              UUID PRIMARY KEY,
  "starts_at"       TIMESTAMPTZ(3) NOT NULL,
  -- Zona del reloj con que se escribió la hora, y la fecha en ese reloj.
  "timezone"        TEXT NOT NULL,
  "fecha"           DATE NOT NULL,
  "duracion_min"    INTEGER NOT NULL CHECK ("duracion_min" BETWEEN 15 AND 300),
  "guia_user_id"    UUID NOT NULL REFERENCES "identity_user"("id"),
  "campaign_id"     UUID REFERENCES "catalog_campaign"("id") ON DELETE CASCADE,
  "pais"            CHAR(2) CHECK ("pais" IN ('CL', 'CO', 'EC', 'PE')),
  "curso"           TEXT CHECK ("curso" IN ('JUNIOR', 'YOUNGSTER')),
  "classroom_id"    UUID REFERENCES "scheduling_classroom"("id") ON DELETE CASCADE,
  "nivel"           TEXT NOT NULL DEFAULT 'ROOKIE'
                    CHECK ("nivel" IN ('ROOKIE', 'CHAMPION', 'ELITE', 'LEGENDARY', 'ULTIMATE')),
  "limite_usuarios" INTEGER NOT NULL CHECK ("limite_usuarios" BETWEEN 1 AND 500),
  "observaciones"   TEXT,
  "creado_por"      UUID NOT NULL REFERENCES "identity_user"("id"),
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "scheduling_welcome_starts_idx" ON "scheduling_welcome" ("starts_at");
CREATE INDEX "scheduling_welcome_guia_idx" ON "scheduling_welcome" ("guia_user_id");

-- Quién lo agendó. UNA reserva ACTIVA por niño: cambiar de Welcome cancela la
-- anterior (queda en el historial).
CREATE TABLE "scheduling_welcome_reserva" (
  "id"              UUID PRIMARY KEY,
  "welcome_id"      UUID NOT NULL REFERENCES "scheduling_welcome"("id") ON DELETE CASCADE,
  "child_person_id" UUID NOT NULL REFERENCES "people_person"("id") ON DELETE CASCADE,
  "estado"          TEXT NOT NULL DEFAULT 'ACTIVA' CHECK ("estado" IN ('ACTIVA', 'CANCELADA')),
  -- NULL = sin pasar lista. Distinto de "no vino".
  "asistio"         BOOLEAN,
  "marcado_en"      TIMESTAMPTZ(3),
  "marcado_por"     UUID REFERENCES "identity_user"("id"),
  -- NULL = lo agendó el propio niño desde su enlace de creación de perfil.
  "agendado_por"    UUID REFERENCES "identity_user"("id"),
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelada_en"    TIMESTAMPTZ(3)
);

CREATE UNIQUE INDEX "scheduling_welcome_reserva_activa"
  ON "scheduling_welcome_reserva" ("child_person_id") WHERE "estado" = 'ACTIVA';
CREATE INDEX "scheduling_welcome_reserva_welcome_idx"
  ON "scheduling_welcome_reserva" ("welcome_id");
