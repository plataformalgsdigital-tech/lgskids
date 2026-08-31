import { registrarAuditoria } from "@/modules/audit";
import { subirArchivo } from "@/modules/files";
import { env } from "@/platform/config/env";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import {
  type EstadoInvitacion,
  MENSAJE_INVITACION,
  enlaceInvitacion,
  estadoInvitacion,
  hashTokenInvitacion,
  nuevoTokenInvitacion,
  vencimientoInvitacion,
} from "../domain/invitacion";
import { guardarFichaGuia } from "./crear-evento";

/**
 * Alta guiada del guía: administración emite un enlace y el guía completa su
 * propia ficha desde /nuevo-guia, sin entrar al panel ni tener sesión.
 *
 * El token es la ÚNICA credencial de esa puerta pública, así que aquí se
 * concentra todo lo que la sostiene: se guarda solo su hash, se consume una
 * sola vez y solo sirve mientras el guía siga activo.
 */

export interface InvitacionEmitida {
  token: string;
  enlace: string;
  expiraEn: string;
}

interface FilaInvitacion {
  id: string;
  guiaUserId: string;
  expiraEn: Date;
  usadoEn: Date | null;
  revocadoEn: Date | null;
}

/** El guía tiene que existir, estar activo y seguir siendo guía. */
async function exigirGuiaActivo(guiaUserId: string): Promise<{ username: string }> {
  const fila = await queryOne<{ username: string }>(
    `SELECT u.username
       FROM identity_user u
       JOIN access_user_role ur ON ur.user_id = u.id
       JOIN access_role r ON r.id = ur.role_id
      WHERE u.id = $1 AND u.estado = 'ACTIVO' AND r.code = 'guia'
      LIMIT 1`,
    [guiaUserId],
  );
  if (fila === null) {
    throw new NotFoundError("Ese usuario no existe, no está activo o no tiene el rol guía.");
  }
  return fila;
}

/**
 * Emite el enlace del guía. Revoca el anterior en la MISMA transacción: si
 * circularan dos, cortar uno filtrado no bastaría con mandar otro.
 */
export async function crearInvitacionGuia(input: {
  actorUserId: string;
  guiaUserId: string;
  ip?: string | null;
}): Promise<InvitacionEmitida> {
  await exigirGuiaActivo(input.guiaUserId);

  const token = nuevoTokenInvitacion();
  const expira = vencimientoInvitacion();

  await withTransaction(async (client) => {
    await execute(
      `UPDATE scheduling_guia_invitacion
          SET revocado_en = now()
        WHERE guia_user_id = $1 AND usado_en IS NULL AND revocado_en IS NULL`,
      [input.guiaUserId],
      client,
    );
    await execute(
      `INSERT INTO scheduling_guia_invitacion
         (id, guia_user_id, token_hash, creado_por, expira_en)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId(), input.guiaUserId, hashTokenInvitacion(token), input.actorUserId, expira],
      client,
    );
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.invitacion_guia_emitida",
    entidad: "identity_user",
    entidadId: input.guiaUserId,
    payload: { expiraEn: expira.toISOString() },
    ip: input.ip ?? null,
  });

  return {
    token,
    enlace: enlaceInvitacion(env().APP_URL, token),
    expiraEn: expira.toISOString(),
  };
}

/** Revoca el enlace vivo de un guía (si lo hay). */
export async function revocarInvitacionGuia(input: {
  actorUserId: string;
  guiaUserId: string;
  ip?: string | null;
}): Promise<{ revocadas: number }> {
  const revocadas = await execute(
    `UPDATE scheduling_guia_invitacion
        SET revocado_en = now()
      WHERE guia_user_id = $1 AND usado_en IS NULL AND revocado_en IS NULL`,
    [input.guiaUserId],
  );
  if (revocadas > 0) {
    await registrarAuditoria({
      actorUserId: input.actorUserId,
      accion: "scheduling.invitacion_guia_revocada",
      entidad: "identity_user",
      entidadId: input.guiaUserId,
      ip: input.ip ?? null,
    });
  }
  return { revocadas };
}

export interface EstadoEnlaceGuia {
  guiaUserId: string;
  estado: EstadoInvitacion;
  expiraEn: string;
  usadoEn: string | null;
}

/** Estado del último enlace de cada guía, para la pantalla de administración. */
export async function enlacesDeGuias(): Promise<EstadoEnlaceGuia[]> {
  const filas = await queryRows<FilaInvitacion>(
    `SELECT DISTINCT ON (guia_user_id)
            id, guia_user_id AS "guiaUserId", expira_en AS "expiraEn",
            usado_en AS "usadoEn", revocado_en AS "revocadoEn"
       FROM scheduling_guia_invitacion
      ORDER BY guia_user_id, created_at DESC`,
  );
  return filas.map((f) => ({
    guiaUserId: f.guiaUserId,
    estado: estadoInvitacion(f),
    expiraEn: f.expiraEn.toISOString(),
    usadoEn: f.usadoEn?.toISOString() ?? null,
  }));
}

/** Resuelve el token o explica por qué no sirve. */
async function resolverToken(token: string): Promise<FilaInvitacion> {
  const fila = await queryOne<FilaInvitacion>(
    `SELECT id, guia_user_id AS "guiaUserId", expira_en AS "expiraEn",
            usado_en AS "usadoEn", revocado_en AS "revocadoEn"
       FROM scheduling_guia_invitacion
      WHERE token_hash = $1`,
    [hashTokenInvitacion(token)],
  );
  if (fila === null) throw new NotFoundError("Este enlace no es válido.");
  const estado = estadoInvitacion(fila);
  if (estado !== "VIGENTE") throw new ValidationError(MENSAJE_INVITACION[estado]);
  return fila;
}

export interface FichaPrellenada {
  username: string;
  nombres: string | null;
  apellidos: string | null;
  docNumero: string | null;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  domicilio: string | null;
  fechaNacimiento: string | null;
  zoomUrl: string | null;
  tieneFoto: boolean;
  expiraEn: string;
}

/** Lo que el wizard muestra al abrir el enlace: su ficha, si ya hay algo. */
export async function fichaPorInvitacion(token: string): Promise<FichaPrellenada> {
  const inv = await resolverToken(token);
  const { username } = await exigirGuiaActivo(inv.guiaUserId);
  const g = await queryOne<{
    nombres: string | null;
    apellidos: string | null;
    docNumero: string | null;
    email: string | null;
    telefono: string | null;
    pais: string | null;
    domicilio: string | null;
    fechaNacimiento: string | null;
    zoomUrl: string | null;
    fotoFileId: string | null;
  }>(
    `SELECT nombres, apellidos, doc_numero AS "docNumero", email, telefono, pais,
            domicilio, fecha_nacimiento::text AS "fechaNacimiento",
            zoom_url AS "zoomUrl", foto_file_id AS "fotoFileId"
       FROM scheduling_guia WHERE guia_user_id = $1`,
    [inv.guiaUserId],
  );
  return {
    username,
    nombres: g?.nombres ?? null,
    apellidos: g?.apellidos ?? null,
    docNumero: g?.docNumero ?? null,
    email: g?.email ?? null,
    telefono: g?.telefono ?? null,
    pais: g?.pais?.trim() ?? null,
    domicilio: g?.domicilio ?? null,
    fechaNacimiento: g?.fechaNacimiento ?? null,
    zoomUrl: g?.zoomUrl ?? null,
    tieneFoto: g?.fotoFileId != null,
    expiraEn: inv.expiraEn.toISOString(),
  };
}

export interface DatosWizard {
  nombres: string;
  apellidos: string;
  docNumero: string;
  email: string;
  telefono: string;
  pais: string;
  domicilio: string;
  fechaNacimiento: string;
  zoomUrl: string;
}

/** Mismos obligatorios que el wizard de MOSAICO. */
const OBLIGATORIOS: [keyof DatosWizard, string][] = [
  ["nombres", "Nombres"],
  ["apellidos", "Apellidos"],
  ["docNumero", "Número de documento"],
  ["domicilio", "Domicilio"],
  ["email", "Correo"],
  ["telefono", "Teléfono"],
  ["pais", "País"],
  ["fechaNacimiento", "Fecha de nacimiento"],
  ["zoomUrl", "Sala de Zoom"],
];

/**
 * Consume el enlace y guarda la ficha. Marcar el token usado y escribir la
 * ficha van juntos: si la ficha falla —por ejemplo, la sala de Zoom ya es de
 * otro guía— el enlace tiene que seguir sirviendo.
 */
export async function completarInvitacionGuia(input: {
  token: string;
  datos: DatosWizard;
  foto?: { nombreOriginal: string; mime: string; bytes: Buffer } | null;
  ip?: string | null;
}): Promise<{ guiaUserId: string; username: string }> {
  const inv = await resolverToken(input.token);
  const { username } = await exigirGuiaActivo(inv.guiaUserId);

  for (const [campo, etiqueta] of OBLIGATORIOS) {
    if (input.datos[campo].trim() === "") throw new ValidationError(`Falta ${etiqueta}.`);
  }

  // La foto va a almacenamiento, no a la base, así que se sube antes de la
  // transacción. Si la ficha falla después queda un archivo huérfano; se
  // prefiere eso a un guía guardado a medias.
  let fotoFileId: string | null = null;
  if (input.foto != null) {
    const { id } = await subirArchivo({
      actorUserId: inv.guiaUserId,
      nombreOriginal: input.foto.nombreOriginal,
      mime: input.foto.mime,
      bytes: input.foto.bytes,
      entidad: "scheduling_guia_foto",
      entidadId: inv.guiaUserId,
    });
    fotoFileId = id;
  } else {
    const actual = await queryOne<{ fotoFileId: string | null }>(
      `SELECT foto_file_id AS "fotoFileId" FROM scheduling_guia WHERE guia_user_id = $1`,
      [inv.guiaUserId],
    );
    fotoFileId = actual?.fotoFileId ?? null;
  }

  await withTransaction(async (client) => {
    await guardarFichaGuia({
      actorUserId: inv.guiaUserId,
      guiaUserId: inv.guiaUserId,
      nombres: input.datos.nombres.trim(),
      apellidos: input.datos.apellidos.trim(),
      docNumero: input.datos.docNumero,
      email: input.datos.email,
      telefono: input.datos.telefono.trim(),
      pais: input.datos.pais,
      domicilio: input.datos.domicilio.trim(),
      fechaNacimiento: input.datos.fechaNacimiento,
      zoomUrl: input.datos.zoomUrl,
      fotoFileId,
      ip: input.ip ?? null,
      client,
    });
    const consumidas = await execute(
      `UPDATE scheduling_guia_invitacion
          SET usado_en = now()
        WHERE id = $1 AND usado_en IS NULL AND revocado_en IS NULL`,
      [inv.id],
      client,
    );
    // Dos envíos simultáneos del mismo enlace: solo uno lo consume.
    if (consumidas === 0) throw new ValidationError(MENSAJE_INVITACION.USADA);
  });

  await registrarAuditoria({
    actorUserId: inv.guiaUserId,
    accion: "scheduling.invitacion_guia_completada",
    entidad: "identity_user",
    entidadId: inv.guiaUserId,
    payload: { conFoto: fotoFileId !== null },
    ip: input.ip ?? null,
  });

  return { guiaUserId: inv.guiaUserId, username };
}
