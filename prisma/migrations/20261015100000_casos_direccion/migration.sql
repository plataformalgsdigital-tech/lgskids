-- Casos de atención: las áreas son SOLO Servicio Académico y Dirección
-- (2026-10-15, decisión del negocio). "Coordinación" pasa a llamarse
-- Dirección y Finanzas deja de existir (cobra LGS).
--
-- En producción no había ningún caso al hacer el cambio; aun así, lo que
-- estuviera en Coordinación o en Finanzas pasa a Dirección, para que ningún
-- caso quede fuera de las bandejas.

ALTER TABLE "casos_caso" DROP CONSTRAINT IF EXISTS "casos_caso_area_check";
ALTER TABLE "casos_caso" DROP CONSTRAINT IF EXISTS "casos_caso_estado_check";

UPDATE "casos_caso" SET "area" = 'DIRECCION' WHERE "area" IN ('COORDINACION', 'FINANZAS');
UPDATE "casos_caso" SET "estado" = 'REMITIDO_DIRECCION'
 WHERE "estado" IN ('REMITIDO_COORDINACION', 'REMITIDO_FINANZAS');

UPDATE "casos_seguimiento" SET "area" = 'DIRECCION' WHERE "area" IN ('COORDINACION', 'FINANZAS');
UPDATE "casos_seguimiento" SET "estado_nuevo" = 'REMITIDO_DIRECCION'
 WHERE "estado_nuevo" IN ('REMITIDO_COORDINACION', 'REMITIDO_FINANZAS');
UPDATE "casos_seguimiento" SET "estado_anterior" = 'REMITIDO_DIRECCION'
 WHERE "estado_anterior" IN ('REMITIDO_COORDINACION', 'REMITIDO_FINANZAS');

ALTER TABLE "casos_caso" ADD CONSTRAINT "casos_caso_area_check"
  CHECK ("area" IN ('ACADEMICO', 'DIRECCION'));
ALTER TABLE "casos_caso" ADD CONSTRAINT "casos_caso_estado_check"
  CHECK ("estado" IN ('EN_GESTION', 'REMITIDO_ACADEMICO', 'REMITIDO_DIRECCION',
    'RESUELTO', 'SALON_CAMBIADO', 'CURSO_CAMBIADO', 'PAUSA_ACTIVADA',
    'REFUERZO_AGENDADO', 'SIN_CONTACTO'));
