-- AlterTable: entrada de beneficiarios desde LGS.
-- external_ref = N° de contrato en LGS (idempotencia del alta desde LGS).
-- firmado = contrato firmado en LGS pero aún sin aprobar en KIDS.
ALTER TABLE "contracts_contract" ADD COLUMN     "external_ref" TEXT;
ALTER TABLE "contracts_contract" ADD COLUMN     "firmado" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: unicidad de la referencia externa (los NULL son distintos en
-- Postgres, así que múltiples contratos sin external_ref conviven sin problema).
CREATE UNIQUE INDEX "contracts_contract_external_ref_key" ON "contracts_contract"("external_ref");
