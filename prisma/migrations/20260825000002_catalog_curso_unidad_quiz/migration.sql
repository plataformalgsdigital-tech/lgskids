-- catalog_curso: `modulo` -> `unidad` (agrupa las unidades del nivel) y nueva
-- columna `quiz` (JSONB) ANTES de `leccion`. La tabla está vacía, así que se
-- recrea con el orden de columnas deseado.

DROP TABLE IF EXISTS "catalog_curso";

CREATE TABLE "catalog_curso" (
  "id" UUID PRIMARY KEY,
  "curso" "catalog_course_tipo" NOT NULL,       -- JUNIOR | YOUNGSTER
  "nivel" TEXT NOT NULL,                          -- ROOKIE | CHAMPION | ELITE | LEGENDARY | ULTIMATE
  "unidad" TEXT,                                  -- agrupa las unidades del nivel
  "quiz" JSONB,                                   -- cuestionario de la unidad/lección
  "leccion" TEXT NOT NULL,                        -- etiqueta de la lección
  "orden" INTEGER NOT NULL DEFAULT 0,
  "contenido" TEXT,                              -- temario (markdown)
  "video" TEXT,                                  -- key de storage o URL
  "clubes" JSONB,
  "material_usuario" JSONB,                      -- libros del alumno: [{nombre,url}]
  "material_guia" JSONB,                         -- guías del guía: [{nombre,url}]
  "actividades" JSONB,                           -- [{nombre,link}]
  "recursos" JSONB,                              -- [{nombre,link}]
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Una fila por (curso, nivel, unidad, leccion); unidad NULL cuenta como ''.
CREATE UNIQUE INDEX "catalog_curso_natural_key"
  ON "catalog_curso" ("curso", "nivel", (COALESCE("unidad", '')), "leccion");
CREATE INDEX "catalog_curso_curso_nivel_idx" ON "catalog_curso" ("curso", "nivel", "orden");
