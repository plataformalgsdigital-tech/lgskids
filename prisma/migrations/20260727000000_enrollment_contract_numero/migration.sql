-- CreateEnum
CREATE TYPE "enrollment_estado" AS ENUM ('ACTIVA', 'FINALIZADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "contracts_contract" ADD COLUMN     "numero" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "enrollment_enrollment" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "child_person_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "estado" "enrollment_estado" NOT NULL DEFAULT 'ACTIVA',
    "motivo_cierre" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollment_enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enrollment_enrollment_classroom_id_estado_idx" ON "enrollment_enrollment"("classroom_id", "estado");

-- CreateIndex
CREATE INDEX "enrollment_enrollment_child_person_id_estado_idx" ON "enrollment_enrollment"("child_person_id", "estado");

-- CreateIndex
CREATE INDEX "enrollment_enrollment_contract_id_estado_idx" ON "enrollment_enrollment"("contract_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_contract_numero_key" ON "contracts_contract"("numero");

-- AddForeignKey
ALTER TABLE "enrollment_enrollment" ADD CONSTRAINT "enrollment_enrollment_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts_contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_enrollment" ADD CONSTRAINT "enrollment_enrollment_child_person_id_fkey" FOREIGN KEY ("child_person_id") REFERENCES "people_person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_enrollment" ADD CONSTRAINT "enrollment_enrollment_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "scheduling_classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
