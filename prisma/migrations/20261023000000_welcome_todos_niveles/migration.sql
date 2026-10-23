-- Welcome para TODOS los niveles: nivel NULL = lo puede agendar un niño de
-- cualquier nivel (como campaña, país, curso y salón vacíos = todos).
-- El CHECK sigue valiendo para los valores no nulos.
ALTER TABLE "scheduling_welcome" ALTER COLUMN "nivel" DROP NOT NULL;
ALTER TABLE "scheduling_welcome" ALTER COLUMN "nivel" DROP DEFAULT;
