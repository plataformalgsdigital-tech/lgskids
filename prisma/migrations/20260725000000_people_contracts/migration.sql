-- CreateEnum
CREATE TYPE "people_person_estado" AS ENUM ('ACTIVA', 'INACTIVA');

-- CreateEnum
CREATE TYPE "contracts_estado" AS ENUM ('PENDIENTE', 'APROBADO', 'ONHOLD', 'INACTIVO');

-- CreateTable
CREATE TABLE "people_person" (
    "id" UUID NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "fecha_nacimiento" DATE,
    "doc_tipo" TEXT NOT NULL,
    "doc_numero" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "estado" "people_person_estado" NOT NULL DEFAULT 'ACTIVA',
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "people_person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people_guardianship" (
    "id" UUID NOT NULL,
    "nino_id" UUID NOT NULL,
    "apoderado_id" UUID NOT NULL,
    "parentesco" TEXT,

    CONSTRAINT "people_guardianship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts_contract" (
    "id" UUID NOT NULL,
    "titular_id" UUID NOT NULL,
    "beneficiario_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "tipo_curso" "catalog_course_tipo" NOT NULL,
    "inicio" DATE NOT NULL,
    "final_contrato" DATE NOT NULL,
    "estado" "contracts_estado" NOT NULL DEFAULT 'PENDIENTE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contracts_contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts_onhold" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "dias_extendidos" INTEGER,
    "motivo" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_onhold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "people_person_user_id_key" ON "people_person"("user_id");

-- CreateIndex
CREATE INDEX "people_person_apellidos_nombres_idx" ON "people_person"("apellidos", "nombres");

-- CreateIndex
CREATE UNIQUE INDEX "people_person_country_code_doc_tipo_doc_numero_key" ON "people_person"("country_code", "doc_tipo", "doc_numero");

-- CreateIndex
CREATE INDEX "people_guardianship_apoderado_id_idx" ON "people_guardianship"("apoderado_id");

-- CreateIndex
CREATE UNIQUE INDEX "people_guardianship_nino_id_apoderado_id_key" ON "people_guardianship"("nino_id", "apoderado_id");

-- CreateIndex
CREATE INDEX "contracts_contract_beneficiario_id_estado_idx" ON "contracts_contract"("beneficiario_id", "estado");

-- CreateIndex
CREATE INDEX "contracts_contract_estado_final_contrato_idx" ON "contracts_contract"("estado", "final_contrato");

-- CreateIndex
CREATE INDEX "contracts_onhold_contract_id_idx" ON "contracts_onhold"("contract_id");

-- AddForeignKey
ALTER TABLE "people_person" ADD CONSTRAINT "people_person_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people_guardianship" ADD CONSTRAINT "people_guardianship_nino_id_fkey" FOREIGN KEY ("nino_id") REFERENCES "people_person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people_guardianship" ADD CONSTRAINT "people_guardianship_apoderado_id_fkey" FOREIGN KEY ("apoderado_id") REFERENCES "people_person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts_contract" ADD CONSTRAINT "contracts_contract_titular_id_fkey" FOREIGN KEY ("titular_id") REFERENCES "people_person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts_contract" ADD CONSTRAINT "contracts_contract_beneficiario_id_fkey" FOREIGN KEY ("beneficiario_id") REFERENCES "people_person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts_onhold" ADD CONSTRAINT "contracts_onhold_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts_contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
