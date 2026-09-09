-- Refuerzo de sesión (2026-09-08).
--
-- Al aprobar una solicitud de repetición se crea una clase EXTRA. No se
-- extiende el curso ni se toca `final_curso` (regla 1): el refuerzo es un
-- evento ADICIONAL, con su propia fecha y hora, que no corre la secuencia.
--
-- Diferencia con MOSAICO, donde autorizar "extiende el curso una semana si
-- hace falta y detiene el avance una lección": aquí el fin del curso no se
-- reescribe nunca, y el avance del alumno se deriva de evaluaciones, no de
-- sesiones dictadas (regla 4), así que no hay avance que detener.
--
-- Se guarda a qué sesión dio lugar la aprobación para poder ir en ambos
-- sentidos: de la solicitud al refuerzo y del refuerzo a su motivo. ON DELETE
-- SET NULL porque borrar el salón se lleva sus sesiones y la solicitud debe
-- sobrevivir como histórico.
ALTER TABLE "scheduling_repeticion"
  ADD COLUMN "sesion_refuerzo_id" UUID
    REFERENCES "scheduling_session"("id") ON DELETE SET NULL;

CREATE INDEX "scheduling_repeticion_refuerzo_idx"
  ON "scheduling_repeticion" ("sesion_refuerzo_id")
  WHERE "sesion_refuerzo_id" IS NOT NULL;
