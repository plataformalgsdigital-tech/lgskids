-- LINKS DE CLUBES (2026-10-28): salas de Zoom propias de los Clubs, distintas de
-- la del advisor. Cada una dice qué DÍA de la semana se usa (0 = domingo …
-- 6 = sábado, como `Date.getDay()`) y en qué horario; al crear un Club se elige
-- de las de ese día. La sesión guarda la REFERENCIA, no una copia del enlace:
-- corregir el enlace aquí lo corrige en todas sus sesiones.
CREATE TABLE "scheduling_link_club" (
  "id"          UUID PRIMARY KEY,
  "nombre"      TEXT NOT NULL CHECK (length(trim("nombre")) > 0),
  "dia_semana"  SMALLINT NOT NULL CHECK ("dia_semana" BETWEEN 0 AND 6),
  "horario"     TEXT NOT NULL CHECK (length(trim("horario")) > 0),
  "link"        TEXT NOT NULL CHECK ("link" ~* '^https?://'),
  "activo"      BOOLEAN NOT NULL DEFAULT true,
  "creado_por"  UUID REFERENCES "identity_user"("id") ON DELETE SET NULL,
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un enlace en uso no se borra (se desactiva): las sesiones lo siguen leyendo.
ALTER TABLE "scheduling_session"
  ADD COLUMN "link_club_id" UUID REFERENCES "scheduling_link_club"("id") ON DELETE RESTRICT;

CREATE INDEX "scheduling_session_link_club_id_idx" ON "scheduling_session" ("link_club_id")
  WHERE "link_club_id" IS NOT NULL;

-- Mantener la tabla es una opción de Sesiones; la tiene quien crea eventos.
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'op.sesiones.links_clubes', 'Links de Clubes: crear, editar y desactivar', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id
  JOIN access_permission po ON (po.code, pb.code) IN (('op.sesiones.links_clubes', 'eventos.crear'))
ON CONFLICT DO NOTHING;
