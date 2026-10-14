-- CANCELACIÓN DE SESIÓN POR EL GUÍA (2026-10-14).
--
-- El guía AVISA que no puede dictar una sesión; quien la CANCELA es
-- administración, y eso cuenta en el control de horas del guía. Administración
-- puede cubrirla con otro guía: el reemplazo es SOLO de esa sesión (escribe
-- `scheduling_session.guia_user_id`, como el "Cambiar guía" de la sesión) y no
-- toca las demás.
--
-- `session_id` queda en NULL si la sesión se borra (la regeneración de un salón
-- es destructiva): por eso la fila guarda su propia copia de salón, fecha e
-- instante, y el control de horas del guía no pierde la cancelación.
CREATE TABLE "scheduling_cancelacion" (
  "id"                     UUID PRIMARY KEY,
  "session_id"             UUID REFERENCES "scheduling_session"("id") ON DELETE SET NULL,
  "classroom_id"           UUID NOT NULL,
  "fecha"                  DATE NOT NULL,
  "starts_at"              TIMESTAMPTZ(3) NOT NULL,
  -- El guía que cancela: el EFECTIVO de la sesión al momento del aviso.
  "guia_user_id"           UUID NOT NULL REFERENCES "identity_user"("id"),
  "motivo"                 TEXT NOT NULL,
  "estado"                 TEXT NOT NULL DEFAULT 'PENDIENTE'
                           CHECK ("estado" IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  "solicitada_por"         UUID NOT NULL REFERENCES "identity_user"("id"),
  "created_at"             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resuelta_por"           UUID REFERENCES "identity_user"("id"),
  "resuelta_en"            TIMESTAMPTZ(3),
  "nota_resolucion"        TEXT,
  -- Quién la cubrió, si alguien la cubrió. NULL con APROBADA = no se dictó.
  "reemplazo_guia_user_id" UUID REFERENCES "identity_user"("id")
);

-- Un aviso vivo (pendiente o aprobado) por sesión: rechazado, se puede volver a avisar.
CREATE UNIQUE INDEX "scheduling_cancelacion_viva"
  ON "scheduling_cancelacion" ("session_id")
  WHERE "estado" IN ('PENDIENTE', 'APROBADA');
CREATE INDEX "scheduling_cancelacion_estado_idx" ON "scheduling_cancelacion" ("estado", "created_at");
CREATE INDEX "scheduling_cancelacion_guia_idx" ON "scheduling_cancelacion" ("guia_user_id", "starts_at");

-- Control de horas del guía: las sesiones que canceló (aprobadas por admin).
ALTER TABLE "reporting_guia_mes"
  ADD COLUMN "sesiones_canceladas" INTEGER NOT NULL DEFAULT 0;

-- Menú › Servicio › Justificación falta. Producción no corre el seed: se crea y
-- se concede aquí, a quien ya ve a los niños (como el resto de Servicio).
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'menu.servicio_justificacion', 'Justificación falta', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, pn.id
  FROM access_role_permission rp
  JOIN access_permission ph ON ph.id = rp.permission_id AND ph.code = 'personas.ver'
  JOIN access_permission pn ON pn.code = 'menu.servicio_justificacion'
ON CONFLICT DO NOTHING;
