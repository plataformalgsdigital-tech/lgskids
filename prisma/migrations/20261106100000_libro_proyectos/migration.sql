-- LIBRO DEL ALUMNO EN EL SERVIDOR + PROYECTOS CON REVISIÓN DEL GUÍA (2026-11-06).
--
-- Los libros interactivos (contrato `Integracion_Proyectos_LGS.md`) traen un
-- proyecto escrito por unidad que el niño ENTREGA y el guía REVISA. El libro
-- escribe las entregas en su almacenamiento; la plataforma las REGISTRA aquí,
-- valida cada una con la misma regla del libro (`planificarEntregas`) y es la
-- ÚNICA que escribe revisiones y autorizaciones. Lo que diga el navegador no
-- prueba nada: estas tablas son la versión autenticada.
--
-- NO es progresión (regla 4): el proyecto aprobado no mueve medallas; la medalla
-- sigue saliendo del cuestionario que registra el guía.

-- Lo último que el libro guardó de cada clave (evaluaciones, práctica,
-- borradores): un REGISTRO para que el guía vea los resultados y para que el
-- niño recupere su avance en otro dispositivo.
CREATE TABLE "catalog_libro_estado" (
    "child_person_id" UUID NOT NULL,
    "curso" "catalog_course_tipo" NOT NULL,
    "nivel" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_libro_estado_pkey" PRIMARY KEY ("child_person_id", "curso", "nivel", "clave"),
    CONSTRAINT "catalog_libro_estado_child_fkey"
        FOREIGN KEY ("child_person_id") REFERENCES "people_person"("id") ON DELETE CASCADE
);

-- Cada versión ENTREGADA: inmutable una vez registrada.
CREATE TABLE "catalog_proyecto_entrega" (
    "id" UUID NOT NULL,
    "child_person_id" UUID NOT NULL,
    "curso" "catalog_course_tipo" NOT NULL,
    "nivel" TEXT NOT NULL,
    "unidad" SMALLINT NOT NULL,
    "intento" SMALLINT NOT NULL,
    -- El identificador que generó el libro: registrar dos veces la misma
    -- entrega (el libro reenvía su historial completo) no la duplica.
    "submission_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    -- La hora que informó el navegador y la del servidor al recibirla.
    "enviado_en" TEXT,
    "recibido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_proyecto_entrega_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "catalog_proyecto_entrega_unidad_check" CHECK ("unidad" BETWEEN 1 AND 4),
    CONSTRAINT "catalog_proyecto_entrega_intento_check" CHECK ("intento" BETWEEN 1 AND 99),
    CONSTRAINT "catalog_proyecto_entrega_texto_check" CHECK (char_length("texto") BETWEEN 1 AND 8000),
    CONSTRAINT "catalog_proyecto_entrega_child_fkey"
        FOREIGN KEY ("child_person_id") REFERENCES "people_person"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "catalog_proyecto_entrega_submission"
    ON "catalog_proyecto_entrega" ("child_person_id", "curso", "nivel", "submission_id");
-- Dos pestañas no pueden registrar el mismo intento.
CREATE UNIQUE INDEX "catalog_proyecto_entrega_intento"
    ON "catalog_proyecto_entrega" ("child_person_id", "curso", "nivel", "unidad", "intento");

-- Revisiones del guía. Varias sobre la misma entrega: prevalece la última.
CREATE TABLE "catalog_proyecto_revision" (
    "id" UUID NOT NULL,
    "entrega_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "puntajes" SMALLINT[] NOT NULL,
    "comentario" TEXT NOT NULL DEFAULT '',
    "revisado_por" UUID NOT NULL,
    "revisado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_proyecto_revision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "catalog_proyecto_revision_decision_check"
        CHECK ("decision" IN ('approved', 'changes_requested')),
    CONSTRAINT "catalog_proyecto_revision_puntajes_check"
        CHECK (array_length("puntajes", 1) = 4 AND 0 <= ALL ("puntajes") AND 2 >= ALL ("puntajes")),
    CONSTRAINT "catalog_proyecto_revision_entrega_fkey"
        FOREIGN KEY ("entrega_id") REFERENCES "catalog_proyecto_entrega"("id") ON DELETE CASCADE,
    CONSTRAINT "catalog_proyecto_revision_autor_fkey"
        FOREIGN KEY ("revisado_por") REFERENCES "identity_user"("id")
);
CREATE INDEX "catalog_proyecto_revision_entrega_idx" ON "catalog_proyecto_revision" ("entrega_id");

-- Oportunidades extra que autoriza el guía: `max_entregas` es el TOTAL
-- permitido, no lo que se suma (4 = una cuarta oportunidad).
CREATE TABLE "catalog_proyecto_autorizacion" (
    "id" UUID NOT NULL,
    "child_person_id" UUID NOT NULL,
    "curso" "catalog_course_tipo" NOT NULL,
    "nivel" TEXT NOT NULL,
    "unidad" SMALLINT NOT NULL,
    "max_entregas" SMALLINT NOT NULL,
    "autorizado_por" UUID NOT NULL,
    "autorizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_proyecto_autorizacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "catalog_proyecto_autorizacion_unidad_check" CHECK ("unidad" BETWEEN 1 AND 4),
    CONSTRAINT "catalog_proyecto_autorizacion_max_check" CHECK ("max_entregas" BETWEEN 4 AND 99),
    CONSTRAINT "catalog_proyecto_autorizacion_child_fkey"
        FOREIGN KEY ("child_person_id") REFERENCES "people_person"("id") ON DELETE CASCADE,
    CONSTRAINT "catalog_proyecto_autorizacion_autor_fkey"
        FOREIGN KEY ("autorizado_por") REFERENCES "identity_user"("id")
);
CREATE INDEX "catalog_proyecto_autorizacion_nino_idx"
    ON "catalog_proyecto_autorizacion" ("child_person_id", "curso", "nivel", "unidad");
