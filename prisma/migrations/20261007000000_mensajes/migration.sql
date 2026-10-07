-- Administración › Mensajes (2026-10-07): plantillas de WhatsApp y su gestión,
-- con el MISMO servicio de LGS (Whapi.cloud).
--
-- 1) Plantillas: texto libre con marcadores {{clave}}, como en LGS
--    (MESSAGE_TEMPLATES). El slug es la llave estable y no se edita; desactivar
--    reemplaza a borrar, para que el historial siga diciendo qué se mandó.
CREATE TABLE "notifications_plantilla" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" TEXT,
    "contenido" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_plantilla_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_plantilla_contenido_largo" CHECK (char_length("contenido") <= 1000),
    CONSTRAINT "notifications_plantilla_creado_por_fkey" FOREIGN KEY ("creado_por")
        REFERENCES "identity_user"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "notifications_plantilla_slug_key" ON "notifications_plantilla"("slug");

-- 2) El outbox pasa a ser también el HISTORIAL de Gestión (LGS no guarda nada):
--    quién mandó, con qué plantilla, a qué niño, y el instante en que un envío
--    lo tomó (para que el worker y el envío inmediato no manden dos veces).
ALTER TABLE "notifications_outbox"
    ADD COLUMN "plantilla_slug" VARCHAR(60),
    ADD COLUMN "child_person_id" UUID,
    ADD COLUMN "enviado_por" UUID,
    ADD COLUMN "tomada_en" TIMESTAMPTZ(3),
    ADD CONSTRAINT "notifications_outbox_enviado_por_fkey" FOREIGN KEY ("enviado_por")
        REFERENCES "identity_user"("id") ON DELETE SET NULL,
    ADD CONSTRAINT "notifications_outbox_child_person_id_fkey" FOREIGN KEY ("child_person_id")
        REFERENCES "people_person"("id") ON DELETE SET NULL;
CREATE INDEX "notifications_outbox_created_at_idx" ON "notifications_outbox"("created_at");

-- 3) Permisos. Producción no corre el seed, así que se crean y conceden aquí,
--    con la misma regla que el seed: solo AÑADE y es idempotente.
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'mensajes.enviar', 'Enviar mensajes de WhatsApp', now()),
    (gen_random_uuid(), 'mensajes.plantillas', 'Gestionar plantillas de mensajes', now()),
    (gen_random_uuid(), 'menu.mensajes', 'Mensajes', now())
ON CONFLICT (code) DO NOTHING;

-- Enviar (y ver el ítem): quien gestiona contratos, que es quien entrega las
-- credenciales. Plantillas: quien gestiona el catálogo.
INSERT INTO access_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, pn.id
  FROM access_role_permission rp
  JOIN access_permission ph ON ph.id = rp.permission_id AND ph.code = 'contratos.gestionar'
  JOIN access_permission pn ON pn.code IN ('mensajes.enviar', 'menu.mensajes')
ON CONFLICT DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, pn.id
  FROM access_role_permission rp
  JOIN access_permission ph ON ph.id = rp.permission_id AND ph.code = 'catalogo.gestionar'
  JOIN access_permission pn ON pn.code IN ('mensajes.plantillas', 'menu.mensajes')
ON CONFLICT DO NOTHING;

-- 4) Plantillas de partida. `credenciales-kids` es la que usa el botón de la
--    ficha del niño; se puede editar el texto, no el slug.
INSERT INTO "notifications_plantilla" (id, slug, nombre, descripcion, contenido) VALUES
    (gen_random_uuid(), 'credenciales-kids', 'Credenciales de acceso',
     'Usuario y clave del niño para entrar a la plataforma. La usa el botón de la ficha del niño.',
     E'¡Hola {{apoderado}}! 👋\n\nBienvenidos a *LGS Kids*. Estos son los datos de acceso de *{{nombre}}* a la plataforma:\n\n🌐 https://app.lgskidsplataforma.com/login\n👤 Usuario: *{{usuario}}*\n🔑 Clave: *{{clave}}*\n\nAl entrar por primera vez, la plataforma pedirá cambiar la clave.\n\n{{curso}} · {{salon}}\n¡Nos vemos en clase! 🚀'),
    (gen_random_uuid(), 'recordatorio-clase', 'Recordatorio de clase',
     'Aviso general de la próxima sesión del salón.',
     E'¡Hola {{apoderado}}! 👋 Te recordamos que *{{nombre}}* tiene su sesión de *LGS Kids* ({{salon}}). Puede entrar desde https://app.lgskidsplataforma.com con su usuario *{{usuario}}*. ¡Te esperamos!')
ON CONFLICT (slug) DO NOTHING;
