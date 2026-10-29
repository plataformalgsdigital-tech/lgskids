-- EVENTO SUSPENDIDO (2026-10-29). Un evento creado a mano (sesión extra, club,
-- taller) se puede SUSPENDER desde la Agenda: NO se borra —queda en el
-- calendario marcado, con quién, cuándo y por qué—, no se pasa lista ni se
-- registra, y no cuenta como dictado. Se puede reactivar. Distinto de:
--  - CANCELAR el evento, que lo saca del calendario;
--  - la suspensión de una clase del HORARIO (`scheduling_suspension`), que la
--    corre al final del curso.
ALTER TABLE "scheduling_session"
  ADD COLUMN "suspendida_en"     TIMESTAMPTZ(3),
  ADD COLUMN "suspendida_por"    UUID REFERENCES "identity_user"("id") ON DELETE SET NULL,
  ADD COLUMN "suspension_motivo" TEXT;
