/**
 * Módulo `files` — API PÚBLICA.
 *
 * Puerto de almacenamiento (StoragePort) + adaptadores Spaces (producción) y local (desarrollo). Archivos PRIVADOS por defecto — datos de menores.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {
  subirArchivo,
  descargarArchivo,
  listarArchivos,
  TAMANO_MAXIMO_BYTES,
} from "./application/archivos";
export type { StoragePort } from "./application/storage-port";
export { setStorageForTests } from "./infrastructure/local-storage";
