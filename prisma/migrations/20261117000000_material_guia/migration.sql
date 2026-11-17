-- Material Guía (Mantenimiento Académico, 2026-11-17).
--
-- Lo que el GUÍA abre desde los botones "Material" y "Recursos" del panel de la
-- sesión, por lección del catálogo Curso:
--   MATERIAL: presentaciones (PPT/PPTX) y PDF.
--   RECURSO:  imágenes, videos mp4 y enlaces.
-- Cada fila es UN ítem: o un archivo de `files` (file_id) o un enlace, nunca los dos.
CREATE TABLE "catalog_material_guia" (
  "id"         UUID PRIMARY KEY,
  "curso_id"   UUID NOT NULL REFERENCES "catalog_curso"("id") ON DELETE CASCADE,
  "tab"        TEXT NOT NULL CHECK ("tab" IN ('MATERIAL', 'RECURSO')),
  "tipo"       TEXT NOT NULL CHECK ("tipo" IN ('PPT', 'PDF', 'IMAGEN', 'VIDEO', 'ENLACE')),
  "titulo"     TEXT NOT NULL,
  "file_id"    UUID,
  "enlace"     TEXT,
  "orden"      INTEGER NOT NULL DEFAULT 0,
  "creado_por" UUID NOT NULL REFERENCES "identity_user"("id"),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Archivo o enlace, no los dos ni ninguno.
  CONSTRAINT "catalog_material_guia_fuente" CHECK (("file_id" IS NOT NULL) <> ("enlace" IS NOT NULL)),
  -- Qué tipo va en qué pestaña, y el enlace solo como ENLACE.
  CONSTRAINT "catalog_material_guia_tab_tipo" CHECK (
    ("tab" = 'MATERIAL' AND "tipo" IN ('PPT', 'PDF'))
    OR ("tab" = 'RECURSO' AND "tipo" IN ('IMAGEN', 'VIDEO', 'ENLACE'))),
  CONSTRAINT "catalog_material_guia_enlace_tipo" CHECK (("tipo" = 'ENLACE') = ("enlace" IS NOT NULL))
);
CREATE INDEX "catalog_material_guia_leccion_idx" ON "catalog_material_guia" ("curso_id", "tab", "orden");

-- Dos opciones de pantalla (producción no corre el seed): ver (a quien ve el catálogo,
-- guías incluidos) y subir/quitar (a quien lo gestiona).
INSERT INTO access_permission (id, code, nombre, updated_at) VALUES
    (gen_random_uuid(), 'op.mant.material_guia', 'Material Guía (consulta)', now()),
    (gen_random_uuid(), 'op.mant.material_guia_subir', 'Subir y quitar Material Guía', now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code = 'catalogo.ver'
  JOIN access_permission po ON po.code = 'op.mant.material_guia'
ON CONFLICT DO NOTHING;

INSERT INTO access_role_permission (role_id, permission_id)
SELECT rp.role_id, po.id
  FROM access_role_permission rp
  JOIN access_permission pb ON pb.id = rp.permission_id AND pb.code = 'catalogo.gestionar'
  JOIN access_permission po ON po.code = 'op.mant.material_guia_subir'
ON CONFLICT DO NOTHING;
