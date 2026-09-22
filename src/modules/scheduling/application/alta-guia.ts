import { ROLES } from "@/modules/access";
import { registrarAuditoria } from "@/modules/audit";
import { eliminarArchivo, subirArchivo } from "@/modules/files";
import { crearCuentaStaffTx, type CuentaCreada } from "@/modules/identity";
import { withTransaction } from "@/platform/db/transaction";
import { ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { logger } from "@/platform/logging/logger";
import { guardarFichaGuia } from "./crear-evento";
import { crearInvitacionGuia, type InvitacionEmitida } from "./invitacion-guia";

/**
 * La foto es de una persona identificable: solo imagen (el módulo `files`
 * acepta además PDF y audio, que aquí no tienen sentido).
 */
export const MIMES_FOTO_GUIA: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

export interface DatosAltaGuia {
  nombres: string;
  apellidos: string;
  email: string;
  docNumero: string;
  telefono?: string | null;
  pais?: string | null;
  domicilio?: string | null;
  fechaNacimiento?: string | null;
  zoomUrl?: string | null;
}

/**
 * ALTA DEL GUÍA, como el "Crear advisor" de MOSAICO: la cuenta (con usuario y
 * clave generados), el rol `guia` y su ficha operativa, de una vez. Antes
 * había que crear la cuenta en Usuarios y luego llenarle la ficha en Guías.
 *
 * Dos modos:
 * - COMPLETO (por defecto): administración llena la ficha; foto y número de
 *   identificación son obligatorios, como en MOSAICO.
 * - CON ENLACE (`enviarEnlace`): basta nombre, apellido y correo; se emite el
 *   enlace de /nuevo-guia y el guía completa el resto (foto y Zoom incluidos).
 *
 * Cuenta, rol y ficha van en UNA transacción: si la ficha falla —por ejemplo,
 * esa sala de Zoom ya es de otro guía— no queda una cuenta de guía sin ficha.
 * La foto va a almacenamiento, no a la base, así que se sube ANTES con el id de
 * la cuenta ya reservado, y si la transacción falla se suelta.
 *
 * El rol se da con alcance GLOBAL, como el de los guías existentes: un mismo
 * guía dicta en salones de varios países (grupo 02 = CO/EC/PE). El país de la
 * ficha es dato de contacto, no alcance.
 */
export async function crearGuia(input: {
  actorUserId: string;
  datos: DatosAltaGuia;
  foto: { nombreOriginal: string; mime: string; bytes: Buffer } | null;
  enviarEnlace?: boolean;
  ip?: string | null;
}): Promise<CuentaCreada & { enlace: InvitacionEmitida | null }> {
  const d = input.datos;
  const conEnlace = input.enviarEnlace === true;
  const obligatorios: [keyof DatosAltaGuia, string][] = [
    ["nombres", "Primer nombre"],
    ["apellidos", "Primer apellido"],
    ["email", "Correo"],
  ];
  if (!conEnlace) obligatorios.push(["docNumero", "Número de identificación"]);
  const faltan = obligatorios.filter(([campo]) => (d[campo] ?? "").trim() === "");
  if (!conEnlace && input.foto === null) faltan.push(["nombres", "Foto de perfil"]);
  if (faltan.length > 0) {
    throw new ValidationError(`Falta: ${faltan.map(([, etiqueta]) => etiqueta).join(", ")}.`);
  }
  if (input.foto !== null && !MIMES_FOTO_GUIA.includes(input.foto.mime)) {
    throw new ValidationError("La foto debe ser JPG, PNG o WebP.");
  }

  const userId = newId();
  let fotoFileId: string | null = null;
  if (input.foto !== null) {
    ({ id: fotoFileId } = await subirArchivo({
      actorUserId: input.actorUserId,
      nombreOriginal: input.foto.nombreOriginal,
      mime: input.foto.mime,
      bytes: input.foto.bytes,
      entidad: "scheduling_guia_foto",
      entidadId: userId,
    }));
  }

  let cuenta: CuentaCreada;
  try {
    cuenta = await withTransaction(async (tx) => {
      const creada = await crearCuentaStaffTx(tx, {
        id: userId,
        nombres: d.nombres,
        apellidos: d.apellidos,
        email: d.email,
        // La ficha del guía es `scheduling_guia`, no `identity_perfil`.
        perfil: null,
        roleCode: ROLES.GUIA,
        countryCode: null,
      });
      await guardarFichaGuia({
        actorUserId: input.actorUserId,
        guiaUserId: creada.userId,
        nombres: d.nombres.trim(),
        apellidos: d.apellidos.trim(),
        docNumero: d.docNumero.trim() || null,
        email: d.email,
        telefono: d.telefono?.trim() || null,
        pais: d.pais || null,
        domicilio: d.domicilio?.trim() || null,
        fechaNacimiento: d.fechaNacimiento || null,
        zoomUrl: d.zoomUrl ?? null,
        fotoFileId,
        ip: input.ip ?? null,
        client: tx,
      });
      return creada;
    });
  } catch (error) {
    if (fotoFileId !== null) {
      const id = fotoFileId;
      await eliminarArchivo(id).catch((e: unknown) => {
        logger.warn("No se pudo soltar la foto de un alta de guía fallida", {
          fotoFileId: id,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }
    throw error;
  }

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.guia_creado",
    entidad: "identity_user",
    entidadId: cuenta.userId,
    payload: {
      username: cuenta.username,
      nombre: `${d.nombres.trim()} ${d.apellidos.trim()}`,
      conEnlace,
    },
    ip: input.ip ?? null,
  });
  // El enlace se emite DESPUÉS: si fallara, la cuenta ya está bien creada y el
  // enlace se vuelve a emitir desde Guías.
  const enlace = conEnlace
    ? await crearInvitacionGuia({
        actorUserId: input.actorUserId,
        guiaUserId: cuenta.userId,
        ip: input.ip ?? null,
      })
    : null;
  return { ...cuenta, enlace };
}
