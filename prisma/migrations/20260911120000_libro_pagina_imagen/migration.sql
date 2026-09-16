-- La página del libro tiene IMAGEN (2026-09-11).
--
-- El visor mostraba la estructura de la página —las consignas, la narración,
-- los campos— pero no la página: el niño veía cajas de texto donde debía ver
-- su lámina dibujada. El cuadernillo es un objeto visual y sin el dibujo no es
-- el cuadernillo.
--
-- La imagen es UNA CAPA, no el libro entero. Los elementos siguen viviendo en
-- `elementos` y se pintan encima o al lado; cambiar el dibujo es actualizar
-- esta columna y nada más. Eso es lo que permitirá el rediseño: hoy la capa es
-- la página del PDF aplanada —con el arte viejo y la IP de terceros dentro— y
-- mañana será la ilustración nueva, sin tocar el contenido.
--
-- Apunta a `files_object`, que ya optimiza a WebP al subir: las páginas
-- rasterizadas entran por el mismo camino que el resto del arte.
ALTER TABLE "catalog_libro_pagina"
  ADD COLUMN "imagen_file_id" uuid REFERENCES "files_object"("id") ON DELETE SET NULL;

-- Recorrer un libro pide la imagen de cada página: que el índice la lleve
-- evita volver a la tabla por cada una.
CREATE INDEX "catalog_libro_pagina_imagen"
  ON "catalog_libro_pagina" ("libro_id", "imagen_file_id");
