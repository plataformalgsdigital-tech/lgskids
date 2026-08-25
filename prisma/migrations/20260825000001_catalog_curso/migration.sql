-- Tabla MAESTRA de referencia de cursos (2026-08-25), INDEPENDIENTE de campañas:
-- una fila por (curso, nivel, modulo, leccion). Es la fuente del material para
-- los paneles de alumno/guía y las actividades de seguimiento. El contenido de
-- "Junior · Rookie · Lección 1" es el mismo sin importar la campaña, así que se
-- carga UNA vez aquí (no por campaña).

CREATE TABLE "catalog_curso" (
  "id" UUID PRIMARY KEY,
  "curso" "catalog_course_tipo" NOT NULL,       -- JUNIOR | YOUNGSTER
  "nivel" TEXT NOT NULL,                          -- ROOKIE | CHAMPION | ELITE | LEGENDARY | ULTIMATE
  "modulo" TEXT,                                  -- sub-agrupación opcional
  "leccion" TEXT NOT NULL,                        -- etiqueta de la lección (ej. "Lección 1")
  "orden" INTEGER NOT NULL DEFAULT 0,
  "contenido" TEXT,                              -- temario (markdown)
  "video" TEXT,                                  -- key de storage o URL
  "clubes" JSONB,                                -- [{nombre,link}] o etiquetas
  "material_usuario" JSONB,                      -- libros del alumno: [{nombre,url}]
  "material_guia" JSONB,                         -- guías del guía: [{nombre,url}]
  "actividades" JSONB,                           -- WordWall/links: [{nombre,link}]
  "recursos" JSONB,                              -- [{nombre,link}]
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Una fila por (curso, nivel, modulo, leccion); modulo NULL cuenta como ''.
CREATE UNIQUE INDEX "catalog_curso_natural_key"
  ON "catalog_curso" ("curso", "nivel", (COALESCE("modulo", '')), "leccion");
CREATE INDEX "catalog_curso_curso_nivel_idx" ON "catalog_curso" ("curso", "nivel", "orden");

-- La referencia a nivel de lección se CENTRALIZA en catalog_curso: se retiran
-- las columnas que se habían agregado a catalog_lesson (migración 20260825000000).
ALTER TABLE "catalog_lesson" DROP COLUMN "contenido";
ALTER TABLE "catalog_lesson" DROP COLUMN "video_url";
ALTER TABLE "catalog_lesson" DROP COLUMN "material";
ALTER TABLE "catalog_lesson" DROP COLUMN "material_usuario";
ALTER TABLE "catalog_lesson" DROP COLUMN "actividades";
