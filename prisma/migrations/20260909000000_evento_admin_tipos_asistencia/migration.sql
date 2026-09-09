-- Evento administrativo: vocabulario propio y asistencia (2026-09-09).
--
-- 1. TIPOS. El evento interno no es una clase, así que no comparte el
--    vocabulario de las sesiones (SESION/CLUB/TALLER). Pasa al del negocio:
--    Meeting · Training · Observation · Development. La columna ya era TEXT
--    libre; ahora la regla vive en la base y no solo en la aplicación.
UPDATE "scheduling_evento_admin"
   SET "tipo" = CASE "tipo"
                  WHEN 'TALLER' THEN 'TRAINING'
                  WHEN 'CLUB'   THEN 'MEETING'
                  WHEN 'SESION' THEN 'MEETING'
                  ELSE "tipo"
                END
 WHERE "tipo" IN ('TALLER', 'CLUB', 'SESION');

ALTER TABLE "scheduling_evento_admin"
  ADD CONSTRAINT "scheduling_evento_admin_tipo_chk"
  CHECK ("tipo" IN ('MEETING', 'TRAINING', 'OBSERVATION', 'DEVELOPMENT'));

-- 2. DURACIÓN: de 1 a 8 horas. Una clase dura minutos; una capacitación puede
--    ocupar la jornada. Se restringe aquí para que ningún camino la viole.
ALTER TABLE "scheduling_evento_admin"
  ADD CONSTRAINT "scheduling_evento_admin_duracion_chk"
  CHECK ("duracion_min" BETWEEN 60 AND 480);

-- 3. ASISTENCIA de la audiencia. Va en la tabla de audiencia, NO en
--    `attendance_attendance`: esa es la asistencia de NIÑOS a sesiones y
--    alimenta la función central de progresión (regla 4). Un guía en una
--    capacitación no tiene progresión que mover; mezclarlas metería un
--    segundo camino de escritura en algo que debe tener uno solo.
ALTER TABLE "scheduling_evento_admin_guia"
  ADD COLUMN "asistio"     BOOLEAN,
  ADD COLUMN "marcado_en"  TIMESTAMPTZ(3),
  ADD COLUMN "marcado_por" UUID REFERENCES "identity_user"("id");

COMMENT ON COLUMN "scheduling_evento_admin_guia"."asistio" IS
  'NULL = sin marcar todavía. Distingue "no vino" de "nadie pasó lista".';
