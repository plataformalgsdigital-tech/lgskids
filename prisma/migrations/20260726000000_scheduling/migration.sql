-- CreateEnum
CREATE TYPE "scheduling_slot_tipo" AS ENUM ('SESION', 'CLUB');

-- CreateTable
CREATE TABLE "scheduling_classroom" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "guia_user_id" UUID,
    "cupo" INTEGER NOT NULL,
    "meeting_url" TEXT,
    "timezone" TEXT NOT NULL,
    "holiday_country" CHAR(2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scheduling_classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling_slot" (
    "id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "tipo" "scheduling_slot_tipo" NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "hora_local" TEXT NOT NULL,
    "duracion_min" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "scheduling_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling_session" (
    "id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "tipo" "scheduling_slot_tipo" NOT NULL,
    "fecha" DATE NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "duracion_min" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduling_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling_holiday" (
    "country_code" CHAR(2) NOT NULL,
    "fecha" DATE NOT NULL,
    "nombre" TEXT NOT NULL,
    "fuente" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduling_holiday_pkey" PRIMARY KEY ("country_code","fecha")
);

-- CreateTable
CREATE TABLE "scheduling_suspension" (
    "id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduling_suspension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduling_classroom_course_id_idx" ON "scheduling_classroom"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_slot_classroom_id_dia_semana_hora_local_key" ON "scheduling_slot"("classroom_id", "dia_semana", "hora_local");

-- CreateIndex
CREATE INDEX "scheduling_session_classroom_id_fecha_idx" ON "scheduling_session"("classroom_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_session_classroom_id_starts_at_key" ON "scheduling_session"("classroom_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_session_slot_id_numero_key" ON "scheduling_session"("slot_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_suspension_classroom_id_fecha_key" ON "scheduling_suspension"("classroom_id", "fecha");

-- AddForeignKey
ALTER TABLE "scheduling_slot" ADD CONSTRAINT "scheduling_slot_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "scheduling_classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_session" ADD CONSTRAINT "scheduling_session_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "scheduling_classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_session" ADD CONSTRAINT "scheduling_session_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "scheduling_slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_suspension" ADD CONSTRAINT "scheduling_suspension_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "scheduling_classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
