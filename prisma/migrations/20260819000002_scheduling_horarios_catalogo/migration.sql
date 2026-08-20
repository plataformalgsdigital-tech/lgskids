-- Catálogo de horarios reutilizables, por tipo de curso (mantenimiento
-- centralizado). Un horario se ELIGE al crear un salón y se materializa en sus
-- scheduling_slot; el catálogo NO participa en la generación de sesiones (solo
-- alimenta el selector). El modelo operativo sigue siendo scheduling_slot.

-- CreateTable
CREATE TABLE "scheduling_horario" (
    "id" UUID NOT NULL,
    "tipo_curso" "catalog_course_tipo" NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scheduling_horario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling_horario_slot" (
    "id" UUID NOT NULL,
    "horario_id" UUID NOT NULL,
    "tipo" "scheduling_slot_tipo" NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "hora_local" TEXT NOT NULL,
    "duracion_min" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "scheduling_horario_slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_horario_tipo_curso_etiqueta_key" ON "scheduling_horario"("tipo_curso", "etiqueta");

-- CreateIndex
CREATE INDEX "scheduling_horario_tipo_curso_activo_idx" ON "scheduling_horario"("tipo_curso", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_horario_slot_horario_id_dia_semana_hora_local_key" ON "scheduling_horario_slot"("horario_id", "dia_semana", "hora_local");

-- AddForeignKey
ALTER TABLE "scheduling_horario_slot" ADD CONSTRAINT "scheduling_horario_slot_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "scheduling_horario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
