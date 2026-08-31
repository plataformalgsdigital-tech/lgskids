-- Configuración de plataforma: clave/valor (2026-08-26).
-- Replica el patrón `app_config` que ya corre en MOSAICO2026 y LGS2026.
-- Se usa para ajustes operativos que un administrador prende/apaga sin
-- despliegue. Primer uso: el aviso de la pantalla de login.
--
-- El VALOR es texto (se interpreta en la capa de aplicación); si algún ajuste
-- necesita estructura, guardar JSON serializado y documentarlo aquí.
--   login_aviso_activo → 'true' | 'false'
--
-- La IMAGEN del aviso NO vive aquí: va por el módulo `files` (entidad
-- 'login_aviso', entidadId 'GLOBAL'), igual que el resto del arte. Así hereda
-- validación de MIME, tope de 10 MB y almacenamiento real.

CREATE TABLE "platform_config" (
  "clave"           TEXT PRIMARY KEY,
  "valor"           TEXT NOT NULL,
  "actualizado_por" UUID,
  "actualizado_en"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
