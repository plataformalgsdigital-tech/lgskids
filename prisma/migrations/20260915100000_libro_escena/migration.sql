-- La ESCENA: el rediseño como dato (2026-09-15).
--
-- Hasta ahora la página se pintaba con la hoja del PDF aplanada, y ahí dentro
-- viene el arte VIEJO: el mapache antiguo, los globos con erratas, la IP de
-- terceros. Servía para leer el libro, no para verlo rediseñado.
--
-- `escena` describe la página POR CAPAS —plantilla, personaje canónico, globo,
-- ilustración— para armarla sin la hoja aplanada. Cuando existe, manda; cuando
-- no, se sigue pintando la imagen. Así el rediseño avanza PÁGINA A PÁGINA sin
-- romper las 55 que ya se leen, y sin que nadie tenga que esperar a que estén
-- todas.
--
-- Va en JSONB por lo mismo que los elementos: cada plantilla tiene su forma y
-- el editor la define. La base guarda el documento.
ALTER TABLE "catalog_libro_pagina"
  ADD COLUMN "escena" jsonb;

COMMENT ON COLUMN "catalog_libro_pagina"."escena" IS
  'Composición por capas del rediseño. NULL = todavía se pinta la hoja aplanada.';
