import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { configuracionSpaces, type ConfigSpaces } from "@/platform/config/env";
import { NotFoundError, ValidationError } from "@/platform/errors";
import type { StoragePort } from "../application/storage-port";

/**
 * Adaptador de PRODUCCIÓN: DigitalOcean Spaces (S3).
 *
 * El contenedor de App Platform tiene disco efímero — se recrea en cada
 * despliegue—, así que el disco local no sirve para los libros, los videos, el
 * arte ni las fotos. Aquí va lo mismo que guardaba `LocalStorage`, con la
 * MISMA clave (`uuid/uuid.ext`), para que un archivo subido antes o después
 * del cambio se lea igual.
 *
 * **Todo objeto es PRIVADO** (regla 9: datos de menores). No se firman URLs ni
 * se sirve desde el CDN: los bytes salen por las rutas autenticadas de la
 * plataforma, igual que en local. Por eso este adaptador solo necesita
 * guardar, leer y borrar.
 */
export class SpacesStorage implements StoragePort {
  private readonly cliente: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigSpaces) {
    this.bucket = config.bucket;
    this.cliente = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.key, secretAccessKey: config.secret },
      // Spaces usa el bucket en el subdominio, como S3.
      forcePathStyle: false,
    });
  }

  /** La clave la genera la plataforma; se valida igual que en el disco. */
  private clave(storageKey: string): string {
    if (storageKey.includes("..") || storageKey.startsWith("/") || storageKey.includes("\\")) {
      throw new ValidationError("storageKey inválida.");
    }
    return storageKey;
  }

  async guardar(storageKey: string, bytes: Buffer, mime: string): Promise<void> {
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.clave(storageKey),
        Body: bytes,
        ContentType: mime,
        ACL: "private",
      }),
    );
  }

  async leer(storageKey: string): Promise<Buffer> {
    try {
      const r = await this.cliente.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.clave(storageKey) }),
      );
      const cuerpo = r.Body;
      if (cuerpo === undefined) throw new Error("respuesta sin cuerpo");
      // `transformToByteArray` lee el stream completo. Los archivos van de unos
      // KB (fotos) a decenas de MB (libros); el rango de un video se recorta
      // después, como con el disco (ver `platform/http/rango.ts`).
      return Buffer.from(await cuerpo.transformToByteArray());
    } catch (e) {
      if (e instanceof ValidationError) throw e;
      throw new NotFoundError("El archivo no existe en el almacenamiento.");
    }
  }

  async eliminar(storageKey: string): Promise<void> {
    // Borrar lo que no está NO es un error, igual que `rm --force` en el disco.
    await this.cliente.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.clave(storageKey) }),
    );
  }
}

/** El adaptador de Spaces si hay credenciales; null para quedarse en el disco. */
export function spacesSiEstaConfigurado(): StoragePort | null {
  const config = configuracionSpaces();
  return config === null ? null : new SpacesStorage(config);
}
