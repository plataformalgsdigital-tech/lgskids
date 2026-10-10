-- CREACIÓN DE PERFIL DEL NIÑO (2026-10-10).
--
-- Al aprobarse el contrato, KIDS le manda al APODERADO por WhatsApp un enlace
-- donde el niño ve su usuario, elige su clave, completa su perfil y agenda su
-- Welcome. Réplica del /nuevo-usuario de LGS con tres diferencias: el enlace es
-- un TOKEN (32 bytes; aquí solo su hash) y no el id del registro, fija la clave
-- UNA sola vez, y la clave se guarda con hash (más la copia de la bóveda), no en
-- texto plano.

ALTER TABLE "people_person"
  ADD COLUMN "sobre_ti" TEXT,
  ADD COLUMN "hobbies" TEXT,
  ADD COLUMN "perfil_completado_en" TIMESTAMPTZ(3);

CREATE TABLE "contracts_enlace_perfil" (
  "id"              UUID PRIMARY KEY,
  "child_person_id" UUID NOT NULL REFERENCES "people_person"("id") ON DELETE CASCADE,
  "contract_id"     UUID REFERENCES "contracts_contract"("id") ON DELETE SET NULL,
  "token_hash"      TEXT NOT NULL UNIQUE,
  "creado_en"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creado_por"      UUID REFERENCES "identity_user"("id"),
  "usado_en"        TIMESTAMPTZ(3),
  "revocado_en"     TIMESTAMPTZ(3)
);

-- UN enlace vivo por niño: reenviar revoca el anterior en la misma transacción.
CREATE UNIQUE INDEX "contracts_enlace_perfil_vigente"
  ON "contracts_enlace_perfil" ("child_person_id")
  WHERE "usado_en" IS NULL AND "revocado_en" IS NULL;

INSERT INTO "notifications_plantilla" (id, slug, nombre, descripcion, contenido) VALUES
    (gen_random_uuid(), 'creacion-perfil-kids', 'Creación de perfil',
     'Se envía SOLA al aprobar el contrato (y con "Reenviar enlace de perfil" en la ficha del niño). Lleva el enlace personal del niño.',
     E'¡Hola {{apoderado}}! 👋\n\n*{{nombre}}* ya es parte de *LGS Kids* 🎉\n\nPara terminar su registro, abre este enlace. Ahí verá su usuario, creará su clave, completará su perfil y agendará su sesión *Welcome*:\n\n{{enlace}}\n\n👤 Su usuario: *{{usuario}}*\n\nEl enlace es personal: no lo compartas.\n¡Bienvenidos a la familia LGS! 🚀')
ON CONFLICT (slug) DO NOTHING;
