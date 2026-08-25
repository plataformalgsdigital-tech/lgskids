-- Grupo de país del horario del catálogo:
--   '01' = Chile
--   '02' = Colombia, Ecuador y Perú
-- Motivado por el desfase horario CL vs. el resto de países: los horarios
-- locales difieren, así que el catálogo se mantiene por grupo. Las filas
-- existentes quedan como Chile ('01', el default).

ALTER TABLE "scheduling_horario"
  ADD COLUMN "grupo_pais" TEXT NOT NULL DEFAULT '01';

ALTER TABLE "scheduling_horario"
  ADD CONSTRAINT "scheduling_horario_grupo_pais_check"
  CHECK ("grupo_pais" IN ('01', '02'));

-- La unicidad de etiqueta ahora es POR grupo de país: la misma etiqueta
-- ("Lun-Mié 16:00") puede existir para Chile y para el resto.
DROP INDEX "scheduling_horario_tipo_curso_etiqueta_key";
CREATE UNIQUE INDEX "scheduling_horario_tipo_curso_grupo_pais_etiqueta_key"
  ON "scheduling_horario"("tipo_curso", "grupo_pais", "etiqueta");
