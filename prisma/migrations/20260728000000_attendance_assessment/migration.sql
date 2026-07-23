-- CreateEnum
CREATE TYPE "attendance_estado" AS ENUM ('PRESENTE', 'AUSENTE', 'JUSTIFICADO');

-- CreateTable
CREATE TABLE "attendance_attendance" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "child_person_id" UUID NOT NULL,
    "estado" "attendance_estado" NOT NULL,
    "justificacion" TEXT,
    "marcado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_attempt" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "child_person_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "aprobado" BOOLEAN NOT NULL,
    "registrado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_attendance_child_person_id_session_id_idx" ON "attendance_attendance"("child_person_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_attendance_session_id_child_person_id_key" ON "attendance_attendance"("session_id", "child_person_id");

-- CreateIndex
CREATE INDEX "assessment_attempt_child_person_id_quiz_id_idx" ON "assessment_attempt"("child_person_id", "quiz_id");

-- CreateIndex
CREATE INDEX "assessment_attempt_quiz_id_idx" ON "assessment_attempt"("quiz_id");

-- AddForeignKey
ALTER TABLE "attendance_attendance" ADD CONSTRAINT "attendance_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "scheduling_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_attendance" ADD CONSTRAINT "attendance_attendance_child_person_id_fkey" FOREIGN KEY ("child_person_id") REFERENCES "people_person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempt" ADD CONSTRAINT "assessment_attempt_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "catalog_quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempt" ADD CONSTRAINT "assessment_attempt_child_person_id_fkey" FOREIGN KEY ("child_person_id") REFERENCES "people_person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
