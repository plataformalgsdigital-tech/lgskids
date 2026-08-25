-- Capa de REFERENCIA curricular (2026-08-25), adaptada al catálogo normalizado
-- de KIDS (a diferencia de la tabla plana NIVELES de MOSAICO). El material
-- cuelga de las tablas que ya existen: lección, nivel y quiz.

-- LECCIÓN: temario, video y material (guías del guía / libros del alumno) +
-- actividades. Los JSONB quedan NULL por defecto (la referencia se carga luego);
-- el lector los normaliza a [].
ALTER TABLE "catalog_lesson" ADD COLUMN "contenido" TEXT;               -- temario (markdown)
ALTER TABLE "catalog_lesson" ADD COLUMN "video_url" TEXT;               -- key de storage o URL
ALTER TABLE "catalog_lesson" ADD COLUMN "material" JSONB;               -- guías del guía: [{nombre,url}]
ALTER TABLE "catalog_lesson" ADD COLUMN "material_usuario" JSONB;       -- libros del alumno: [{nombre,url}]
ALTER TABLE "catalog_lesson" ADD COLUMN "actividades" JSONB;            -- WordWall/links: [{nombre,link}]

-- NIVEL: descripción + recursos (a nivel de nivel, SIN duplicar por lección).
ALTER TABLE "catalog_level" ADD COLUMN "descripcion" TEXT;
ALTER TABLE "catalog_level" ADD COLUMN "recursos" JSONB;                -- [{nombre,link}]

-- QUIZ: modo de evaluación + tiempo. Las preguntas viven en la columna JSONB
-- ya existente `catalog_quiz.contenido` (reservada para "la estructura").
ALTER TABLE "catalog_quiz" ADD COLUMN "modo" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "catalog_quiz"
  ADD CONSTRAINT "catalog_quiz_modo_check" CHECK ("modo" IN ('IA', 'MANUAL'));
ALTER TABLE "catalog_quiz" ADD COLUMN "minutos" INTEGER;
