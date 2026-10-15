-- OnHold sincronizado con LGS (2026-10-14).
-- La pausa pide lo mismo que en LGS (inicio, fin y motivo) y se reactiva sola
-- al llegar al fin programado. Se distingue la PAUSA (OnHold, devuelve días)
-- de la SUSPENSIÓN administrativa que abre LGS al inactivar (no devuelve días).

ALTER TABLE "contracts_onhold" ADD COLUMN IF NOT EXISTS "hasta_programado" DATE;
ALTER TABLE "contracts_onhold" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'ONHOLD';
ALTER TABLE "contracts_onhold" ADD COLUMN IF NOT EXISTS "origen" TEXT NOT NULL DEFAULT 'KIDS';
ALTER TABLE "contracts_onhold" ADD COLUMN IF NOT EXISTS "activado_por" TEXT;

-- Las suspensiones que ya abrió LGS se reconocían por el prefijo del motivo.
UPDATE "contracts_onhold"
   SET "tipo" = 'SUSPENSION', "origen" = 'LGS'
 WHERE "motivo" LIKE 'LGS: %';

-- Barrido del worker: pausas abiertas con fin programado.
CREATE INDEX IF NOT EXISTS "contracts_onhold_abiertas_programadas_idx"
    ON "contracts_onhold" ("hasta_programado");
