-- MISIÓN AUTORIZADA POR EL GUÍA (2026-09-23).
--
-- El libro interactivo abría sus unidades SOLO con sus propias reglas (la 1
-- siempre, la siguiente al completar la anterior). El negocio quiere que sea el
-- GUÍA quien abra la misión de cada unidad —evaluación, juego y souvenir— para
-- los niños de su sesión, cuando la trabajan en clase.
--
-- Una fila = "este niño puede abrir esta parada de este nivel". La `parada` usa
-- la MISMA numeración del mapa y del libro (0 = Welcome/Puerto, 1..4 = las
-- unidades; ver `catalog/domain/unidad-mapa.ts`).
--
-- NO es progresión (regla 4): esto es un PERMISO que alguien concede, no algo
-- derivado de evaluaciones. Las medallas siguen saliendo de `assessment`.
CREATE TABLE "catalog_mision_autorizada" (
    "id" UUID NOT NULL,
    "child_person_id" UUID NOT NULL,
    "curso" "catalog_course_tipo" NOT NULL,
    "nivel" TEXT NOT NULL,
    "parada" SMALLINT NOT NULL,
    -- Desde qué sesión se autorizó: queda la trazabilidad de la clase. Si la
    -- sesión se regenera (borrado destructivo), el permiso NO se pierde.
    "session_id" UUID,
    "autorizado_por" UUID,
    "autorizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_mision_autorizada_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "catalog_mision_autorizada_parada_check" CHECK ("parada" BETWEEN 0 AND 4)
);

-- Autorizar dos veces la misma parada no la duplica: el permiso es un hecho,
-- no un contador.
CREATE UNIQUE INDEX "catalog_mision_autorizada_unica"
    ON "catalog_mision_autorizada" ("child_person_id", "curso", "nivel", "parada");

-- La consulta viva: qué paradas tiene abiertas este niño en este nivel.
CREATE INDEX "catalog_mision_autorizada_nino_idx"
    ON "catalog_mision_autorizada" ("child_person_id", "curso", "nivel");

CREATE INDEX "catalog_mision_autorizada_sesion_idx"
    ON "catalog_mision_autorizada" ("session_id");

ALTER TABLE "catalog_mision_autorizada"
    ADD CONSTRAINT "catalog_mision_autorizada_child_fkey"
    FOREIGN KEY ("child_person_id") REFERENCES "people_person"("id") ON DELETE CASCADE;

ALTER TABLE "catalog_mision_autorizada"
    ADD CONSTRAINT "catalog_mision_autorizada_session_fkey"
    FOREIGN KEY ("session_id") REFERENCES "scheduling_session"("id") ON DELETE SET NULL;

ALTER TABLE "catalog_mision_autorizada"
    ADD CONSTRAINT "catalog_mision_autorizada_autor_fkey"
    FOREIGN KEY ("autorizado_por") REFERENCES "identity_user"("id") ON DELETE SET NULL;
