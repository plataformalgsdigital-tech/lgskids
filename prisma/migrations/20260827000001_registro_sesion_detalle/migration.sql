-- Detalle del registro de sesión (2026-08-27): al cerrarla, el guía reporta a
-- qué hora se dictó y deja una nota.
--
-- `hora_real` es HORA DE PARED en la zona operativa del salón, no un instante:
-- es lo que el guía escribe ("se dictó a las 16:10"). El instante UTC del
-- acto de cerrar ya vive en `cerrada_en` — son dos cosas distintas y por eso
-- no se mezclan en una sola columna.
ALTER TABLE "scheduling_session"
  ADD COLUMN "hora_real"      TIME,
  ADD COLUMN "nota_sesion"    TEXT,
  -- Confirmación explícita de que NO asistió nadie. Distingue "vino cero
  -- niños" de "el guía olvidó marcar", que en los reportes no es lo mismo.
  ADD COLUMN "sin_asistentes" BOOLEAN NOT NULL DEFAULT FALSE;
