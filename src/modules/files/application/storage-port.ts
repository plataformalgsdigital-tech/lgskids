/**
 * StoragePort (ADR-0006): nada se guarda en el disco del contenedor en
 * producción. Adaptadores:
 * - LocalStorage (desarrollo/CI): carpeta STORAGE_DIR, fuera de Git.
 * - Spaces (producción, Fase 11): S3-compatible con credenciales; la
 *   interfaz ya está fijada.
 * TODO archivo es PRIVADO: no existen URLs públicas; toda descarga pasa por
 * un endpoint autenticado.
 */
export interface StoragePort {
  guardar(storageKey: string, bytes: Buffer, mime: string): Promise<void>;
  leer(storageKey: string): Promise<Buffer>;
  eliminar(storageKey: string): Promise<void>;
}
