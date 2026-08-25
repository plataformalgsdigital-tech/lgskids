-- Duración en meses de cada nivel del curso (2026-08-24). La estructura pasa a
-- 5 niveles (se agrega "Ultimate Stage") con duraciones Rookie 2 / Champion 2 /
-- Elite 3 / Legendary 3 / Ultimate 2 = 12 meses. Esta migración solo agrega la
-- columna y rellena la duración de los niveles YA existentes por su código; el
-- 5.º nivel se crea al generar campañas NUEVAS.

ALTER TABLE "catalog_level" ADD COLUMN "duracion_meses" INTEGER NOT NULL DEFAULT 2;

UPDATE "catalog_level" SET "duracion_meses" = 3 WHERE "codigo" IN ('ELITE', 'LEGENDARY');
