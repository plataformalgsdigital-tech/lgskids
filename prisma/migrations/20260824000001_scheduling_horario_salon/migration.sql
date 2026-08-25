-- Número de salón del horario del catálogo: el horario completo pertenece a UN
-- salón (todos sus bloques/días son el mismo salón; el primer horario suele ser
-- Salón 01, el segundo Salón 02, etc.). Dos dígitos ('01'..'99').
-- Las filas existentes quedan como Salón 01 (el default).

ALTER TABLE "scheduling_horario"
  ADD COLUMN "salon_numero" TEXT NOT NULL DEFAULT '01';

ALTER TABLE "scheduling_horario"
  ADD CONSTRAINT "scheduling_horario_salon_numero_check"
  CHECK ("salon_numero" ~ '^[0-9]{2}$');

-- La unicidad de etiqueta ahora también contempla el salón: la misma etiqueta
-- ("Lun-Mié 17:00") puede existir para Salón 01 y para Salón 02.
DROP INDEX "scheduling_horario_tipo_curso_grupo_pais_etiqueta_key";
CREATE UNIQUE INDEX "scheduling_horario_tipo_grupo_salon_etiqueta_key"
  ON "scheduling_horario"("tipo_curso", "grupo_pais", "salon_numero", "etiqueta");
