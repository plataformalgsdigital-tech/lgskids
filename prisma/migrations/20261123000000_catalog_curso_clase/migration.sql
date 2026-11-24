-- Catálogo Curso: la CLASE de cada lección (p. ej. "Class 1 · Welcome and meet each other").
-- Texto libre y opcional: lo carga Gestión de Contenido o el CSV, y el modal de la sesión
-- la muestra junto al nivel y la unidad.
ALTER TABLE "catalog_curso" ADD COLUMN "clase" TEXT;
