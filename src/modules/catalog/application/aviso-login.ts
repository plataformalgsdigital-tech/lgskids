import { descargarArchivo } from "@/modules/files";
import { execute, queryOne } from "@/platform/db/query";
import { NotFoundError } from "@/platform/errors";
import { arteId } from "./imagen-curso";

/**
 * Aviso de la pantalla de login: una imagen que un administrador puede
 * CAMBIAR y PRENDER/APAGAR sin despliegue. Replica el banner que ya corre en
 * MOSAICO2026 y LGS2026, con dos diferencias deliberadas:
 *
 *  - La imagen NO se guarda en base64 dentro de la tabla de configuración: va
 *    por el módulo `files` (entidad 'login_aviso'), que ya trae validación de
 *    MIME, tope de tamaño y almacenamiento real. La última subida es la
 *    vigente, igual que el resto del arte.
 *  - Se sirve por una ruta pública PROPIA que resuelve ella misma cuál es el
 *    aviso vigente. NO recibe un id de archivo: si lo recibiera, cualquiera
 *    podría pedir archivos privados de menores sin sesión.
 *
 * El interruptor sí vive en `platform_config`, porque es un ajuste, no un
 * archivo.
 */

const CLAVE_ACTIVO = "login_aviso_activo";

/** entidad de `files` donde vive la imagen del aviso. */
export const ENTIDAD_AVISO_LOGIN = "login_aviso";

export type AvisoLogin = {
  activo: boolean;
  /** id del archivo vigente, o null si nunca se subió uno. */
  fileId: string | null;
  actualizadoEn: string | null;
};

/** Estado del aviso: interruptor + imagen vigente. */
export async function getAvisoLogin(): Promise<AvisoLogin> {
  const [fila, fileId] = await Promise.all([
    queryOne<{ valor: string; actualizado_en: string }>(
      `SELECT valor, actualizado_en::text AS actualizado_en FROM platform_config WHERE clave = $1`,
      [CLAVE_ACTIVO],
    ),
    arteId("aviso_login"),
  ]);
  return {
    activo: fila?.valor === "true",
    fileId,
    actualizadoEn: fila?.actualizado_en ?? null,
  };
}

/** Prende o apaga el aviso. Devuelve el estado resultante. */
export async function setAvisoLoginActivo(
  activo: boolean,
  actorUserId: string,
): Promise<AvisoLogin> {
  await execute(
    `INSERT INTO platform_config (clave, valor, actualizado_por, actualizado_en)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (clave) DO UPDATE
       SET valor = EXCLUDED.valor,
           actualizado_por = EXCLUDED.actualizado_por,
           actualizado_en = CURRENT_TIMESTAMP`,
    [CLAVE_ACTIVO, activo ? "true" : "false", actorUserId],
  );
  return getAvisoLogin();
}

/**
 * Bytes del aviso PARA LA RUTA PÚBLICA. Solo entrega algo cuando el aviso
 * está prendido: apagarlo deja de exponer la imagen, no solo de mostrarla.
 */
export async function descargarAvisoLoginPublico(): Promise<{
  meta: { nombreOriginal: string; mime: string };
  bytes: Buffer;
}> {
  const aviso = await getAvisoLogin();
  if (!aviso.activo || aviso.fileId === null) {
    throw new NotFoundError("No hay aviso de login publicado.");
  }
  return descargarArchivo(aviso.fileId);
}
