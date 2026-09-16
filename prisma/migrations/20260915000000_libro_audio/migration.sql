-- Audio del cuadernillo (2026-09-15).
--
-- Las pistas del material vienen nombradas POR PLIEGO, no por página:
-- `PAG16-07.mp3` son 13 pistas de la hoja 16 del PDF, que en el libro son DOS
-- páginas impresas (la 23 y la 24). Cuál de las trece pertenece a cuál no está
-- escrito en ninguna parte — habría que escucharlas.
--
-- Así que se guarda con la llave que el dato SÍ tiene: el pliego. Repartirlas
-- a ojo entre las dos páginas sería inventar una precisión que no existe, y el
-- día que alguien las escuche no sabría cuáles moví yo.
--
-- `elemento_id` queda NULL a propósito: es el hueco para decir "esta pista
-- narra este globo". Se llena cuando alguien las escuche, no antes.
CREATE TABLE "catalog_libro_audio" (
  "id"               uuid PRIMARY KEY,
  "libro_id"         uuid NOT NULL REFERENCES "catalog_libro"("id") ON DELETE CASCADE,
  "pliego"           integer NOT NULL,
  "orden"            integer NOT NULL,
  "file_id"          uuid NOT NULL REFERENCES "files_object"("id") ON DELETE CASCADE,
  "nombre_original"  text NOT NULL,
  -- Qué elemento de la página narra. NULL = todavía sin asignar.
  "elemento_id"      text,
  "created_at"       timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_libro_audio_pliego_valido" CHECK ("pliego" >= 1),
  CONSTRAINT "catalog_libro_audio_orden_valido" CHECK ("orden" >= 1)
);

-- Reimportar reemplaza: la misma pista no puede entrar dos veces.
CREATE UNIQUE INDEX "catalog_libro_audio_clave"
  ON "catalog_libro_audio" ("libro_id", "pliego", "orden");

-- Pintar una página pide las pistas de SU pliego.
CREATE INDEX "catalog_libro_audio_por_pliego"
  ON "catalog_libro_audio" ("libro_id", "pliego", "orden");
