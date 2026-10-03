-- UBICACIÓN ACADÉMICA (Academic Change › Ajuste / cambio de curso).
--
-- El avance del niño se DERIVA de los cuestionarios aprobados (regla 4) y
-- nadie lo edita a mano. Pero hay casos reales que esa derivación no cubre: el
-- niño que entra tarde a un salón que ya va en Champion, o el que pasa de
-- Junior a Youngster y no debe empezar el curso nuevo desde el Welcome.
--
-- Esta tabla guarda el PUNTO DE PARTIDA que decide coordinación: un nivel y
-- cuántas de sus lecciones se dan por cursadas. La función central lo lee como
-- una entrada más: los niveles anteriores quedan COMPLETADOS por convalidación
-- y el nivel de la ubicación arranca con esas lecciones. Lo que el niño aprueba
-- después se sigue sumando por los caminos de siempre.
--
-- Es un PISO, no un techo: nunca resta lo que el niño ya aprobó.
-- Una ubicación por (niño, curso): la de cada curso es independiente porque el
-- avance también lo es.

CREATE TABLE "progression_ubicacion" (
  "id"              UUID PRIMARY KEY,
  "child_person_id" UUID NOT NULL REFERENCES "people_person"("id") ON DELETE CASCADE,
  "course_id"       UUID NOT NULL REFERENCES "catalog_course"("id") ON DELETE CASCADE,
  "level_id"        UUID NOT NULL REFERENCES "catalog_level"("id") ON DELETE CASCADE,
  "lecciones"       INTEGER NOT NULL CHECK ("lecciones" >= 0),
  "motivo"          TEXT NOT NULL,
  "ubicado_por"     UUID REFERENCES "identity_user"("id") ON DELETE SET NULL,
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "progression_ubicacion_nino_curso_key" UNIQUE ("child_person_id", "course_id")
);

-- Un nivel COMPLETADO por convalidación no es un nivel ganado: no da medalla
-- ni se notifica, y la vista lo distingue.
ALTER TABLE "progression_level_progress"
  ADD COLUMN "convalidado" BOOLEAN NOT NULL DEFAULT FALSE;
