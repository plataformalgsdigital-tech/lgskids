-- Facturas de los guías (2026-11-06). El guía la SUBE AQUÍ ("Mis horas y facturas")
-- y LGS la toma desde KIDS para su flujo de Gestión Advisors (lectura con IA,
-- verificación y pago). LGS devuelve cada cambio de estado para que el guía lo vea.
--
-- estado: ENVIANDO   = subida aquí, LGS aún no la tomó (LGS la recoge cada 15 min)
--         RECIBIDA   = LGS la tiene en revisión
--         DEVUELTA   = LGS la devolvió (motivo) → el guía sube otra
--         RECHAZADA  = LGS no la pudo recibir (plazo vencido, corte cerrado…; motivo)
--         ACEPTADA   = verificada en LGS
--         PAGADA     = pagada
--         REEMPLAZADA = el guía subió otra para el mismo corte
-- El archivo vive en files_object (privado), como el resto de archivos.

CREATE TABLE IF NOT EXISTS "liquidacion_factura_guia" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "guia_user_id"    UUID NOT NULL REFERENCES "identity_user"("id") ON DELETE CASCADE,
  "periodo"         CHAR(7) NOT NULL,          -- AAAA-MM
  "corte"           VARCHAR(3) NOT NULL,       -- MES | Q1 | Q2
  "file_id"         UUID NOT NULL,
  "nombre"          TEXT NOT NULL,
  "mime"            TEXT NOT NULL,
  "estado"          VARCHAR(20) NOT NULL DEFAULT 'ENVIANDO',
  "motivo"          TEXT,
  "lgs_factura_id"  TEXT,
  "subida_en"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "liquidacion_factura_guia_guia_periodo"
  ON "liquidacion_factura_guia" ("guia_user_id", "periodo");
CREATE INDEX IF NOT EXISTS "liquidacion_factura_guia_enviando"
  ON "liquidacion_factura_guia" ("subida_en") WHERE "estado" = 'ENVIANDO';

-- Menú Guía › "Mis horas y facturas". Se concede a todo rol que ya tenga el panel
-- del guía (misma regla que las demás opciones del menú Guía). Solo AÑADE.
INSERT INTO access_permission (id, code, nombre, updated_at)
VALUES (gen_random_uuid(), 'menu.mis_horas', 'Mis horas y facturas', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, pn.id
  FROM access_role_permission rp
  JOIN access_permission ph ON ph.id = rp.permission_id AND ph.code = 'panel.guia'
  JOIN access_permission pn ON pn.code = 'menu.mis_horas'
ON CONFLICT DO NOTHING;
