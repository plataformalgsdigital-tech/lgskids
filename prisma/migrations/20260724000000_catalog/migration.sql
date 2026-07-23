-- CreateEnum
CREATE TYPE "catalog_course_tipo" AS ENUM ('JUNIOR', 'YOUNGSTER');

-- CreateEnum
CREATE TYPE "catalog_quiz_tipo" AS ENUM ('PRACTICA', 'LEVEL_UP');

-- CreateTable
CREATE TABLE "catalog_campaign" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_course" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "tipo" "catalog_course_tipo" NOT NULL,
    "inicio" DATE NOT NULL,
    "final_curso" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_level" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "catalog_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_lesson" (
    "id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,

    CONSTRAINT "catalog_lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_quiz" (
    "id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "lesson_id" UUID,
    "tipo" "catalog_quiz_tipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "contenido" JSONB,

    CONSTRAINT "catalog_quiz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_campaign_nombre_key" ON "catalog_campaign"("nombre");

-- CreateIndex
CREATE INDEX "catalog_campaign_inicio_fin_idx" ON "catalog_campaign"("inicio", "fin");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_course_campaign_id_tipo_key" ON "catalog_course"("campaign_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_level_course_id_orden_key" ON "catalog_level"("course_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_level_course_id_codigo_key" ON "catalog_level"("course_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_lesson_level_id_orden_key" ON "catalog_lesson"("level_id", "orden");

-- CreateIndex
CREATE INDEX "catalog_quiz_level_id_idx" ON "catalog_quiz"("level_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_quiz_lesson_id_tipo_key" ON "catalog_quiz"("lesson_id", "tipo");

-- AddForeignKey
ALTER TABLE "catalog_course" ADD CONSTRAINT "catalog_course_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "catalog_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_level" ADD CONSTRAINT "catalog_level_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "catalog_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_lesson" ADD CONSTRAINT "catalog_lesson_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "catalog_level"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_quiz" ADD CONSTRAINT "catalog_quiz_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "catalog_level"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_quiz" ADD CONSTRAINT "catalog_quiz_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "catalog_lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
