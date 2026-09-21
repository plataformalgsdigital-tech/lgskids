-- Videos del libro interactivo (2026-09-21).
--
-- Los videos iban INCRUSTADOS en el HTML del libro, en base64: 5 canciones
-- llevaban un libro a 105 MB, y el niño bajaba los 11 minutos de video antes de
-- ver la primera página. Ahora el libro los pide por ruta relativa
-- (`videos/<página>-<n>.mp4`) y cada uno se sube aparte, se comprime al subirlo
-- y se publica después de verlo.
--
-- La clave es la del libro, no la del archivo HTML: (curso, nivel, página, n).
-- Reemplazar el HTML de un nivel no toca sus videos. La página es la que VE el
-- niño ("Página 10 / 28"), empezando en 1 — no el índice interno del código del
-- libro, que va uno por detrás: con dos números en juego, el equipo cargaría
-- videos en la página equivocada.
--
-- Estados: PROCESANDO (comprimiendo) → BORRADOR (listo para revisar) →
-- PUBLICADO (lo ve el niño). ERROR si la compresión falla. Un BORRADOR no se
-- sirve al niño: se revisa antes de confirmar.
CREATE TABLE "catalog_material_video" (
  "id"              UUID          NOT NULL,
  "curso"           TEXT          NOT NULL,
  "nivel"           TEXT          NOT NULL,
  "pagina"          INTEGER       NOT NULL,
  "orden"           INTEGER       NOT NULL DEFAULT 1,
  "estado"          TEXT          NOT NULL,
  "nombre_original" TEXT          NOT NULL,
  "bytes_original"  BIGINT        NOT NULL,
  -- El video YA comprimido, en `files`. NULL mientras se procesa o si falló.
  "file_id"         UUID,
  "bytes_final"     BIGINT,
  "duracion_seg"    NUMERIC(8, 2),
  "ancho"           INTEGER,
  "alto"            INTEGER,
  "error"           TEXT,
  "subido_por"      UUID          NOT NULL,
  "creado_en"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "actualizado_en"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "publicado_en"    TIMESTAMPTZ,
  CONSTRAINT "catalog_material_video_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_material_video_estado_check"
    CHECK ("estado" IN ('PROCESANDO', 'BORRADOR', 'PUBLICADO', 'ERROR')),
  CONSTRAINT "catalog_material_video_pagina_check" CHECK ("pagina" BETWEEN 1 AND 999),
  CONSTRAINT "catalog_material_video_orden_check" CHECK ("orden" BETWEEN 1 AND 9)
);

-- UN solo video publicado por casilla del libro: publicar otro en la misma
-- página y número es REEMPLAZAR, y se hace en una transacción.
CREATE UNIQUE INDEX "catalog_material_video_publicado"
  ON "catalog_material_video" ("curso", "nivel", "pagina", "orden")
  WHERE "estado" = 'PUBLICADO';

CREATE INDEX "catalog_material_video_nivel"
  ON "catalog_material_video" ("curso", "nivel");
