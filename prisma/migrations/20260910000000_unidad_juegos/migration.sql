-- Juegos por UNIDAD (2026-09-10).
--
-- Al tocar "Unidad 1" en el mapa de la isla, el niño abre la lámina de esa
-- unidad y sus juegos. Por eso los juegos se atan a (curso, nivel, unidad) y
-- no a la lección: es la unidad lo que el mapa hace clicable.
--
-- La UNIDAD se guarda como NÚMERO 1..4, el mismo que marcan los hotspots de la
-- isla. En `catalog_curso` la unidad es texto libre y trae de todo —"Unidad 0",
-- "Repaso 3", "Evalucion 6" con errata—; colgar de ahí una clave la volvería
-- frágil.
--
-- Los juegos van en JSONB como el resto de listas del catálogo
-- (`[{ "nombre": "...", "enlace": "..." }]`): son un puñado por unidad y
-- siempre se leen enteros.
CREATE TABLE "catalog_unidad_juego" (
  "curso"      "catalog_course_tipo" NOT NULL,
  "nivel"      TEXT NOT NULL,
  "unidad"     SMALLINT NOT NULL,
  "juegos"     JSONB NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_unidad_juego_pkey" PRIMARY KEY ("curso", "nivel", "unidad"),
  CONSTRAINT "catalog_unidad_juego_unidad_chk" CHECK ("unidad" BETWEEN 1 AND 4)
);
