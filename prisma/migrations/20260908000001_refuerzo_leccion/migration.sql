-- Lección de referencia en la solicitud de refuerzo (2026-09-08).
--
-- El guía indica QUÉ lección hay que repetir. Es una REFERENCIA —sirve para
-- que coordinación sepa de qué se trata y para rotular la clase extra—, no un
-- dato operativo: lo que ocurre al aprobar es que se agenda una sesión extra
-- para ese curso.
--
-- Apunta a `catalog_curso`, la tabla MAESTRA de la referencia curricular
-- (independiente de campañas): el contenido de "Junior · Rookie · Lección 1"
-- es el mismo en toda campaña. ON DELETE SET NULL porque reorganizar el
-- temario no puede borrar el histórico de solicitudes.
ALTER TABLE "scheduling_repeticion"
  ADD COLUMN "curso_ref_id" UUID
    REFERENCES "catalog_curso"("id") ON DELETE SET NULL;

CREATE INDEX "scheduling_repeticion_curso_ref_idx"
  ON "scheduling_repeticion" ("curso_ref_id")
  WHERE "curso_ref_id" IS NOT NULL;
