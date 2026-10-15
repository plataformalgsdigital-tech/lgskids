-- SERVICIO › WELCOME como en MOSAICO (2026-10-14): reagendamientos, pendientes
-- de agendar y video de bienvenida.

-- 1) Una reserva de un Welcome que YA PASÓ no se cancela al reagendar: queda
--    REAGENDADA, en la lista de su Welcome y con su asistencia. Es lo que dice
--    MOSAICO —"la sesión perdida no se borra"— y lo que permite contar los
--    intentos (máximo 2) y saber a qué Welcome faltó. Antes, cambiar de Welcome
--    la CANCELABA y se perdía que el niño había faltado.
ALTER TABLE "scheduling_welcome_reserva"
  DROP CONSTRAINT IF EXISTS "scheduling_welcome_reserva_estado_check";
ALTER TABLE "scheduling_welcome_reserva"
  ADD CONSTRAINT "scheduling_welcome_reserva_estado_check"
  CHECK ("estado" IN ('ACTIVA', 'REAGENDADA', 'CANCELADA'));

-- 2) Envíos del VIDEO de bienvenida al apoderado: a quien faltó a 2 Welcome sin
--    asistir a ninguno. Solo se agrega. Un envío que salió bien saca al niño de
--    las bandejas de inasistentes (cuenta como Welcome hecho).
CREATE TABLE "scheduling_welcome_video_envio" (
  "id"              UUID PRIMARY KEY,
  "child_person_id" UUID NOT NULL REFERENCES "people_person"("id") ON DELETE CASCADE,
  "telefono"        TEXT NOT NULL,
  "enlace"          TEXT NOT NULL,
  "ok"              BOOLEAN NOT NULL,
  "error"           TEXT,
  "enviado_por"     UUID NOT NULL REFERENCES "identity_user"("id"),
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "scheduling_welcome_video_envio_nino_idx"
  ON "scheduling_welcome_video_envio" ("child_person_id", "created_at" DESC);

-- 3) El mensaje del video. `{{video}}` es el enlace configurado en Servicio ›
--    Welcome › Video Welcome. Se edita en Administración › Mensajes.
INSERT INTO "notifications_plantilla" (id, slug, nombre, descripcion, contenido) VALUES
    (gen_random_uuid(), 'video-welcome-kids', 'Video de bienvenida',
     'Servicio › Welcome: al apoderado de un niño que faltó a sus Welcome.',
     E'¡Hola {{apoderado}}! 👋 Te escribimos de *LGS Kids*.\n\nComo *{{nombre}}* no pudo asistir a su sesión de bienvenida (Welcome), te compartimos el video para que conozca cómo funcionan sus clases:\n\n🎬 {{video}}\n\nSu usuario para entrar a la plataforma es *{{usuario}}*: https://app.lgskidsplataforma.com\n¡Lo esperamos en su próxima sesión! 🚀')
ON CONFLICT (slug) DO NOTHING;
