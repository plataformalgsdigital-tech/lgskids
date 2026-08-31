-- Registro de sesión: ficha del alumno, cierre por el guía, solicitud de
-- repetición y estadística mensual por guía (2026-08-27).
--
-- DECISIÓN: NO se crea una base "booking" paralela. `attendance_attendance` YA
-- es el registro por (sesión, niño) y `scheduling_session` ya es el calendario.
-- Duplicarlos abriría un segundo camino de escritura que la función central de
-- progresión no vería (regla 4) y repetiría el desfase que la Fase 7 evitó al
-- derivar la lista del salón de las matrículas activas.

-- ── 1. Ficha del alumno en la sesión ────────────────────────────────────────
-- Lo que el guía anota de cada niño, además de si asistió.
ALTER TABLE "attendance_attendance"
  ADD COLUMN "participo"          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "comentario_usuario" TEXT,   -- lo LEE el alumno en su panel
  ADD COLUMN "nota_privada"       TEXT,   -- solo staff; nunca viaja al alumno
  ADD COLUMN "requiere_atencion"  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX "attendance_requiere_atencion_idx"
  ON "attendance_attendance" ("requiere_atencion")
  WHERE "requiere_atencion";

-- ── 2. Quién dictó y quién cerró cada sesión ────────────────────────────────
-- El guía vive en el salón, pero el salón puede cambiar de guía a mitad de
-- curso: la sesión guarda quién la dictó para que el historial no se reescriba.
ALTER TABLE "scheduling_session"
  ADD COLUMN "guia_user_id" UUID REFERENCES "identity_user"("id") ON DELETE SET NULL,
  ADD COLUMN "cerrada_por"  UUID REFERENCES "identity_user"("id") ON DELETE SET NULL,
  ADD COLUMN "cerrada_en"   TIMESTAMPTZ(3);

CREATE INDEX "scheduling_session_guia_idx" ON "scheduling_session" ("guia_user_id");
CREATE INDEX "scheduling_session_cerrada_idx" ON "scheduling_session" ("cerrada_en");

-- ── 3. Solicitud de repetición ──────────────────────────────────────────────
-- El guía NO puede suspender ni repetir por su cuenta: lo solicita y el
-- coordinador aprueba. Queda en el evento del calendario.
CREATE TABLE "scheduling_repeticion" (
  "id"             UUID PRIMARY KEY,
  "session_id"     UUID NOT NULL REFERENCES "scheduling_session"("id") ON DELETE CASCADE,
  "solicitado_por" UUID NOT NULL REFERENCES "identity_user"("id"),
  "motivo"         TEXT NOT NULL,
  "repetir_leccion" BOOLEAN NOT NULL DEFAULT FALSE,  -- repetir también el contenido
  "estado"         TEXT NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | APROBADA | RECHAZADA
  "resuelto_por"   UUID REFERENCES "identity_user"("id"),
  "resuelto_en"    TIMESTAMPTZ(3),
  "nota_resolucion" TEXT,
  "created_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduling_repeticion_estado_chk"
    CHECK ("estado" IN ('PENDIENTE', 'APROBADA', 'RECHAZADA'))
);

-- Una sola solicitud viva por sesión: evita repetidos por doble clic.
CREATE UNIQUE INDEX "scheduling_repeticion_viva"
  ON "scheduling_repeticion" ("session_id")
  WHERE "estado" = 'PENDIENTE';
CREATE INDEX "scheduling_repeticion_estado_idx" ON "scheduling_repeticion" ("estado");

-- ── 4. Estadística mensual por guía ─────────────────────────────────────────
-- ACUMULATIVA y extraíble: se consolida por período con UPSERT, así el
-- histórico queda fijo aunque después se regeneren sesiones. El detalle
-- siempre se puede recomputar desde las sesiones; esta tabla es el corte.
CREATE TABLE "reporting_guia_mes" (
  "guia_user_id"       UUID NOT NULL REFERENCES "identity_user"("id") ON DELETE CASCADE,
  "periodo"            CHAR(7) NOT NULL,               -- 'YYYY-MM' en la zona del salón
  "sesiones_dictadas"  INTEGER NOT NULL DEFAULT 0,     -- programadas en el período
  "sesiones_cerradas"  INTEGER NOT NULL DEFAULT 0,     -- que el guía marcó como cerradas
  "clubes"             INTEGER NOT NULL DEFAULT 0,
  "ninos_atendidos"    INTEGER NOT NULL DEFAULT 0,     -- distintos con asistencia marcada
  "presentes"          INTEGER NOT NULL DEFAULT 0,
  "ausentes"           INTEGER NOT NULL DEFAULT 0,
  "justificados"       INTEGER NOT NULL DEFAULT 0,
  "casos_atencion"     INTEGER NOT NULL DEFAULT 0,     -- fichas con requiere_atencion
  "consolidado_en"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("guia_user_id", "periodo")
);

CREATE INDEX "reporting_guia_mes_periodo_idx" ON "reporting_guia_mes" ("periodo");
