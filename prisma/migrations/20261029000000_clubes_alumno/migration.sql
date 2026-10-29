-- Inscripción a Clubes desde el panel del ALUMNO (2026-10-29).
--
-- El club ABIERTO a niños de otros salones ya tenía alcance por campaña, curso y
-- salón (NULL = "Todos"); suma el PAÍS (el del calendario de feriados del salón
-- del niño). El NIVEL no necesita columna: es `scheduling_session.nivel`
-- (NULL = "Todos los niveles").
ALTER TABLE "scheduling_session"
  ADD COLUMN "alcance_pais" TEXT CHECK ("alcance_pais" IN ('CL', 'CO', 'EC', 'PE'));
