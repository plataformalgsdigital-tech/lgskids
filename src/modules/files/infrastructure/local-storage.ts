import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { env } from "@/platform/config/env";
import { NotFoundError, ValidationError } from "@/platform/errors";
import type { StoragePort } from "../application/storage-port";
import { spacesSiEstaConfigurado } from "./spaces-storage";

/** Adaptador LOCAL (desarrollo/CI). En producción se usa Spaces. */
export class LocalStorage implements StoragePort {
  private ruta(storageKey: string): string {
    // Sin traversal: la clave es interna (uuid/uuid.ext), pero se valida igual.
    if (storageKey.includes("..") || storageKey.startsWith("/") || storageKey.includes("\\")) {
      throw new ValidationError("storageKey inválida.");
    }
    return normalize(join(env().STORAGE_DIR, storageKey));
  }

  async guardar(storageKey: string, bytes: Buffer): Promise<void> {
    const ruta = this.ruta(storageKey);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, bytes);
  }

  async leer(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(this.ruta(storageKey));
    } catch {
      throw new NotFoundError("El archivo no existe en el almacenamiento.");
    }
  }

  async eliminar(storageKey: string): Promise<void> {
    await rm(this.ruta(storageKey), { force: true });
  }
}

let storage: StoragePort | null = null;

/**
 * El almacenamiento vigente: **Spaces si hay credenciales**, si no el disco.
 *
 * Lo decide el entorno y no un `NODE_ENV`: así el mismo binario sirve para
 * desarrollo (carpeta local), CI (carpeta local) y producción (Spaces), y
 * probar contra Spaces desde una máquina es poner las cuatro variables.
 */
export function getStorage(): StoragePort {
  storage ??= spacesSiEstaConfigurado() ?? new LocalStorage();
  return storage;
}

export function setStorageForTests(impl: StoragePort | null): void {
  storage = impl;
}
