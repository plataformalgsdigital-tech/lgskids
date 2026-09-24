import { contarPorIp, registrarAuditoria } from "@/modules/audit";
import type { CuentaCreada } from "@/modules/identity";
import { env } from "@/platform/config/env";
import { execute, queryOne } from "@/platform/db/query";
import { TooManyRequestsError, ValidationError } from "@/platform/errors";
import { crearGuia, type DatosAltaGuia } from "./alta-guia";

/**
 * REGISTRO ABIERTO DE GUÍAS: una sola URL que se reparte y con la que cada
 * guía crea SU PROPIA cuenta, como en MOSAICO (decisión del negocio,
 * 2026-09-24). Hasta ahora la cuenta la creaba administración y el enlace de
 * `/nuevo-guia` solo servía para que el guía completara su ficha.
 *
 * Lo que cambia respecto de la invitación por persona (`invitacion-guia.ts`):
 * esa es de un solo uso, vence y está ligada a un guía que YA existe. Esta es
 * permanente y anónima, así que quien tenga la URL entra al panel con permisos
 * de guía —ve salones y niños—. Por eso NO va sola; lleva tres frenos:
 *
 *  1. un INTERRUPTOR: nace apagada y se prende solo mientras se recluta;
 *  2. una CLAVE compartida que se dicta aparte de la URL (opcional, pero la
 *     pantalla la propone). Va en claro a propósito: su valor está en que se
 *     pueda leer y dictar, como la clave de una reunión — no protege datos,
 *     solo evita que la URL suelta alcance;
 *  3. un TOPE POR IP (`MAX_REGISTROS_POR_IP_HORA`), para que una URL filtrada
 *     no fabrique cuentas en serie. Se cuenta sobre la auditoría, que ya
 *     guarda la IP de cada alta.
 *
 * Cada registro queda auditado como `scheduling.guia_registro_abierto`.
 */

const CLAVE_ACTIVO = "guia_registro_abierto";
const CLAVE_CODIGO = "guia_registro_codigo";

/** Acción de auditoría; es TAMBIÉN la que cuenta el límite por IP. */
const ACCION_REGISTRO = "scheduling.guia_registro_abierto";

/** Altas por IP y hora desde el enlace abierto. */
export const MAX_REGISTROS_POR_IP_HORA = 3;

/**
 * Usuario de sistema (migración `20260819000003`): actor de auditoría cuando
 * no hay persona detrás. El guía todavía no tiene cuenta cuando se registra,
 * así que el alta no puede atribuirse a él mismo.
 */
const USUARIO_SISTEMA = "11111111-1111-4111-8111-111111111111";

export interface RegistroAbierto {
  activo: boolean;
  /** Clave compartida; vacía = el enlace no pide clave. */
  codigo: string;
  /** La URL que se reparte. */
  enlace: string;
  actualizadoEn: string | null;
}

async function leerConfig(clave: string): Promise<{ valor: string; actualizadoEn: string } | null> {
  const fila = await queryOne<{ valor: string; actualizado_en: string }>(
    `SELECT valor, actualizado_en::text AS actualizado_en FROM platform_config WHERE clave = $1`,
    [clave],
  );
  return fila === null ? null : { valor: fila.valor, actualizadoEn: fila.actualizado_en };
}

async function guardarConfig(clave: string, valor: string, actorUserId: string): Promise<void> {
  await execute(
    `INSERT INTO platform_config (clave, valor, actualizado_por, actualizado_en)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (clave) DO UPDATE
       SET valor = EXCLUDED.valor,
           actualizado_por = EXCLUDED.actualizado_por,
           actualizado_en = CURRENT_TIMESTAMP`,
    [clave, valor, actorUserId],
  );
}

/** La URL que se reparte a los candidatos. */
export function enlaceRegistroAbierto(): string {
  return new URL("/nuevo-guia", env().APP_URL).toString();
}

/** Estado completo, para la pantalla de administración (incluye la clave). */
export async function getRegistroAbierto(): Promise<RegistroAbierto> {
  const [activo, codigo] = await Promise.all([leerConfig(CLAVE_ACTIVO), leerConfig(CLAVE_CODIGO)]);
  return {
    activo: activo?.valor === "true",
    codigo: codigo?.valor ?? "",
    enlace: enlaceRegistroAbierto(),
    actualizadoEn: activo?.actualizadoEn ?? null,
  };
}

/** Prende/apaga el enlace y fija su clave. Devuelve el estado resultante. */
export async function setRegistroAbierto(input: {
  actorUserId: string;
  activo: boolean;
  codigo: string;
  ip?: string | null;
}): Promise<RegistroAbierto> {
  const codigo = input.codigo.trim().slice(0, 60);
  if (input.activo && codigo !== "" && codigo.length < 6) {
    throw new ValidationError("La clave compartida debe tener al menos 6 caracteres.");
  }
  await guardarConfig(CLAVE_ACTIVO, input.activo ? "true" : "false", input.actorUserId);
  await guardarConfig(CLAVE_CODIGO, codigo, input.actorUserId);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: input.activo
      ? "scheduling.guia_registro_abierto_prendido"
      : "scheduling.guia_registro_abierto_apagado",
    entidad: "platform_config",
    entidadId: CLAVE_ACTIVO,
    payload: { conClave: codigo !== "" },
    ip: input.ip ?? null,
  });
  return getRegistroAbierto();
}

/**
 * Lo que puede saber quien abre la página SIN sesión: si está abierto y si
 * pide clave. La clave misma NO viaja: se dicta por otro canal.
 */
export async function estadoPublicoRegistro(): Promise<{ activo: boolean; exigeCodigo: boolean }> {
  const r = await getRegistroAbierto();
  return { activo: r.activo, exigeCodigo: r.codigo !== "" };
}

/**
 * Alta del guía por el enlace abierto. Devuelve usuario y clave UNA vez: la
 * cuenta se crea aquí y el guía tiene que anotarlas (como en el alta del
 * panel, nace con "cambiar clave al entrar").
 *
 * El orden importa: primero los frenos (interruptor, clave, tope por IP) y
 * solo después se toca nada. `crearGuia` es el MISMO núcleo del alta del
 * panel, así que la cuenta, el rol y la ficha siguen naciendo en una sola
 * transacción.
 */
export async function registrarGuiaAbierto(input: {
  codigo: string;
  datos: DatosAltaGuia;
  foto: { nombreOriginal: string; mime: string; bytes: Buffer } | null;
  ip?: string | null;
}): Promise<CuentaCreada> {
  const config = await getRegistroAbierto();
  if (!config.activo) {
    throw new ValidationError("El registro de guías está cerrado. Pídele el acceso al equipo.");
  }
  if (config.codigo !== "" && input.codigo.trim() !== config.codigo) {
    throw new ValidationError("La clave de registro no es correcta.");
  }

  const recientes = await contarPorIp({
    accion: ACCION_REGISTRO,
    ip: input.ip ?? null,
    minutos: 60,
  });
  if (recientes >= MAX_REGISTROS_POR_IP_HORA) {
    throw new TooManyRequestsError("Demasiados registros desde aquí. Intenta en una hora.");
  }

  const cuenta = await crearGuia({
    actorUserId: USUARIO_SISTEMA,
    datos: input.datos,
    foto: input.foto,
    ip: input.ip ?? null,
  });

  await registrarAuditoria({
    actorUserId: USUARIO_SISTEMA,
    accion: ACCION_REGISTRO,
    entidad: "identity_user",
    entidadId: cuenta.userId,
    payload: { username: cuenta.username, email: input.datos.email },
    ip: input.ip ?? null,
  });

  return cuenta;
}
