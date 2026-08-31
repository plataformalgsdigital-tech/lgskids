-- Eventos creados a mano desde el calendario (2026-08-28).
--
-- Hasta ahora TODA sesión nacía de un slot del horario y se generaba en lote.
-- Un evento suelto —una sesión extra, un club puntual, un taller— no tiene
-- slot, así que hay que permitirlo y, sobre todo, PROTEGERLO de la
-- regeneración, que es destructiva por diseño (regla 2).

-- 1. Nuevo tipo de evento.
ALTER TYPE "scheduling_slot_tipo" ADD VALUE IF NOT EXISTS 'TALLER';

-- 2. Un evento suelto no viene de un horario recurrente.
ALTER TABLE "scheduling_session" ALTER COLUMN "slot_id" DROP NOT NULL;

-- 3. Datos propios del evento suelto.
ALTER TABLE "scheduling_session"
  -- Nivel del curso que se dicta (ROOKIE…ULTIMATE). Solo lo llevan los eventos
  -- creados a mano; los generados lo tomarán de Niveles cuando exista.
  ADD COLUMN "nivel"           TEXT,
  ADD COLUMN "observaciones"   TEXT,
  ADD COLUMN "limite_usuarios" INTEGER,
  -- Un evento COMPARTIDO entre cursos crea una sesión por salón, todas con el
  -- mismo grupo: así se reconocen como el mismo evento y para el guía cuenta
  -- como UNA sola hora.
  ADD COLUMN "grupo_id"        UUID;

CREATE INDEX "scheduling_session_grupo_idx" ON "scheduling_session" ("grupo_id");
-- Los eventos sueltos se distinguen por no tener slot.
CREATE INDEX "scheduling_session_sueltos_idx"
  ON "scheduling_session" ("classroom_id")
  WHERE "slot_id" IS NULL;

-- 4. Configuración operativa del guía. Es "la tabla de guías" desde la que el
--    evento toma el enlace de Zoom: el enlace es DEL GUÍA, no del salón, así
--    que al asignarlo a un evento se hereda solo.
CREATE TABLE "scheduling_guia" (
  "guia_user_id"   UUID PRIMARY KEY REFERENCES "identity_user"("id") ON DELETE CASCADE,
  "zoom_url"       TEXT,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
