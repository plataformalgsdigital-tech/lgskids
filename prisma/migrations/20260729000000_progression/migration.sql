-- CreateEnum
CREATE TYPE "progression_estado" AS ENUM ('EN_CURSO', 'COMPLETADO');

-- CreateEnum
CREATE TYPE "progression_award_tipo" AS ENUM ('MEDALLA', 'DIPLOMA');

-- CreateTable
CREATE TABLE "progression_level_progress" (
    "id" UUID NOT NULL,
    "child_person_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "lecciones_completadas" INTEGER NOT NULL DEFAULT 0,
    "level_up_aprobado" BOOLEAN NOT NULL DEFAULT false,
    "estado" "progression_estado" NOT NULL DEFAULT 'EN_CURSO',
    "completado_en" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "progression_level_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progression_award" (
    "id" UUID NOT NULL,
    "child_person_id" UUID NOT NULL,
    "tipo" "progression_award_tipo" NOT NULL,
    "level_id" UUID,
    "course_id" UUID,
    "otorgado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notificado_en" TIMESTAMPTZ(3),

    CONSTRAINT "progression_award_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "progression_level_progress_child_person_id_idx" ON "progression_level_progress"("child_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "progression_level_progress_child_person_id_level_id_key" ON "progression_level_progress"("child_person_id", "level_id");

-- CreateIndex
CREATE INDEX "progression_award_child_person_id_idx" ON "progression_award"("child_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "progression_award_child_person_id_tipo_level_id_course_id_key" ON "progression_award"("child_person_id", "tipo", "level_id", "course_id");

-- AddForeignKey
ALTER TABLE "progression_level_progress" ADD CONSTRAINT "progression_level_progress_child_person_id_fkey" FOREIGN KEY ("child_person_id") REFERENCES "people_person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progression_level_progress" ADD CONSTRAINT "progression_level_progress_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "catalog_level"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progression_award" ADD CONSTRAINT "progression_award_child_person_id_fkey" FOREIGN KEY ("child_person_id") REFERENCES "people_person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progression_award" ADD CONSTRAINT "progression_award_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "catalog_level"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progression_award" ADD CONSTRAINT "progression_award_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "catalog_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
