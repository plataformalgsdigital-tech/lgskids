-- CASOS DE ATENCIÓN (2026-10-14): réplica del proceso de MOSAICO ajustada a
-- KIDS. El guía reporta desde la sesión ("Requiere atención"), el reporte abre
-- un caso o se suma a uno abierto, Servicio lo asigna a un área, el área lo
-- gestiona y lo cierra. Las reglas viven en `src/modules/casos/domain/casos.ts`.
--
-- Los valores de tema, estado, área, canal y resultado van como TEXT con CHECK
-- (no ENUM de Postgres): sumar uno es una migración de una línea, y el dominio
-- ya los valida.

CREATE TABLE "casos_caso" (
  "id"                UUID PRIMARY KEY,
  -- `CA-<contrato>-NN`: el contador es por contrato (lo toma un advisory lock).
  "codigo"            VARCHAR(48) NOT NULL UNIQUE,
  "child_person_id"   UUID NOT NULL REFERENCES "people_person"("id") ON DELETE CASCADE,
  "contract_id"       UUID REFERENCES "contracts_contract"("id") ON DELETE SET NULL,
  -- El N° de caso del NIÑO (1, 2, 3…), distinto del contador del código: un
  -- contrato de LGS puede llevar a varios hermanos.
  "numero_caso"       INTEGER NOT NULL,
  "tema"              TEXT NOT NULL
                      CHECK ("tema" IN ('ASISTENCIA','CONDUCTA','DESEMPENO','SALUD','PAGO','OTRO')),
  "estado"            TEXT NOT NULL DEFAULT 'EN_GESTION'
                      CHECK ("estado" IN ('EN_GESTION','REMITIDO_ACADEMICO','REMITIDO_COORDINACION',
                        'REMITIDO_FINANZAS','RESUELTO','SALON_CAMBIADO','CURSO_CAMBIADO',
                        'PAUSA_ACTIVADA','REFUERZO_AGENDADO','SIN_CONTACTO')),
  -- NULL = recién abierto, en la bandeja de Servicio sin asignar.
  "area"              TEXT CHECK ("area" IN ('ACADEMICO','COORDINACION','FINANZAS')),
  "origen"            TEXT NOT NULL DEFAULT 'GUIA' CHECK ("origen" IN ('GUIA','SERVICIO')),
  -- La sesión del primer reporte (SET NULL: la regeneración del salón la borra).
  "session_origen_id" UUID REFERENCES "scheduling_session"("id") ON DELETE SET NULL,
  -- Lo que se acordó con la familia: obligatorio para cerrar (salvo sin contacto).
  "acuerdo"           TEXT,
  "fecha_compromiso"  DATE,
  "responsable"       TEXT,
  "abierto_por"       UUID NOT NULL REFERENCES "identity_user"("id"),
  "abierto_en"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cerrado_por"       UUID REFERENCES "identity_user"("id"),
  "cerrado_en"        TIMESTAMPTZ(3),
  -- Informativo, como en MOSAICO: no inactiva al niño ni libera su cupo.
  "no_continua"       BOOLEAN NOT NULL DEFAULT FALSE,
  "updated_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "casos_caso_nino_idx" ON "casos_caso" ("child_person_id");
CREATE INDEX "casos_caso_estado_idx" ON "casos_caso" ("estado", "abierto_en" DESC);
CREATE INDEX "casos_caso_area_idx" ON "casos_caso" ("area") WHERE "area" IS NOT NULL;

-- Lo que reportó el guía (o el equipo, a su nombre). INMUTABLE: no se edita ni
-- se borra. `leido_*`: Servicio lo vio al abrir el caso.
CREATE TABLE "casos_reporte" (
  "id"              UUID PRIMARY KEY,
  "caso_id"         UUID NOT NULL REFERENCES "casos_caso"("id") ON DELETE CASCADE,
  "child_person_id" UUID NOT NULL REFERENCES "people_person"("id") ON DELETE CASCADE,
  "texto"           TEXT NOT NULL,
  "tema"            TEXT NOT NULL
                    CHECK ("tema" IN ('ASISTENCIA','CONDUCTA','DESEMPENO','SALUD','PAGO','OTRO')),
  "session_id"      UUID REFERENCES "scheduling_session"("id") ON DELETE SET NULL,
  -- A nombre de qué guía va el reporte, y quién lo escribió si no fue él.
  "guia_user_id"    UUID REFERENCES "identity_user"("id"),
  "registrado_por"  UUID NOT NULL REFERENCES "identity_user"("id"),
  "abrio_caso"      BOOLEAN NOT NULL DEFAULT FALSE,
  "leido_en"        TIMESTAMPTZ(3),
  "leido_por"       UUID REFERENCES "identity_user"("id"),
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "casos_reporte_caso_idx" ON "casos_reporte" ("caso_id");
CREATE INDEX "casos_reporte_sesion_idx" ON "casos_reporte" ("session_id", "child_person_id");

-- Intentos de contacto con la familia, numerados por canal. Solo se agregan.
CREATE TABLE "casos_contacto" (
  "id"          UUID PRIMARY KEY,
  "caso_id"     UUID NOT NULL REFERENCES "casos_caso"("id") ON DELETE CASCADE,
  "canal"       TEXT NOT NULL CHECK ("canal" IN ('LLAMADA','WHATSAPP','EMAIL')),
  "intento"     INTEGER NOT NULL,
  "resultado"   TEXT NOT NULL
                CHECK ("resultado" IN ('CONTESTO','NO_CONTESTO','RESPONDIO','SIN_RESPUESTA','PENDIENTE')),
  "observacion" TEXT,
  "autor"       UUID NOT NULL REFERENCES "identity_user"("id"),
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("caso_id", "canal", "intento")
);

-- El seguimiento: cada cambio de estado o de área (con su motivo, que al cerrar
-- es la CONCLUSIÓN) y cada nota. Solo se agrega.
CREATE TABLE "casos_seguimiento" (
  "id"              UUID PRIMARY KEY,
  "caso_id"         UUID NOT NULL REFERENCES "casos_caso"("id") ON DELETE CASCADE,
  "tipo"            TEXT NOT NULL CHECK ("tipo" IN ('ESTADO','NOTA')),
  "estado_anterior" TEXT,
  "estado_nuevo"    TEXT,
  "area"            TEXT,
  "texto"           TEXT NOT NULL,
  "autor"           UUID NOT NULL REFERENCES "identity_user"("id"),
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "casos_seguimiento_caso_idx" ON "casos_seguimiento" ("caso_id", "created_at");

-- Permisos. Producción no corre el seed: se crean y se conceden aquí, a quien
-- ya ve a los niños (el guía no: él reporta desde su sesión con
-- `asistencia.gestionar`). Gestionar se edita luego por rol en el panel.
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'casos.ver', 'Ver casos de atención', now()),
    (gen_random_uuid(), 'casos.gestionar', 'Gestionar casos de atención', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, pn.id
  FROM access_role_permission rp
  JOIN access_permission ph ON ph.id = rp.permission_id AND ph.code = 'personas.ver'
  JOIN access_permission pn ON pn.code IN ('casos.ver', 'casos.gestionar')
ON CONFLICT DO NOTHING;
