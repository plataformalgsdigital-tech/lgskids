-- ENLACE DE PERFIL SIN WELCOME (2026-10-13).
--
-- Los niños que entran con el curso ya andando (la migración de AGOSTO2026)
-- no tienen Welcome que agendar: su curso empezó y el Welcome es antes. El
-- enlace guarda si EXIGE elegir Welcome; el de la ficha "sin Welcome" no lo
-- pide, y su mensaje no lo menciona.

ALTER TABLE "contracts_enlace_perfil"
  ADD COLUMN "exige_welcome" BOOLEAN NOT NULL DEFAULT true;

INSERT INTO "notifications_plantilla" (id, slug, nombre, descripcion, contenido) VALUES
    (gen_random_uuid(), 'creacion-perfil-kids-sin-welcome', 'Creación de perfil (sin Welcome)',
     'La usa "Enviar enlace de perfil sin Welcome" en la ficha del niño: para quien entra con el curso ya andando. Lleva el enlace personal del niño.',
     E'¡Hola {{apoderado}}! 👋\n\n*{{nombre}}* ya es parte de *LGS Kids* 🎉\n\nPara terminar su registro, abre este enlace. Ahí verá su usuario, creará su clave y completará su perfil:\n\n{{enlace}}\n\n👤 Su usuario: *{{usuario}}*\n\nEl enlace es personal: no lo compartas.\n¡Bienvenidos a la familia LGS! 🚀')
ON CONFLICT (slug) DO NOTHING;
