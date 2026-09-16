-- La página tiene DOS números (2026-09-11).
--
-- `pagina` es el ORDEN de lectura (0, 1, 2…): lo que el visor usa para pasar
-- páginas y la llave junto al libro.
--
-- `numero_impreso` es el número que el niño VE impreso en su cuadernillo, y
-- puede no existir: las portadas de cada parada —el "Welcome" y el "All about
-- me"— ocupan un pliego entero y NO llevan número. Contarlas como si lo
-- tuvieran fue exactamente el error que desalineó el libro: la portada de la
-- parada 1 se numeró como 15 y corrió todas las demás una posición.
--
-- Separarlos permite que el orden sea denso y sin huecos (que es lo que el
-- visor necesita) mientras el número mostrado sigue al papel (que es lo que el
-- niño necesita cuando compara con su copia impresa).
ALTER TABLE "catalog_libro_pagina"
  ADD COLUMN "numero_impreso" integer;

COMMENT ON COLUMN "catalog_libro_pagina"."pagina" IS
  'Orden de lectura, denso desde 0. Llave junto a libro_id.';
COMMENT ON COLUMN "catalog_libro_pagina"."numero_impreso" IS
  'Número impreso en el cuadernillo. NULL en las portadas, que no llevan.';
