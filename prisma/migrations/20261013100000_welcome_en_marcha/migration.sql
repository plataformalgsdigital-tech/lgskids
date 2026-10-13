-- WELCOME PARA CURSO EN MARCHA (2026-10-13).
--
-- El Welcome es antes del inicio del curso. Pero los niños que entran con el
-- curso ya andando (la migración de AGOSTO2026, los que llegan tarde) también
-- pueden necesitar uno. Un Welcome marcado `en_marcha` no exige que su fecha
-- sea anterior al inicio del curso, ni al crearlo ni al agendarlo.

ALTER TABLE "scheduling_welcome"
  ADD COLUMN "en_marcha" BOOLEAN NOT NULL DEFAULT false;
