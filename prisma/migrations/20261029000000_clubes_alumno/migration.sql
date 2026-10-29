-- CLUBES DE INSCRITOS (2026-10-29).
--
-- 1) El club ABIERTO a niños de otros salones ya tenía alcance por campaña, curso y
--    salón (NULL = "Todos"); suma el PAÍS (el del calendario de feriados del salón
--    del niño). El NIVEL no necesita columna: es `scheduling_session.nivel`
--    (NULL = "Todos los niveles").
ALTER TABLE "scheduling_session"
  ADD COLUMN "alcance_pais" TEXT CHECK ("alcance_pais" IN ('CL', 'CO', 'EC', 'PE'));

-- 2) La lista de un CLUB es de INSCRITOS (decisión del negocio): el niño se
--    inscribe y queda en la lista de TODAS las sesiones que le quedan al club (su
--    tanda, o la única si no es tanda). Cada semana se materializa como un
--    `scheduling_agendado` (salón + instante) con su inscripción: así la lista,
--    el cupo, la agenda del niño y la asistencia usan el camino que ya existe.
--    Con DOS faltas SEGUIDAS (AUSENTE; la justificada no cuenta) se le RETIRA:
--    se libera su cupo de las semanas que faltan y la inscripción queda como
--    registro (estado, cuándo, por qué).
CREATE TABLE "scheduling_club_inscripcion" (
  "id"                       UUID PRIMARY KEY,
  "child_person_id"          UUID NOT NULL REFERENCES "people_person"("id") ON DELETE CASCADE,
  "tanda_id"                 UUID REFERENCES "scheduling_tanda_club"("id") ON DELETE SET NULL,
  -- La sesión con la que se inscribió (la referencia de un club sin tanda).
  "sesion_id"                UUID REFERENCES "scheduling_session"("id") ON DELETE SET NULL,
  -- Salón donde toma el club (el suyo si el club se dicta ahí).
  "classroom_id"             UUID NOT NULL REFERENCES "scheduling_classroom"("id") ON DELETE CASCADE,
  "estado"                   TEXT NOT NULL DEFAULT 'ACTIVA'
                               CHECK ("estado" IN ('ACTIVA', 'RETIRADA', 'CANCELADA')),
  "inscrito_por"             UUID NOT NULL REFERENCES "identity_user"("id"),
  "inscrito_en"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sobrecupo_autorizado_por" UUID REFERENCES "identity_user"("id"),
  -- RETIRADA (por faltas, NULL = el sistema) o CANCELADA (él o coordinación).
  "fin_en"                   TIMESTAMPTZ(3),
  "fin_por"                  UUID REFERENCES "identity_user"("id"),
  "fin_motivo"               TEXT
);

CREATE UNIQUE INDEX "scheduling_club_inscripcion_viva_tanda"
  ON "scheduling_club_inscripcion" ("child_person_id", "tanda_id")
  WHERE "estado" = 'ACTIVA' AND "tanda_id" IS NOT NULL;
CREATE INDEX "scheduling_club_inscripcion_nino_idx"
  ON "scheduling_club_inscripcion" ("child_person_id");

ALTER TABLE "scheduling_agendado"
  ADD COLUMN "inscripcion_id" UUID REFERENCES "scheduling_club_inscripcion"("id") ON DELETE SET NULL;
CREATE INDEX "scheduling_agendado_inscripcion_idx" ON "scheduling_agendado" ("inscripcion_id")
  WHERE "inscripcion_id" IS NOT NULL;
