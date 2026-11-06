-- Varias facturas por corte (2026-11-06): el guía puede cobrar un corte en hasta 3
-- facturas (p. ej. horas normales y Exam. Internacional); LGS las revisa SUMADAS.
--   concepto     NORMAL | EXAM_INTERN | FESTIVO | OTRO (NULL = factura única de antes)
--   modo         'agregar' (se suma a las del corte) | 'reemplazar' (sustituye a todas)
--   reemplaza_id factura de este corte que esta sustituye (Reemplazar una)
ALTER TABLE "liquidacion_factura_guia"
  ADD COLUMN IF NOT EXISTS "concepto" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "modo" VARCHAR(12) NOT NULL DEFAULT 'reemplazar',
  ADD COLUMN IF NOT EXISTS "reemplaza_id" UUID;
