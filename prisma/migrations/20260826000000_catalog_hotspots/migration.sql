-- Hotspots del arte curricular para la pantalla "Avance" (2026-08-26).
-- Guardan, como coordenadas en % (0..100), dónde va cada marcador sobre una imagen:
--   scope 'ISLA' → sobre el BANNER del nivel (mapa de la isla): unidades[] + premio.
--   scope 'MAPA' → sobre el MAPA del curso completo: unidades[] + centro (de esa isla).
-- Una fila por (scope, curso, nivel). `data` es JSONB libre:
--   { "unidades": [{"x":..,"y":..}, ...], "premio": {"x":..,"y":..}, "centro": {"x":..,"y":..} }

CREATE TABLE "catalog_arte_hotspot" (
  "id" UUID PRIMARY KEY,
  "scope" TEXT NOT NULL,                        -- 'ISLA' | 'MAPA'
  "curso" "catalog_course_tipo" NOT NULL,       -- JUNIOR | YOUNGSTER
  "nivel" TEXT NOT NULL,                          -- ROOKIE | CHAMPION | ELITE | LEGENDARY | ULTIMATE
  "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "catalog_arte_hotspot_key"
  ON "catalog_arte_hotspot" ("scope", "curso", "nivel");
CREATE INDEX "catalog_arte_hotspot_curso_idx"
  ON "catalog_arte_hotspot" ("curso");
