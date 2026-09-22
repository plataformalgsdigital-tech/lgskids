-- Cuentas de usuario (2026-09-21): clave consultable, ficha del staff,
-- solicitudes de "olvidé mi clave" y fin de contrato a 12 meses.

-- 1) Copia CIFRADA de la clave (AES-256-GCM, llave PASSWORD_VAULT_KEY fuera de
--    la base). Decisión del negocio: el superadmin puede consultar cualquier
--    clave. El acceso sigue verificándose contra `password_hash` (argon2id); esta
--    copia solo sirve para mostrarla. NULL = no hay copia (cuentas anteriores a
--    esta migración, o bóveda sin configurar).
ALTER TABLE "identity_user" ADD COLUMN "password_cifrada" TEXT;

-- 2) Ficha mínima del STAFF (admin, coordinador, guía…): los alumnos y
--    apoderados tienen la suya en `people_person` y el guía completa además la
--    suya en `scheduling_guia`. Con nombres y apellidos se genera el usuario.
CREATE TABLE "identity_perfil" (
  "user_id"        UUID          NOT NULL,
  "nombres"        TEXT          NOT NULL,
  "apellidos"      TEXT          NOT NULL,
  "telefono"       TEXT,
  "actualizado_en" TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT "identity_perfil_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "identity_perfil_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "identity_user" ("id") ON DELETE CASCADE
);

-- 3) "¿Olvidaste tu clave?": la solicitud queda para el equipo, que restablece
--    y entrega la clave nueva. Se guarda lo que la persona ESCRIBIÓ; `user_id`
--    solo si coincide con una cuenta (la respuesta pública es la misma exista o
--    no, para no revelar qué usuarios existen).
CREATE TABLE "identity_solicitud_clave" (
  "id"                 UUID          NOT NULL,
  "username_ingresado" TEXT          NOT NULL,
  "user_id"            UUID,
  "contacto"           TEXT,
  "estado"             TEXT          NOT NULL DEFAULT 'PENDIENTE',
  "ip"                 TEXT,
  "creada_en"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "atendida_en"        TIMESTAMPTZ,
  "atendida_por"       UUID,
  CONSTRAINT "identity_solicitud_clave_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_solicitud_clave_estado_check"
    CHECK ("estado" IN ('PENDIENTE', 'ATENDIDA', 'DESCARTADA')),
  CONSTRAINT "identity_solicitud_clave_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "identity_user" ("id") ON DELETE CASCADE
);
-- Una sola solicitud viva por cuenta: pedirla diez veces no llena la bandeja.
CREATE UNIQUE INDEX "identity_solicitud_clave_pendiente"
  ON "identity_solicitud_clave" ("user_id")
  WHERE "estado" = 'PENDIENTE' AND "user_id" IS NOT NULL;
-- Para el límite por IP de la puerta pública.
CREATE INDEX "identity_solicitud_clave_ip" ON "identity_solicitud_clave" ("ip", "creada_en");

-- 4) Fin de contrato = inicio + 12 meses (regla del negocio, 2026-09-21), más
--    los días de pausa ya cumplidos. Antes se tipeaba a mano. Se recalcula para
--    todo contrato vivo; los INACTIVOS ya cerraron y no se tocan. La aritmética
--    de meses de Postgres recorta al último día (31-ene + 1 mes = 28/29-feb), la
--    misma regla que `finalDeContrato` en el dominio.
UPDATE "contracts_contract" c
   SET "final_contrato" = (c."inicio" + interval '12 months')::date
         + COALESCE((SELECT sum(h."dias_extendidos")
                       FROM "contracts_onhold" h
                      WHERE h."contract_id" = c."id" AND h."dias_extendidos" IS NOT NULL), 0)::int,
       "updated_at" = now()
 WHERE c."estado" <> 'INACTIVO';
