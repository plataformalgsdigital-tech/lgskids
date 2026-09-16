-- Libro interactivo: el cuadernillo impreso como datos (2026-09-11).
--
-- El niño hoy trabaja sobre un PowerPoint con animaciones y sonido. Eso no deja
-- rastro: lo que escribe no lo ve el guía y no puede alimentar la progresión.
-- Aquí el libro pasa a ser DATO — páginas y elementos— para que el lector web
-- lo pinte y las respuestas entren por el único camino que ya existe.
--
-- POR QUÉ LOS ELEMENTOS VAN EN JSONB Y NO EN TABLAS
-- La transcripción real de JUNIOR·ROOKIE UNIT 0-1 da 86 elementos de 13 tipos
-- (texto 21, narracion 18, referencia 13, dibujo 8, video 6, unir 4, marcar 4,
-- insignia 2, audio 2, sopa 2, y uno solo de banco, opcion, autocomprobar,
-- crucigrama, letras y casilla). Cada tipo tiene forma propia —`unir` lleva
-- pares, `letras` campos con la palabra a medias, `crucigrama` una cuadrícula—
-- y seis de ellos aparecen UNA vez. Normalizar eso serían quince tablas casi
-- vacías. Es el mismo criterio que ya sigue `catalog_curso.quiz` y
-- `catalog_arte_hotspot.data`: la forma la define quien edita, la base guarda
-- el documento.
--
-- LA LLAVE ES LA PARADA, NO LA UNIDAD
-- `parada` 0..4 es la del mapa de la isla: la 0 es el Welcome, que desde el
-- 2026-09-11 es parada de pleno derecho con su propia insignia. Un cuadernillo
-- puede cubrir más de una: UNIT 0-1 cubre la 0 y la 1, y por eso entrega DOS
-- insignias ("Let's chat about me" y "Let's explore").
--
-- PÁGINA Y PLIEGO SON COSAS DISTINTAS
-- El PDF va en pliegos (una hoja = dos páginas numeradas). `pagina` es la que
-- ve el niño y es la que manda; `pliego` solo sirve para volver al original.

-- Un cuadernillo. `codigo` es como lo llama el material ("UNIT 0-1").
CREATE TABLE "catalog_libro" (
  "id"          uuid PRIMARY KEY,
  "curso"       "catalog_course_tipo" NOT NULL,
  "nivel"       text NOT NULL,
  "codigo"      text NOT NULL,
  "titulo"      text,
  "fuente"      text,
  "created_at"  timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "catalog_libro_clave"
  ON "catalog_libro" ("curso", "nivel", "codigo");

-- Una página numerada del libro, con sus elementos.
CREATE TABLE "catalog_libro_pagina" (
  "id"         uuid PRIMARY KEY,
  "libro_id"   uuid NOT NULL REFERENCES "catalog_libro"("id") ON DELETE CASCADE,
  "pagina"     integer NOT NULL,
  "pliego"     integer,
  "parada"     integer NOT NULL,
  "titulo"     text,
  "elementos"  jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT "catalog_libro_pagina_parada_valida"
    CHECK ("parada" >= 0 AND "parada" <= 4),
  CONSTRAINT "catalog_libro_pagina_numero_valido"
    CHECK ("pagina" >= 0),
  -- Los elementos son SIEMPRE una lista, nunca un objeto suelto: el lector
  -- recorre; si llega un objeto, falla al pintar y no al guardar.
  CONSTRAINT "catalog_libro_pagina_elementos_lista"
    CHECK (jsonb_typeof("elementos") = 'array')
);

CREATE UNIQUE INDEX "catalog_libro_pagina_clave"
  ON "catalog_libro_pagina" ("libro_id", "pagina");

-- Recorrer un libro es leerlo en orden de página.
CREATE INDEX "catalog_libro_pagina_orden"
  ON "catalog_libro_pagina" ("libro_id", "parada", "pagina");

-- El NOMBRE de la insignia de cada parada ("Let's chat about me").
--
-- Va en tabla propia y no dentro del libro porque su llave es la misma que la
-- del ARTE (`catalog_insignia_parada`, entidadId CURSO:NIVEL:PARADA): nombre e
-- imagen describen la misma cosa y deben poder buscarse igual. Colgarla del
-- cuadernillo ataría el premio a que el libro esté cargado.
CREATE TABLE "catalog_insignia" (
  "id"          uuid PRIMARY KEY,
  "curso"       "catalog_course_tipo" NOT NULL,
  "nivel"       text NOT NULL,
  "parada"      integer NOT NULL,
  "nombre"      text NOT NULL,
  "created_at"  timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_insignia_parada_valida"
    CHECK ("parada" >= 0 AND "parada" <= 4)
);

CREATE UNIQUE INDEX "catalog_insignia_clave"
  ON "catalog_insignia" ("curso", "nivel", "parada");
