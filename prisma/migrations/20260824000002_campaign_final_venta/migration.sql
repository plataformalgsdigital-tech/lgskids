-- Cierre de matrícula ("final de venta") de la campaña = inicio del curso + 3
-- semanas. Estado derivado: EN_MATRÍCULA hasta final_venta (visible en el wizard
-- de contratos) → ACTIVA → INACTIVA (cuando pasa `fin`, los 12 meses).
-- `fin` pasa a ser inicio + 12 meses (editable); `final_curso` del curso sigue
-- siendo `fin` y NUNCA se reescribe (regla dura 1).

ALTER TABLE "catalog_campaign" ADD COLUMN "final_venta" DATE;

-- Backfill de campañas existentes: inicio del curso + 21 días (para el modelo
-- viejo, inicio del curso = inicio de campaña).
UPDATE "catalog_campaign" SET "final_venta" = "inicio" + INTERVAL '21 days'
 WHERE "final_venta" IS NULL;

ALTER TABLE "catalog_campaign" ALTER COLUMN "final_venta" SET NOT NULL;
