import { registrarAuditoria } from "@/modules/audit";
import { consultarClave } from "@/modules/identity";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import {
  LARGO_MAXIMO_CONTENIDO,
  SLUG_CREDENCIALES,
  SLUG_RE,
  marcadoresDe,
  rellenarParaHistorial,
  rellenarPlantilla,
  usaClave,
  type ContextoMensaje,
} from "../domain/plantilla";
import { telefonoWhatsApp } from "../domain/telefono";
import { getSender } from "../infrastructure/senders";
import { MAX_INTENTOS, encolarNotificacion } from "./outbox";

/**
 * ADMINISTRACIÓN › MENSAJES (2026-10-07). Réplica de Mantenimiento › Mensajes
 * de LGS —Plantillas y Gestión— sobre el MISMO servicio (Whapi), con tres
 * diferencias deliberadas:
 *  - los destinatarios son los APODERADOS de los niños (el niño no tiene
 *    WhatsApp propio) y se derivan SIEMPRE en el servidor: la pantalla manda
 *    ids de niños, nunca teléfonos;
 *  - hay HISTORIAL (el outbox), con reintentos del worker; LGS no guarda nada;
 *  - la CLAVE solo viaja desde la ficha del niño, de a uno, y no queda escrita.
 */

// —— Plantillas ————————————————————————————————————————————————————————

export interface Plantilla {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  contenido: string;
  activo: boolean;
  marcadores: string[];
  usaClave: boolean;
  updatedAt: string;
}

interface FilaPlantilla {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  contenido: string;
  activo: boolean;
  updatedAt: string;
}

const SELECT_PLANTILLA = `SELECT id, slug, nombre, descripcion, contenido, activo,
    updated_at AS "updatedAt" FROM notifications_plantilla`;

const aPlantilla = (f: FilaPlantilla): Plantilla => ({
  ...f,
  marcadores: marcadoresDe(f.contenido),
  usaClave: usaClave(f.contenido),
});

export async function listarPlantillas(incluirInactivas: boolean): Promise<Plantilla[]> {
  const filas = await queryRows<FilaPlantilla>(
    `${SELECT_PLANTILLA} ${incluirInactivas ? "" : "WHERE activo"} ORDER BY nombre`,
  );
  return filas.map(aPlantilla);
}

async function plantillaPorId(id: string): Promise<Plantilla> {
  const f = await queryOne<FilaPlantilla>(`${SELECT_PLANTILLA} WHERE id = $1`, [id]);
  if (f === null) throw new NotFoundError("La plantilla no existe.");
  return aPlantilla(f);
}

function validarTextos(input: {
  nombre?: string | undefined;
  contenido?: string | undefined;
}): void {
  if (input.nombre !== undefined && (input.nombre.trim() === "" || input.nombre.length > 120)) {
    throw new ValidationError("El nombre es obligatorio (máximo 120 caracteres).");
  }
  if (input.contenido !== undefined) {
    if (input.contenido.trim() === "") throw new ValidationError("El contenido es obligatorio.");
    if (input.contenido.length > LARGO_MAXIMO_CONTENIDO) {
      throw new ValidationError(
        `El contenido no puede pasar de ${String(LARGO_MAXIMO_CONTENIDO)} caracteres.`,
      );
    }
  }
}

export async function crearPlantilla(input: {
  actorUserId: string;
  slug: string;
  nombre: string;
  descripcion?: string | null | undefined;
  contenido: string;
  ip?: string | null;
}): Promise<Plantilla> {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new ValidationError(
      "El identificador va en minúsculas, números y guiones (máximo 60), sin guion al inicio ni al final.",
    );
  }
  validarTextos(input);
  const existe = await queryOne(`SELECT 1 FROM notifications_plantilla WHERE slug = $1`, [slug]);
  if (existe !== null) throw new ConflictError(`Ya existe una plantilla "${slug}".`);
  const id = newId();
  await execute(
    `INSERT INTO notifications_plantilla (id, slug, nombre, descripcion, contenido, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      slug,
      input.nombre.trim(),
      input.descripcion?.trim() || null,
      input.contenido,
      input.actorUserId,
    ],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "notifications.plantilla_creada",
    entidad: "notifications_plantilla",
    entidadId: id,
    payload: { slug, nombre: input.nombre },
    ip: input.ip ?? null,
  });
  return plantillaPorId(id);
}

/** El slug NO se edita: es la llave con la que el código y el historial la nombran. */
export async function actualizarPlantilla(input: {
  actorUserId: string;
  id: string;
  nombre?: string | undefined;
  descripcion?: string | null | undefined;
  contenido?: string | undefined;
  activo?: boolean | undefined;
  ip?: string | null;
}): Promise<Plantilla> {
  const antes = await plantillaPorId(input.id);
  validarTextos(input);
  if (input.activo === false && antes.slug === SLUG_CREDENCIALES) {
    throw new ConflictError(
      "La plantilla de credenciales la usa el botón de la ficha del niño: edítala, pero no la desactives.",
    );
  }
  await execute(
    `UPDATE notifications_plantilla
        SET nombre = COALESCE($2, nombre),
            descripcion = CASE WHEN $3::boolean THEN $4 ELSE descripcion END,
            contenido = COALESCE($5, contenido),
            activo = COALESCE($6, activo),
            updated_at = now()
      WHERE id = $1`,
    [
      input.id,
      input.nombre?.trim() ?? null,
      input.descripcion !== undefined,
      input.descripcion?.trim() || null,
      input.contenido ?? null,
      input.activo ?? null,
    ],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "notifications.plantilla_actualizada",
    entidad: "notifications_plantilla",
    entidadId: input.id,
    payload: {
      slug: antes.slug,
      antes: { nombre: antes.nombre, contenido: antes.contenido, activo: antes.activo },
    },
    ip: input.ip ?? null,
  });
  return plantillaPorId(input.id);
}

// —— Destinatarios ——————————————————————————————————————————————————————

export interface Destinatario {
  childPersonId: string;
  nombre: string;
  documento: string;
  pais: string;
  apoderado: string | null;
  /** De quién es el teléfono: del apoderado o, si no hay, del propio registro del niño. */
  telefonoDe: "apoderado" | "niño" | null;
  telefono: string | null;
  /** Normalizado para WhatsApp; null si no sirve (y entonces va `problema`). */
  whatsapp: string | null;
  problema: string | null;
  usuario: string | null;
  userId: string | null;
  curso: string | null;
  salon: string | null;
  campania: string | null;
  contrato: string | null;
  /** La plantilla elegida ya rellenada (sin la clave), para revisar antes de enviar. */
  vistaPrevia: string | null;
}

interface FilaDestinatario {
  childPersonId: string;
  nombres: string;
  apellidos: string;
  docTipo: string;
  docNumero: string;
  pais: string;
  apoderadoNombres: string | null;
  apoderadoApellidos: string | null;
  apoderadoTelefono: string | null;
  ninoTelefono: string | null;
  usuario: string | null;
  userId: string | null;
  curso: string | null;
  salon: string | null;
  campania: string | null;
  externalRef: string | null;
  contratoNumero: number | null;
}

const ES_NINO = `(EXISTS (SELECT 1 FROM people_guardianship g WHERE g.nino_id = p.id)
       OR EXISTS (SELECT 1 FROM contracts_contract cc WHERE cc.beneficiario_id = p.id))`;

/** El niño con su apoderado (el primero CON teléfono), su cuenta y su salón vivo. */
const SELECT_DESTINATARIO = `
  SELECT p.id AS "childPersonId", p.nombres, p.apellidos,
         p.doc_tipo AS "docTipo", p.doc_numero AS "docNumero", p.country_code AS pais,
         ap.nombres AS "apoderadoNombres", ap.apellidos AS "apoderadoApellidos",
         ap.telefono AS "apoderadoTelefono", p.telefono AS "ninoTelefono",
         u.username AS usuario, u.id AS "userId",
         co.tipo::text AS curso, cl.nombre AS salon, ca.nombre AS campania,
         c.external_ref AS "externalRef", c.numero AS "contratoNumero"
    FROM people_person p
    LEFT JOIN identity_user u ON u.id = p.user_id
    LEFT JOIN LATERAL (
      SELECT a.nombres, a.apellidos, a.telefono
        FROM people_guardianship g JOIN people_person a ON a.id = g.apoderado_id
       WHERE g.nino_id = p.id
       ORDER BY (NULLIF(TRIM(a.telefono), '') IS NULL), a.created_at
       LIMIT 1) ap ON true
    LEFT JOIN LATERAL (
      SELECT e.classroom_id, e.contract_id FROM enrollment_enrollment e
       WHERE e.child_person_id = p.id AND e.estado IN ('ACTIVA', 'RESERVADA')
       ORDER BY e.created_at DESC LIMIT 1) m ON true
    LEFT JOIN scheduling_classroom cl ON cl.id = m.classroom_id
    LEFT JOIN catalog_course co ON co.id = cl.course_id
    LEFT JOIN catalog_campaign ca ON ca.id = co.campaign_id
    LEFT JOIN LATERAL (
      SELECT c2.external_ref, c2.numero FROM contracts_contract c2
       WHERE c2.beneficiario_id = p.id
       ORDER BY (c2.id = m.contract_id) DESC NULLS LAST, c2.created_at DESC LIMIT 1) c ON true`;

const PAIS: Record<string, string> = { CL: "Chile", CO: "Colombia", EC: "Ecuador", PE: "Perú" };
const CURSO: Record<string, string> = { JUNIOR: "Junior", YOUNGSTER: "Youngster" };

/** El N° que se le muestra a la gente: el de LGS sin el sufijo del documento, o el interno. */
function numeroVisible(externalRef: string | null, numero: number | null): string | null {
  if (externalRef !== null && externalRef !== "") return externalRef.split("#")[0] ?? externalRef;
  return numero !== null ? String(numero) : null;
}

const primerNombre = (s: string | null): string | null =>
  s === null ? null : (s.trim().split(/\s+/)[0] ?? s);

function contextoDe(f: FilaDestinatario): ContextoMensaje {
  return {
    nombre: primerNombre(f.nombres),
    nombreCompleto: `${f.nombres} ${f.apellidos}`.trim(),
    apoderado: primerNombre(f.apoderadoNombres) ?? "",
    usuario: f.usuario,
    curso: f.curso !== null ? (CURSO[f.curso] ?? f.curso) : null,
    salon: f.salon,
    campania: f.campania,
    contrato: numeroVisible(f.externalRef, f.contratoNumero),
    plataforma: PAIS[f.pais] ?? f.pais,
  };
}

function aDestinatario(f: FilaDestinatario, plantilla: Plantilla | null): Destinatario {
  const deApoderado = f.apoderadoTelefono !== null && f.apoderadoTelefono.trim() !== "";
  const telefono = deApoderado ? f.apoderadoTelefono : f.ninoTelefono;
  const tel = telefonoWhatsApp(telefono, f.pais);
  return {
    childPersonId: f.childPersonId,
    nombre: `${f.nombres} ${f.apellidos}`.trim(),
    documento: `${f.docTipo} ${f.docNumero}`.trim(),
    pais: f.pais,
    apoderado:
      f.apoderadoNombres !== null
        ? `${f.apoderadoNombres} ${f.apoderadoApellidos ?? ""}`.trim()
        : null,
    telefonoDe: deApoderado ? "apoderado" : telefono !== null ? "niño" : null,
    telefono,
    whatsapp: tel.ok ? tel.numero : null,
    problema: tel.ok ? null : tel.error,
    usuario: f.usuario,
    userId: f.userId,
    curso: f.curso,
    salon: f.salon,
    campania: f.campania,
    contrato: numeroVisible(f.externalRef, f.contratoNumero),
    vistaPrevia:
      plantilla !== null ? rellenarParaHistorial(plantilla.contenido, contextoDe(f)) : null,
  };
}

const normalizarDoc = (d: string): string =>
  d
    .trim()
    .toUpperCase()
    .replace(/[.\s\-_]/g, "");

export const MAX_DESTINATARIOS = 300;

/**
 * Los niños a quienes se les escribe (a su apoderado), por salón o por
 * documento. Con alcance por país.
 */
export async function buscarDestinatarios(input: {
  countryScope: string[] | null;
  classroomId?: string | undefined;
  documentos?: string[] | undefined;
  plantillaId?: string | undefined;
}): Promise<{ destinatarios: Destinatario[]; noEncontrados: string[] }> {
  const plantilla =
    input.plantillaId !== undefined ? await plantillaPorId(input.plantillaId) : null;
  const where: string[] = [ES_NINO];
  const values: unknown[] = [];
  if (input.countryScope !== null) {
    values.push(input.countryScope);
    where.push(`p.country_code = ANY($${String(values.length)})`);
  }
  let pedidos: string[] = [];
  if (input.classroomId !== undefined) {
    values.push(input.classroomId);
    where.push(`m.classroom_id = $${String(values.length)}`);
  } else if (input.documentos !== undefined) {
    pedidos = [...new Set(input.documentos.map(normalizarDoc).filter((d) => d !== ""))];
    if (pedidos.length === 0) return { destinatarios: [], noEncontrados: [] };
    if (pedidos.length > MAX_DESTINATARIOS) {
      throw new ValidationError(`Máximo ${String(MAX_DESTINATARIOS)} documentos por envío.`);
    }
    values.push(pedidos);
    where.push(
      `regexp_replace(upper(p.doc_numero), '[.[:space:]_-]', '', 'g') = ANY($${String(values.length)})`,
    );
  } else {
    throw new ValidationError("Elige un salón o escribe los documentos.");
  }
  const filas = await queryRows<FilaDestinatario>(
    `${SELECT_DESTINATARIO} WHERE ${where.join(" AND ")} ORDER BY p.apellidos, p.nombres LIMIT ${String(MAX_DESTINATARIOS)}`,
    values,
  );
  const encontrados = new Set(filas.map((f) => normalizarDoc(f.docNumero)));
  return {
    destinatarios: filas.map((f) => aDestinatario(f, plantilla)),
    noEncontrados: pedidos.filter((d) => !encontrados.has(d)),
  };
}

async function destinatarioDe(
  childPersonId: string,
  countryScope: string[] | null,
  plantilla: Plantilla | null,
): Promise<{ fila: FilaDestinatario; destinatario: Destinatario }> {
  const values: unknown[] = [childPersonId];
  let alcance = "";
  if (countryScope !== null) {
    values.push(countryScope);
    alcance = " AND p.country_code = ANY($2)";
  }
  const fila = await queryOne<FilaDestinatario>(
    `${SELECT_DESTINATARIO} WHERE p.id = $1 AND ${ES_NINO}${alcance}`,
    values,
  );
  if (fila === null) throw new NotFoundError("El niño no existe.");
  return { fila, destinatario: aDestinatario(fila, plantilla) };
}

// —— Envío masivo (Gestión) ————————————————————————————————————————————

/**
 * Encola UN mensaje por niño, al teléfono de su apoderado. Devuelve los ids de
 * la cola para despacharlos enseguida (la ruta lo hace después de responder);
 * lo que falle lo reintenta el worker.
 */
export async function encolarEnvio(input: {
  actorUserId: string;
  countryScope: string[] | null;
  plantillaId: string;
  childPersonIds: string[];
  ip?: string | null;
}): Promise<{ ids: string[]; encolados: number; omitidos: { nombre: string; motivo: string }[] }> {
  const plantilla = await plantillaPorId(input.plantillaId);
  if (!plantilla.activo) throw new ValidationError("La plantilla está desactivada.");
  if (plantilla.usaClave) {
    throw new ValidationError(
      "Esta plantilla lleva {{clave}}: la clave se envía solo desde la ficha de cada niño, para que no quede escrita en el historial.",
    );
  }
  const ids = [...new Set(input.childPersonIds)];
  if (ids.length === 0) throw new ValidationError("Elige al menos un destinatario.");
  if (ids.length > MAX_DESTINATARIOS) {
    throw new ValidationError(`Máximo ${String(MAX_DESTINATARIOS)} destinatarios por envío.`);
  }

  const encolados: string[] = [];
  const omitidos: { nombre: string; motivo: string }[] = [];
  for (const childPersonId of ids) {
    let dest: { fila: FilaDestinatario; destinatario: Destinatario };
    try {
      dest = await destinatarioDe(childPersonId, input.countryScope, plantilla);
    } catch {
      omitidos.push({ nombre: childPersonId, motivo: "No encontrado" });
      continue;
    }
    const d = dest.destinatario;
    if (d.whatsapp === null) {
      omitidos.push({ nombre: d.nombre, motivo: d.problema ?? "Sin teléfono" });
      continue;
    }
    encolados.push(
      await encolarNotificacion({
        canal: "WHATSAPP",
        destinatario: d.whatsapp,
        mensaje: rellenarPlantilla(plantilla.contenido, contextoDe(dest.fila)),
        plantillaSlug: plantilla.slug,
        childPersonId,
        enviadoPor: input.actorUserId,
      }),
    );
  }

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "notifications.envio_encolado",
    entidad: "notifications_plantilla",
    entidadId: plantilla.id,
    payload: { slug: plantilla.slug, encolados: encolados.length, omitidos: omitidos.length },
    ip: input.ip ?? null,
  });
  return { ids: encolados, encolados: encolados.length, omitidos };
}

// —— Credenciales (botón de la ficha del niño) ————————————————————————————

export interface VistaCredenciales {
  destinatario: Destinatario;
  /** Por qué no se puede enviar, si no se puede. */
  problema: string | null;
}

async function plantillaCredenciales(): Promise<Plantilla> {
  const f = await queryOne<FilaPlantilla>(`${SELECT_PLANTILLA} WHERE slug = $1`, [
    SLUG_CREDENCIALES,
  ]);
  if (f === null || !f.activo) {
    throw new NotFoundError(
      `Falta la plantilla "${SLUG_CREDENCIALES}" (o está desactivada) en Administración › Mensajes.`,
    );
  }
  return aPlantilla(f);
}

/** Lo que verá quien envía ANTES de confirmar: a quién y qué (sin la clave). */
export async function vistaCredenciales(
  childPersonId: string,
  countryScope: string[] | null,
): Promise<VistaCredenciales> {
  const plantilla = await plantillaCredenciales();
  const { destinatario } = await destinatarioDe(childPersonId, countryScope, plantilla);
  const problema =
    destinatario.userId === null
      ? "El niño todavía no tiene cuenta: nace al aprobar su contrato."
      : destinatario.whatsapp === null
        ? `No hay a qué número enviarlo: ${destinatario.problema ?? "sin teléfono"}. Agrega el teléfono del apoderado.`
        : null;
  return { destinatario, problema };
}

const MOTIVO_SIN_CLAVE: Record<string, string> = {
  BOVEDA_APAGADA: "la bóveda de claves no está configurada en este servidor",
  SIN_COPIA:
    "la cuenta no tiene copia de su clave (es anterior a la bóveda). Restablécela en Usuarios y roles › Consultar y vuelve a enviar",
  ILEGIBLE: "la copia de la clave no se puede leer. Restablécela en Usuarios y roles › Consultar",
};

/**
 * Envía usuario y clave del niño al WhatsApp de su apoderado, AHORA y sin
 * pasar por la cola: la clave no puede quedar escrita en una fila que espera
 * reintento. El historial guarda el mensaje con la clave tapada, y una falla
 * no se reintenta sola (reintentar mandaría "••••••").
 *
 * Quien envía no VE la clave —eso sigue siendo solo del superadmin—: sale de
 * la bóveda directo al mensaje, y solo al teléfono que ya está registrado.
 */
export async function enviarCredenciales(input: {
  actorUserId: string;
  childPersonId: string;
  countryScope: string[] | null;
  ip?: string | null;
}): Promise<{ ok: boolean; destinatario: string; error?: string }> {
  const plantilla = await plantillaCredenciales();
  const { fila, destinatario } = await destinatarioDe(
    input.childPersonId,
    input.countryScope,
    plantilla,
  );
  if (destinatario.userId === null) {
    throw new ValidationError("El niño todavía no tiene cuenta: nace al aprobar su contrato.");
  }
  if (destinatario.whatsapp === null) {
    throw new ValidationError(
      `No hay a qué número enviarlo: ${destinatario.problema ?? "sin teléfono"}.`,
    );
  }
  const consulta = await consultarClave({
    actorUserId: input.actorUserId,
    userId: destinatario.userId,
    ip: input.ip ?? null,
    proposito: "ENVIO_WHATSAPP",
  });
  if (consulta.clave === null) {
    throw new ConflictError(
      `No se puede enviar la clave: ${MOTIVO_SIN_CLAVE[consulta.motivo] ?? consulta.motivo}.`,
    );
  }

  const ctx = contextoDe(fila);
  const resultado = await getSender().enviar({
    canal: "WHATSAPP",
    destinatario: destinatario.whatsapp,
    mensaje: rellenarPlantilla(plantilla.contenido, { ...ctx, clave: consulta.clave }),
  });

  await execute(
    `INSERT INTO notifications_outbox
       (id, canal, destinatario, mensaje, payload, estado, intentos, ultimo_error, enviada_en,
        plantilla_slug, child_person_id, enviado_por)
     VALUES ($1, 'WHATSAPP', $2, $3, $4, $5::notifications_estado, $6, $7,
             CASE WHEN $5 = 'ENVIADA' THEN now() END, $8, $9, $10)`,
    [
      newId(),
      destinatario.whatsapp,
      rellenarParaHistorial(plantilla.contenido, ctx),
      JSON.stringify({ credenciales: true }),
      resultado.ok ? "ENVIADA" : "FALLIDA",
      // Una falla se da por agotada: el texto guardado no lleva la clave.
      resultado.ok ? 1 : MAX_INTENTOS,
      resultado.ok ? null : (resultado.error ?? "desconocido"),
      plantilla.slug,
      input.childPersonId,
      input.actorUserId,
    ],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: resultado.ok
      ? "notifications.credenciales_enviadas"
      : "notifications.credenciales_fallidas",
    entidad: "people_person",
    entidadId: input.childPersonId,
    payload: {
      usuario: destinatario.usuario,
      destinatario: destinatario.whatsapp,
      telefonoDe: destinatario.telefonoDe,
      ...(resultado.ok ? {} : { error: resultado.error }),
    },
    ip: input.ip ?? null,
  });
  return resultado.ok
    ? { ok: true, destinatario: destinatario.whatsapp }
    : { ok: false, destinatario: destinatario.whatsapp, error: resultado.error ?? "desconocido" };
}

// —— Historial ————————————————————————————————————————————————————————

export interface EnvioHistorial {
  id: string;
  creadoEn: string;
  enviadaEn: string | null;
  estado: string;
  intentos: number;
  error: string | null;
  destinatario: string;
  mensaje: string;
  plantilla: string | null;
  nino: string | null;
  childPersonId: string | null;
  enviadoPor: string | null;
}

/** Lo enviado, lo más nuevo primero. Con alcance por país (por el niño). */
export async function historialEnvios(input: {
  countryScope: string[] | null;
  estado?: string | undefined;
  q?: string | undefined;
  limit: number;
}): Promise<EnvioHistorial[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (input.countryScope !== null) {
    values.push(input.countryScope);
    where.push(`p.country_code = ANY($${String(values.length)})`);
  }
  if (input.estado !== undefined) {
    values.push(input.estado);
    where.push(`o.estado = $${String(values.length)}::notifications_estado`);
  }
  if (input.q !== undefined && input.q.trim() !== "") {
    values.push(`%${input.q.trim()}%`);
    const i = String(values.length);
    where.push(
      `(o.destinatario ILIKE $${i} OR p.nombres || ' ' || p.apellidos ILIKE $${i} OR p.doc_numero ILIKE $${i})`,
    );
  }
  values.push(input.limit);
  return queryRows<EnvioHistorial>(
    `SELECT o.id, o.created_at AS "creadoEn", o.enviada_en AS "enviadaEn", o.estado::text AS estado,
            o.intentos, o.ultimo_error AS error, o.destinatario, o.mensaje,
            COALESCE(pl.nombre, o.plantilla_slug,
                     CASE WHEN o.payload ? 'awardId' THEN 'Premio (automático)' END) AS plantilla,
            NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.apellidos)), '') AS nino,
            o.child_person_id AS "childPersonId", u.username AS "enviadoPor"
       FROM notifications_outbox o
       LEFT JOIN people_person p ON p.id = o.child_person_id
       LEFT JOIN notifications_plantilla pl ON pl.slug = o.plantilla_slug
       LEFT JOIN identity_user u ON u.id = o.enviado_por
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY o.created_at DESC
      LIMIT $${String(values.length)}`,
    values,
  );
}
