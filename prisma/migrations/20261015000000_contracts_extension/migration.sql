-- Extensión manual de vigencia, igual que en LGS y sincronizada con LGS (2026-10-15).
-- Cada fila es una extensión: corre final_contrato N días, con motivo y quién la hizo.
-- Como en LGS, un contrato con extensión manual ya no admite OnHold.

CREATE TABLE IF NOT EXISTS "contracts_extension" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "dias" INTEGER NOT NULL,
    "final_anterior" DATE NOT NULL,
    "final_nuevo" DATE NOT NULL,
    "motivo" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'KIDS',
    "ejecutado_por" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_extension_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contracts_extension_contract_id_idx" ON "contracts_extension"("contract_id");

DO $$ BEGIN
  ALTER TABLE "contracts_extension"
    ADD CONSTRAINT "contracts_extension_contract_id_fkey" FOREIGN KEY ("contract_id")
    REFERENCES "contracts_contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
