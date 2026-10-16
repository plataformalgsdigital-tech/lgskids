-- AGENDAR desde la ficha del niño (Academic management, 2026-10-16).
--
-- 1) Eventos sueltos ABIERTOS. Una sesión extra, un club o un taller creado a
--    mano se dicta en 1–3 salones (su lista = los niños de esos salones). Si se
--    marca "abierto", además se le puede agendar a niños de OTROS salones que
--    coincidan con su campaña, curso y salón; NULL = "Todos".
ALTER TABLE "scheduling_session"
  ADD COLUMN "abierto"              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "alcance_campaign_id"  UUID REFERENCES "catalog_campaign"("id") ON DELETE SET NULL,
  ADD COLUMN "alcance_curso"        TEXT CHECK ("alcance_curso" IN ('JUNIOR', 'YOUNGSTER')),
  ADD COLUMN "alcance_classroom_id" UUID REFERENCES "scheduling_classroom"("id") ON DELETE SET NULL;

-- 2) Niños AGENDADOS en una sesión que no es de su salón: un evento abierto o
--    una CLASE REGULAR de otro salón de su misma campaña y curso (recuperación).
--    La sesión se identifica por (salón, instante) y NO por su id: la
--    regeneración del horario borra y recrea las sesiones con ids nuevos, y la
--    reserva tiene que seguir en la clase que sigue ocurriendo a esa hora. Si la
--    hora desaparece (suspensión), la reserva queda sin sesión y se ve así.
CREATE TABLE "scheduling_agendado" (
  "id"                       UUID PRIMARY KEY,
  "classroom_id"             UUID NOT NULL REFERENCES "scheduling_classroom"("id") ON DELETE CASCADE,
  "starts_at"                TIMESTAMPTZ(3) NOT NULL,
  "child_person_id"          UUID NOT NULL REFERENCES "people_person"("id") ON DELETE CASCADE,
  -- Qué se agendó (copia para leerlo aunque la sesión ya no exista).
  "tipo"                     TEXT NOT NULL CHECK ("tipo" IN ('SESION', 'CLUB', 'TALLER', 'REGULAR')),
  "estado"                   TEXT NOT NULL DEFAULT 'ACTIVA' CHECK ("estado" IN ('ACTIVA', 'CANCELADA')),
  "agendado_por"             UUID NOT NULL REFERENCES "identity_user"("id"),
  "agendado_en"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Se agendó por encima del cupo: quién lo autorizó.
  "sobrecupo_autorizado_por" UUID REFERENCES "identity_user"("id"),
  "cancelado_por"            UUID REFERENCES "identity_user"("id"),
  "cancelado_en"             TIMESTAMPTZ(3)
);

CREATE UNIQUE INDEX "scheduling_agendado_vivo"
  ON "scheduling_agendado" ("classroom_id", "starts_at", "child_person_id")
  WHERE "estado" = 'ACTIVA';
CREATE INDEX "scheduling_agendado_nino_idx" ON "scheduling_agendado" ("child_person_id");

-- 3) El Welcome también admite sobrecupo autorizado.
ALTER TABLE "scheduling_welcome_reserva"
  ADD COLUMN "sobrecupo_autorizado_por" UUID REFERENCES "identity_user"("id");

-- 4) Permisos (producción no corre el seed). "Agendar" a quien ya gestiona
--    matrículas; "Autorizar sobrecupo" SOLO a superadmin y admin (se abre a otro
--    rol marcándolo en Roles y permisos).
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'op.kids.agendar', 'Agendar (sesión, club, taller, clase regular y Welcome)', now()),
    (gen_random_uuid(), 'op.kids.agendar_sobrecupo', 'Autorizar sobrecupo al agendar', now())
ON CONFLICT (code) DO NOTHING;

-- op.kids.agendar ← matriculas.gestionar
INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code = 'matriculas.gestionar'
  JOIN access_permission po ON po.code = 'op.kids.agendar'
ON CONFLICT DO NOTHING;

-- op.kids.agendar_sobrecupo → superadmin y admin
INSERT INTO access_role_permission (role_id, permission_id)
SELECT r.id, po.id
  FROM access_role r
  JOIN access_permission po ON po.code = 'op.kids.agendar_sobrecupo'
 WHERE r.code IN ('superadmin', 'admin')
ON CONFLICT DO NOTHING;
