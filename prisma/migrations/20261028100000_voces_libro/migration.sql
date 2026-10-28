-- VOCES DEL LIBRO (2026-10-28): los audios de ElevenLabs de lo que lee el libro
-- interactivo, con la voz de quien lo dice (la guía, Simba, Rooky o Dodo), y las
-- frases EXTRA de los personajes por página (instrucciones y ánimo).

-- Un audio por frase y por libro (curso·nivel). La CLAVE sale del texto
-- (`claveVoz`), la misma que calcula el libro para pedir `audios/<clave>.mp3`.
CREATE TABLE "catalog_libro_voz" (
  "id"            UUID PRIMARY KEY,
  "curso"         TEXT NOT NULL,
  "nivel"         TEXT NOT NULL,
  "clave"         TEXT NOT NULL CHECK ("clave" ~ '^[0-9a-f]{16}$'),
  "personaje"     TEXT NOT NULL CHECK ("personaje" IN ('GUIA', 'SIMBA', 'ROOKY', 'DODO')),
  "texto"         TEXT NOT NULL CHECK (length("texto") BETWEEN 1 AND 1000),
  -- De dónde salió: del libro, o de una intervención de personaje.
  "origen"        TEXT NOT NULL CHECK ("origen" IN ('LIBRO', 'INTERVENCION')),
  "estado"        TEXT NOT NULL DEFAULT 'PENDIENTE'
                  CHECK ("estado" IN ('PENDIENTE', 'GENERADO', 'ERROR')),
  "voice_id"      TEXT,
  "modelo"        TEXT,
  "file_id"       UUID,
  "error"         TEXT,
  "creado_en"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generado_en"   TIMESTAMPTZ(3),
  UNIQUE ("curso", "nivel", "clave")
);

-- Frases de los personajes que aparecen al abrir una página del libro.
-- `pagina` es la que VE el niño ("Página 5 / 28"), como en los videos.
CREATE TABLE "catalog_libro_intervencion" (
  "id"            UUID PRIMARY KEY,
  "curso"         TEXT NOT NULL,
  "nivel"         TEXT NOT NULL,
  "pagina"        INTEGER NOT NULL CHECK ("pagina" BETWEEN 1 AND 999),
  "personaje"     TEXT NOT NULL CHECK ("personaje" IN ('GUIA', 'SIMBA', 'ROOKY', 'DODO')),
  "texto"         TEXT NOT NULL CHECK (length(trim("texto")) BETWEEN 1 AND 300),
  "orden"         INTEGER NOT NULL DEFAULT 1,
  "activo"        BOOLEAN NOT NULL DEFAULT true,
  "creado_en"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "catalog_libro_intervencion_libro_idx"
  ON "catalog_libro_intervencion" ("curso", "nivel", "pagina", "orden");

-- Las de JUNIOR·ROOKIE: instrucciones y ánimo, en inglés A1 y con la
-- personalidad de cada uno (Rooky alegre, Simba la perrita que corre, Dodo el
-- que canta). Se editan desde Mantenimiento Académico › Voces del libro.
INSERT INTO "catalog_libro_intervencion" ("id", "curso", "nivel", "pagina", "personaje", "texto", "orden") VALUES
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE',  1, 'ROOKY', 'Hi, I''m Rooky! Say your name out loud. You can do it!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE',  2, 'SIMBA', 'Woof! Pick a color and paint the star. Great job!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE',  3, 'DODO',  'Let''s count together! Point to each number and say it.', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE',  4, 'ROOKY', 'Listen and repeat the letters. You are super!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE',  5, 'SIMBA', 'Wave your hand and say hello to your friends!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE',  6, 'DODO',  'Hi, I''m Dodo! What''s your name? Tell me!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE',  7, 'ROOKY', 'How do you feel today? Show me a happy face!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE',  8, 'SIMBA', 'Look around you. Can you find something blue?', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE',  9, 'DODO',  'Let''s count to ten! Clap for every number.', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 10, 'SIMBA', 'What do you like? Tell your family in English!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 11, 'ROOKY', 'Mission time! Listen carefully. We can do it together!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 12, 'DODO',  'Sing the alphabet with me! A, B, C!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 13, 'SIMBA', 'Stand up! Jump, clap and dance with me!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 14, 'ROOKY', 'Yes, you can! Say it with me: I can jump!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 15, 'DODO',  'Is it big or small? Look carefully!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 16, 'ROOKY', 'Big and small, hot and cold. You are learning so fast!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 17, 'SIMBA', 'You are a great explorer! Let''s find the lens!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 18, 'ROOKY', 'Is it day or night? Listen and choose.', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 20, 'DODO',  'Look out the window. How is the weather today?', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 22, 'SIMBA', 'Great work! Put on your coat. Let''s plan the trip!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 23, 'DODO',  'Say the days with me, from Monday to Sunday!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 25, 'ROOKY', 'I am first! Can you say second and third?', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 27, 'SIMBA', 'What do you do on the weekend? Tell me!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 28, 'ROOKY', 'Hooray! You did it, explorer! We are so proud of you!', 1),
  (gen_random_uuid(), 'JUNIOR', 'ROOKIE', 28, 'DODO',  'See you in Champion! Keep practicing every day!', 2);

-- Opciones de la pantalla (producción no corre el seed): consultar con
-- `catalogo.ver`; generar (gasta créditos) y editar intervenciones con
-- `catalogo.gestionar`.
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'op.mant.voces', 'Voces del libro (consulta y escucha)', now()),
    (gen_random_uuid(), 'op.mant.voces_generar', 'Generar voces (gasta créditos de ElevenLabs) e intervenciones de los personajes', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id
  JOIN access_permission po ON (po.code, pb.code) IN (
       ('op.mant.voces', 'catalogo.ver'),
       ('op.mant.voces_generar', 'catalogo.gestionar'))
ON CONFLICT DO NOTHING;
