import {
  TAMANO_MAXIMO_BYTES,
  descargarArchivo,
  eliminarArchivo,
  subirArchivo,
  type PoliticaArchivo,
} from "@/modules/files";
import { queryOne, queryRows } from "@/platform/db/query";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { marcarAsistencia } from "./asistencia";

/**
 * Servicio › Asistencia (2026-10-14): los niños que NO asistieron a sus
 * sesiones en un rango de fechas —por defecto, el día anterior—, para que el
 * equipo de servicio llame a las familias.
 *
 * "No asistió" = la marca de la sesión es AUSENTE o JUSTIFICADO (la pantalla
 * filtra por cuál). Una sesión SIN marca no entra: no se sabe si el niño faltó
 * o el guía olvidó pasar lista, y eso lo muestra el Tablero ("sesiones sin
 * marcar"), no esta lista.
 *
 * La fecha es la LOCAL del salón (`scheduling_session.fecha`), no la del
 * servidor (regla 3): "ayer" en Chile y en Colombia es el mismo día de pared.
 */

/** Rango máximo de una consulta: es una lista de trabajo, no un histórico. */
export const DIAS_MAX_INASISTENCIAS = 93;
/** Tope de filas devueltas (y exportadas). */
export const MAX_INASISTENCIAS = 2000;

export interface Inasistencia {
  attendanceId: string;
  sessionId: string;
  fecha: string;
  /** Hora de pared del salón, HH:MM. */
  hora: string;
  tipoSesion: string;
  estado: "AUSENTE" | "JUSTIFICADO" | "PRESENTE";
  justificacion: string | null;
  childPersonId: string;
  nombre: string;
  documento: string;
  username: string | null;
  pais: string;
  campania: string | null;
  curso: string | null;
  salon: string;
  guia: string | null;
  apoderado: string | null;
  telefono: string | null;
  /** La justificación trae un documento adjunto (se ve por su ruta propia). */
  tieneSoporte: boolean;
}

export interface FiltrosInasistencias {
  countryScope: string[] | null;
  desde: string;
  hasta: string;
  /** Documento, nombre, apellido o usuario del niño (por palabras). */
  buscar?: string | null;
  campaignId?: string | null;
  curso?: string | null;
  classroomId?: string | null;
  /**
   * Sin valor: las dos inasistencias (ausente y justificada). PRESENTE lista a
   * los que SÍ asistieron, con los mismos filtros; TODOS, cualquier marca.
   */
  estado?: "AUSENTE" | "JUSTIFICADO" | "PRESENTE" | "TODOS" | null;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** La columna en minúsculas y sin tildes (la misma forma que el buscador de Kids). */
const SIN_TILDES = (col: string) =>
  `translate(lower(${col}), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun')`;

export async function inasistencias(f: FiltrosInasistencias): Promise<Inasistencia[]> {
  if (!FECHA.test(f.desde) || !FECHA.test(f.hasta)) {
    throw new ValidationError("Las fechas deben ser YYYY-MM-DD.");
  }
  if (f.desde > f.hasta) {
    throw new ValidationError("La fecha inicial no puede ser posterior a la final.");
  }
  const dias = (Date.parse(f.hasta) - Date.parse(f.desde)) / 86_400_000;
  if (dias > DIAS_MAX_INASISTENCIAS) {
    throw new ValidationError(
      `El rango es de hasta ${String(DIAS_MAX_INASISTENCIAS)} días; acótalo o filtra por campaña.`,
    );
  }

  const values: unknown[] = [f.desde, f.hasta, f.countryScope];
  const condiciones: string[] = [];
  const agregar = (sql: (n: string) => string, valor: unknown) => {
    values.push(valor);
    condiciones.push(sql(`$${String(values.length)}`));
  };
  if (f.estado === "TODOS") {
    // Sin condición de estado: toda marca de la sesión (asistió, faltó o justificó).
  } else if (f.estado != null) {
    agregar((n) => `a.estado = ${n}::attendance_estado`, f.estado);
  } else {
    condiciones.push(`a.estado IN ('AUSENTE', 'JUSTIFICADO')`);
  }
  if (f.campaignId != null && f.campaignId !== "") agregar((n) => `ca.id = ${n}`, f.campaignId);
  if (f.curso != null && f.curso !== "") agregar((n) => `co.tipo::text = ${n}`, f.curso);
  if (f.classroomId != null && f.classroomId !== "") {
    agregar((n) => `cl.id = ${n}`, f.classroomId);
  }
  // Por palabras, como el buscador de Kids: "acevedo elysa" = "elysa acevedo",
  // sin tildes ni mayúsculas, y el documento sin puntos ni guiones.
  const palabras = (f.buscar ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p !== "")
    .slice(0, 5);
  for (const palabra of palabras) {
    values.push(`%${palabra}%`);
    const t = `$${String(values.length)}`;
    const doc = palabra.toUpperCase().replace(/[^A-Z0-9]/g, "");
    let porDoc = "";
    if (doc !== "") {
      values.push(`%${doc}%`);
      porDoc = `OR upper(regexp_replace(b.doc_numero, '[^0-9A-Za-z]', '', 'g')) LIKE $${String(values.length)}`;
    }
    condiciones.push(
      `(${SIN_TILDES("b.nombres")} LIKE ${t} OR ${SIN_TILDES("b.apellidos")} LIKE ${t}
        OR lower(u.username) LIKE ${t} ${porDoc})`,
    );
  }
  values.push(MAX_INASISTENCIAS);

  return queryRows<Inasistencia>(
    `SELECT a.id AS "attendanceId", s.id AS "sessionId", s.fecha::text AS fecha,
            to_char(s.starts_at AT TIME ZONE cl.timezone, 'HH24:MI') AS hora,
            s.tipo::text AS "tipoSesion", a.estado::text AS estado, a.justificacion,
            b.id AS "childPersonId", b.nombres || ' ' || b.apellidos AS nombre,
            b.doc_numero AS documento, u.username, b.country_code AS pais,
            ca.nombre AS campania, co.tipo::text AS curso, cl.nombre AS salon,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', gg.nombres, gg.apellidos)), ''),
                     NULLIF(TRIM(CONCAT_WS(' ', gpf.nombres, gpf.apellidos)), ''),
                     gu.username) AS guia,
            ap.nombre AS apoderado, COALESCE(ap.telefono, b.telefono) AS telefono,
            EXISTS (SELECT 1 FROM files_object fo
                     WHERE fo.entidad = 'attendance_soporte' AND fo.entidad_id = a.id::text)
              AS "tieneSoporte"
       FROM attendance_attendance a
       JOIN scheduling_session s ON s.id = a.session_id
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       LEFT JOIN catalog_course co ON co.id = cl.course_id
       LEFT JOIN catalog_campaign ca ON ca.id = co.campaign_id
       JOIN people_person b ON b.id = a.child_person_id
       LEFT JOIN identity_user u ON u.id = b.user_id
       -- Guía EFECTIVO: el de la sesión (reemplazo o quien la cerró), si no el del salón.
       LEFT JOIN identity_user gu ON gu.id = COALESCE(s.guia_user_id, cl.guia_user_id)
       LEFT JOIN scheduling_guia gg ON gg.guia_user_id = gu.id
       LEFT JOIN identity_perfil gpf ON gpf.user_id = gu.id
       -- El apoderado con teléfono, que es a quien llama servicio.
       LEFT JOIN LATERAL (
            SELECT p.nombres || ' ' || p.apellidos AS nombre, p.telefono
              FROM people_guardianship g JOIN people_person p ON p.id = g.apoderado_id
             WHERE g.nino_id = b.id
             ORDER BY (p.telefono IS NULL OR p.telefono = ''), p.nombres
             LIMIT 1) ap ON true
      WHERE s.fecha BETWEEN $1::date AND $2::date
        AND ($3::text[] IS NULL OR b.country_code = ANY($3::text[]))
        ${condiciones.map((c) => `AND ${c}`).join("\n        ")}
      ORDER BY s.fecha DESC, s.starts_at, cl.nombre, b.apellidos, b.nombres
      LIMIT $${String(values.length)}`,
    values,
  );
}

/** Largo máximo de la justificación que escribe servicio. */
export const LARGO_JUSTIFICACION = 300;

/**
 * Servicio › Asistencia › "Justificar": la familia explicó la inasistencia y
 * servicio la pasa de AUSENTE a JUSTIFICADO con el motivo. Pasa por
 * `marcarAsistencia`, el MISMO camino de pasar lista (regla 4: es el que
 * dispara la progresión); aquí solo se comprueba que la marca exista, sea del
 * alcance de quien la toca y siga AUSENTE.
 */
export async function justificarInasistencia(input: {
  actorUserId: string;
  attendanceId: string;
  justificacion: string;
  countryScope: string[] | null;
  /** El soporte que mandó la familia (certificado médico, nota): opcional. */
  soporte?: { nombre: string; mime: string; bytes: Buffer } | null;
  ip?: string | null;
}): Promise<{ sessionId: string; childPersonId: string; soporteId: string | null }> {
  const justificacion = input.justificacion.trim();
  if (justificacion === "") throw new ValidationError("Escribe el motivo de la justificación.");
  if (justificacion.length > LARGO_JUSTIFICACION) {
    throw new ValidationError(
      `La justificación admite hasta ${String(LARGO_JUSTIFICACION)} caracteres.`,
    );
  }
  const marca = await marcaEnAlcance(input.attendanceId, input.countryScope);
  if (marca.estado !== "AUSENTE") {
    throw new ConflictError(
      marca.estado === "JUSTIFICADO"
        ? "Esa inasistencia ya está justificada."
        : "El niño asistió a esa sesión: no hay nada que justificar.",
    );
  }
  // El soporte se sube ANTES: si falla (tipo o tamaño), no se justifica nada.
  // Si después falla la marca, se suelta, para no dejar un archivo sin dueño.
  let soporteId: string | null = null;
  if (input.soporte != null) {
    soporteId = (
      await subirArchivo({
        actorUserId: input.actorUserId,
        nombreOriginal: input.soporte.nombre,
        mime: input.soporte.mime,
        bytes: input.soporte.bytes,
        entidad: ENTIDAD_SOPORTE,
        entidadId: input.attendanceId,
        politica: POLITICA_SOPORTE,
      })
    ).id;
  }
  try {
    await marcarAsistencia({
      actorUserId: input.actorUserId,
      sessionId: marca.sessionId,
      marcas: [{ childPersonId: marca.childPersonId, estado: "JUSTIFICADO", justificacion }],
      ip: input.ip ?? null,
    });
  } catch (error) {
    if (soporteId !== null) await eliminarArchivo(soporteId);
    throw error;
  }
  return { sessionId: marca.sessionId, childPersonId: marca.childPersonId, soporteId };
}

/** Entidad de `files` del soporte de una justificación (clave: id de la marca). */
const ENTIDAD_SOPORTE = "attendance_soporte";

/** Un certificado o una nota: PDF o foto, hasta 10 MB. Nada de audio ni HTML. */
const POLITICA_SOPORTE: PoliticaArchivo = {
  mimes: new Map([
    ["application/pdf", "pdf"],
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ]),
  tamanoMaximo: TAMANO_MAXIMO_BYTES,
};

async function marcaEnAlcance(
  attendanceId: string,
  countryScope: string[] | null,
): Promise<{ sessionId: string; childPersonId: string; estado: string }> {
  const marca = await queryOne<{
    sessionId: string;
    childPersonId: string;
    estado: string;
    pais: string;
  }>(
    `SELECT a.session_id AS "sessionId", a.child_person_id AS "childPersonId",
            a.estado::text AS estado, p.country_code AS pais
       FROM attendance_attendance a JOIN people_person p ON p.id = a.child_person_id
      WHERE a.id = $1`,
    [attendanceId],
  );
  if (marca === null || (countryScope !== null && !countryScope.includes(marca.pais))) {
    throw new NotFoundError("La marca de asistencia no existe.");
  }
  return marca;
}

/**
 * El soporte de una justificación, para verlo. Se pide por el id de la MARCA,
 * nunca por el del archivo: una ruta que sirviera cualquier id de `files`
 * entregaría también fotos de niños (regla 9).
 */
export async function soporteDeInasistencia(
  attendanceId: string,
  countryScope: string[] | null,
): Promise<{ nombre: string; mime: string; bytes: Buffer }> {
  await marcaEnAlcance(attendanceId, countryScope);
  const f = await queryOne<{ id: string }>(
    `SELECT id FROM files_object WHERE entidad = $1 AND entidad_id = $2
      ORDER BY created_at DESC LIMIT 1`,
    [ENTIDAD_SOPORTE, attendanceId],
  );
  if (f === null) throw new NotFoundError("Esa justificación no tiene soporte.");
  const { meta, bytes } = await descargarArchivo(f.id);
  return { nombre: meta.nombreOriginal, mime: meta.mime, bytes };
}
