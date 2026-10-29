import type { PoolClient } from "pg";
import { condicionesPorPalabras } from "@/platform/db/busqueda";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import type { PersonInput, PersonListItem, PersonRecord } from "../application/ports";

type Queryable = Pick<PoolClient, "query">;

const SELECT_PERSON = `SELECT id, nombres, apellidos,
  fecha_nacimiento::text AS "fechaNacimiento",
  doc_tipo AS "docTipo", doc_numero AS "docNumero",
  country_code AS "countryCode", email, telefono, estado, user_id AS "userId"
  FROM people_person`;

export async function findPersonById(id: string, client?: Queryable): Promise<PersonRecord | null> {
  return queryOne<PersonRecord>(`${SELECT_PERSON} WHERE id = $1`, [id], client);
}

export async function findPersonByUserId(
  userId: string,
  client?: Queryable,
): Promise<PersonRecord | null> {
  return queryOne<PersonRecord>(`${SELECT_PERSON} WHERE user_id = $1`, [userId], client);
}

export async function findPersonByDoc(
  countryCode: string,
  docTipo: string,
  docNumero: string,
  client?: Queryable,
): Promise<PersonRecord | null> {
  return queryOne<PersonRecord>(
    `${SELECT_PERSON} WHERE country_code = $1 AND doc_tipo = $2 AND doc_numero = $3`,
    [countryCode, docTipo, docNumero],
    client,
  );
}

export async function insertPerson(input: PersonInput, client?: Queryable): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO people_person
       (id, nombres, apellidos, fecha_nacimiento, doc_tipo, doc_numero,
        country_code, email, telefono, updated_at)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, now())`,
    [
      id,
      input.nombres.trim(),
      input.apellidos.trim(),
      input.fechaNacimiento ?? null,
      input.docTipo.trim().toUpperCase(),
      input.docNumero.trim(),
      input.countryCode,
      input.email?.trim() || null,
      input.telefono?.trim() || null,
    ],
    client,
  );
  return id;
}

/**
 * ¿La persona está ligada a algo más que a `exceptoNinoId`? (apoderada de otro
 * niño, titular de algún contrato, o con cuenta propia). Si lo está, sus nombres
 * no se pisan desde una edición del apoderado de un niño.
 */
export async function personaCompartida(
  personId: string,
  exceptoNinoId: string,
  client?: Queryable,
): Promise<boolean> {
  const row = await queryOne<{ n: string }>(
    `SELECT (
       (SELECT count(*) FROM people_guardianship WHERE apoderado_id = $1 AND nino_id <> $2)
     + (SELECT count(*) FROM contracts_contract WHERE titular_id = $1)
     + (SELECT count(*) FROM people_person WHERE id = $1 AND user_id IS NOT NULL)
     )::text AS n`,
    [personId, exceptoNinoId],
    client,
  );
  return Number(row?.n ?? 0) > 0;
}

/**
 * Actualiza datos de una persona. `soloContacto` = solo correo y teléfono (los
 * nombres se conservan). Los valores vacíos no borran lo que había.
 */
export async function actualizarDatosPersona(
  personId: string,
  datos: { nombres?: string; apellidos?: string; email?: string | null; telefono?: string | null },
  soloContacto: boolean,
  client?: Queryable,
): Promise<void> {
  await execute(
    `UPDATE people_person
        SET nombres   = CASE WHEN $2 OR NULLIF(TRIM($3), '') IS NULL THEN nombres ELSE TRIM($3) END,
            apellidos = CASE WHEN $2 OR NULLIF(TRIM($4), '') IS NULL THEN apellidos ELSE TRIM($4) END,
            email     = COALESCE(NULLIF(TRIM($5), ''), email),
            telefono  = COALESCE(NULLIF(TRIM($6), ''), telefono),
            updated_at = now()
      WHERE id = $1`,
    [
      personId,
      soloContacto,
      datos.nombres ?? null,
      datos.apellidos ?? null,
      datos.email ?? null,
      datos.telefono ?? null,
    ],
    client,
  );
}

/**
 * Deja a `apoderadoId` como EL apoderado del niño (con su parentesco): quita
 * las otras tutelas del niño. LGS maneja un apoderado por niño.
 */
export async function reemplazarApoderado(
  ninoId: string,
  apoderadoId: string,
  parentesco: string | null,
  client?: Queryable,
): Promise<void> {
  await execute(
    `DELETE FROM people_guardianship WHERE nino_id = $1 AND apoderado_id <> $2`,
    [ninoId, apoderadoId],
    client,
  );
  await execute(
    `INSERT INTO people_guardianship (id, nino_id, apoderado_id, parentesco)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (nino_id, apoderado_id) DO UPDATE SET parentesco = EXCLUDED.parentesco`,
    [newId(), ninoId, apoderadoId, parentesco],
    client,
  );
}

export interface NinoListItem {
  id: string;
  nombres: string;
  apellidos: string;
  docTipo: string;
  docNumero: string;
  countryCode: string;
  fechaNacimiento: string | null;
  estado: string;
  username: string | null;
  correo: string | null;
  contratoNumero: number | null;
  externalRef: string | null;
  tipoCurso: string | null;
  inicio: string | null;
  finalContrato: string | null;
  contratoEstado: string | null;
  campania: string | null;
  curso: string | null;
  salon: string | null;
  /** Matrícula viva: ACTIVA, o RESERVADA (reservó cupo y falta aprobar). */
  matriculaEstado: string | null;
}

/**
 * NIÑO = quien juega el papel de niño: el beneficiario de un contrato o el
 * menor de una relación apoderado–niño.
 *
 * Antes bastaba con tener fecha de nacimiento, y por ahí se colaban los
 * APODERADOS: LGS manda también la del titular, así que la sección Kids listaba
 * a la mamá junto a su hijo, sin campaña ni curso. La edad no dice quién es
 * niño; el papel en el contrato sí.
 */
const ES_NINO = `(EXISTS (SELECT 1 FROM people_guardianship g WHERE g.nino_id = p.id)
       OR EXISTS (SELECT 1 FROM contracts_contract cc WHERE cc.beneficiario_id = p.id))`;

/**
 * Lista de NIÑOS enriquecida con su usuario, su contrato más reciente y — si
 * tiene matrícula viva — su campaña, curso y salón.
 * Alcance por país (ADR-0009) + filtros de la sección Kids.
 */
export async function listNinos(params: {
  countryScope: string[] | null;
  id?: string;
  /** Texto libre: nombre, apellido, documento, usuario o N° de contrato. */
  buscar?: string;
  estado?: string;
  tipoCurso?: string;
  campaignId?: string;
  classroomId?: string;
  inicioDesde?: string;
  finalHasta?: string;
  limit: number;
  offset: number;
}): Promise<NinoListItem[]> {
  const where: string[] = [ES_NINO];
  const values: unknown[] = [];
  if (params.countryScope !== null) {
    values.push(params.countryScope);
    where.push(`p.country_code = ANY($${values.length})`);
  }
  if (params.id !== undefined && params.id !== "") {
    values.push(`%${params.id}%`);
    where.push(`p.doc_numero ILIKE $${values.length}`);
  }
  if (params.buscar !== undefined && params.buscar.trim() !== "") {
    // Buscador por PALABRAS: cada una tiene que aparecer en el nombre, el
    // apellido, el documento, el usuario o el N° de contrato (interno o de LGS).
    // Así "elysa acevedo" y "acevedo elysa" encuentran a la misma niña, y el N°
    // de LGS sin sufijo trae a TODOS los hermanos de ese contrato. Sin tildes ni
    // mayúsculas, y el documento sin puntos ni guiones.
    condicionesPorPalabras(
      params.buscar,
      {
        columnas: ["p.nombres", "p.apellidos", "u.username", "c.external_ref"],
        exactas: ["c.numero::text"],
        documentos: ["p.doc_numero"],
      },
      where,
      values,
    );
  }
  if (params.estado !== undefined) {
    values.push(params.estado);
    where.push(`p.estado = $${values.length}::people_person_estado`);
  }
  if (params.tipoCurso !== undefined) {
    values.push(params.tipoCurso);
    where.push(`c.tipo_curso = $${values.length}::catalog_course_tipo`);
  }
  if (params.campaignId !== undefined) {
    values.push(params.campaignId);
    where.push(`ca.id = $${values.length}`);
  }
  if (params.classroomId !== undefined) {
    // Por el salón de su matrícula VIVA: la lista del salón se deriva de las
    // matrículas, nunca de una tabla aparte (Fase 7).
    values.push(params.classroomId);
    where.push(`cl.id = $${values.length}`);
  }
  if (params.inicioDesde !== undefined) {
    values.push(params.inicioDesde);
    where.push(`c.inicio >= $${values.length}::date`);
  }
  if (params.finalHasta !== undefined) {
    values.push(params.finalHasta);
    where.push(`c.final_contrato <= $${values.length}::date`);
  }
  values.push(params.limit);
  const limitIdx = values.length;
  values.push(params.offset);
  const offsetIdx = values.length;

  return queryRows<NinoListItem>(
    `SELECT p.id, p.nombres, p.apellidos, p.doc_tipo AS "docTipo", p.doc_numero AS "docNumero",
            p.country_code AS "countryCode", p.fecha_nacimiento::text AS "fechaNacimiento",
            p.estado, u.username, COALESCE(u.email, p.email) AS correo,
            c.numero AS "contratoNumero", c.external_ref AS "externalRef",
            c.tipo_curso::text AS "tipoCurso", c.inicio::text AS inicio,
            c.final_contrato::text AS "finalContrato", c.estado::text AS "contratoEstado",
            ca.nombre AS campania, cl.nombre AS salon, e.estado::text AS "matriculaEstado",
            COALESCE(cu.tipo::text, c.tipo_curso::text) AS curso
       FROM people_person p
       LEFT JOIN identity_user u ON u.id = p.user_id
       LEFT JOIN LATERAL (
         SELECT * FROM contracts_contract cc
          WHERE cc.beneficiario_id = p.id
          ORDER BY cc.created_at DESC LIMIT 1
       ) c ON true
       LEFT JOIN enrollment_enrollment e
         ON e.child_person_id = p.id AND e.estado IN ('ACTIVA', 'RESERVADA')
       LEFT JOIN scheduling_classroom cl ON cl.id = e.classroom_id
       LEFT JOIN catalog_course cu ON cu.id = cl.course_id
       LEFT JOIN catalog_campaign ca ON ca.id = cu.campaign_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.apellidos, p.nombres
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );
}

export interface NinoDetalle {
  id: string;
  nombres: string;
  apellidos: string;
  docTipo: string;
  docNumero: string;
  countryCode: string;
  fechaNacimiento: string | null;
  personaEmail: string | null;
  telefono: string | null;
  estado: string;
  /** Cuenta del niño: la usa "Ver clave" (solo superadmin). */
  userId: string | null;
  /** Contrato más reciente: lo usa Academic Change. */
  contractId: string | null;
  username: string | null;
  correo: string | null;
  contratoNumero: number | null;
  externalRef: string | null;
  tipoCurso: string | null;
  inicio: string | null;
  finalContrato: string | null;
  contratoEstado: string | null;
  firmado: boolean | null;
  matriculaEstado: string | null;
  salon: string | null;
  meetingUrl: string | null;
  campania: string | null;
  curso: string | null;
  guia: string | null;
  proximaSesion: string | null;
  /**
   * La SIGUIENTE clase del salón (la que está en curso cuenta, hasta que
   * termine), con el guía y la sala de ESA sesión: si la cubre un reemplazo,
   * es la suya. Las canceladas sin reemplazo no se dictan y se saltan.
   */
  siguienteClase: {
    startsAt: string;
    tipo: string;
    duracionMin: number;
    timezone: string;
    guia: string | null;
    meetingUrl: string | null;
  } | null;
  apoderados: {
    nombre: string;
    docTipo: string;
    docNumero: string;
    telefono: string | null;
    email: string | null;
    parentesco: string | null;
  }[];
}

/** Ficha COMPLETA de un niño para la página de consulta. */
export async function detalleNino(id: string): Promise<NinoDetalle | null> {
  interface Row extends Omit<NinoDetalle, "apoderados"> {
    apoderados: NinoDetalle["apoderados"] | null;
  }
  const row = await queryOne<Row>(
    `SELECT p.id, p.nombres, p.apellidos, p.doc_tipo AS "docTipo", p.doc_numero AS "docNumero",
            p.country_code AS "countryCode", p.fecha_nacimiento::text AS "fechaNacimiento",
            p.email AS "personaEmail", p.telefono, p.estado,
            u.id AS "userId", u.username, u.email AS correo,
            c.id AS "contractId", c.numero AS "contratoNumero", c.external_ref AS "externalRef",
            c.tipo_curso::text AS "tipoCurso", c.inicio::text AS inicio,
            c.final_contrato::text AS "finalContrato", c.estado::text AS "contratoEstado",
            c.firmado,
            e.estado::text AS "matriculaEstado", cl.nombre AS salon,
            -- La sala es la del GUÍA; la del salón solo si el guía no tiene.
            COALESCE(NULLIF(TRIM(gg.zoom_url), ''), cl.meeting_url) AS "meetingUrl",
            ca.nombre AS campania,
            COALESCE(cu.tipo::text, c.tipo_curso::text) AS curso,
            -- El nombre del guía vive en SU ficha (scheduling_guia); people_person
            -- solo lo tendría si fuera alumno. Mirar solo esa mostraba el usuario
            -- generado (vespinosa7913).
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', gg.nombres, gg.apellidos)), ''),
              NULLIF(TRIM(CONCAT_WS(' ', gpf.nombres, gpf.apellidos)), ''),
              NULLIF(TRIM(CONCAT_WS(' ', gp.nombres, gp.apellidos)), ''),
              gu.username) AS guia,
            (SELECT min(s.fecha)::text FROM scheduling_session s
              WHERE s.classroom_id = cl.id AND s.fecha >= (now() AT TIME ZONE 'UTC')::date) AS "proximaSesion",
            CASE WHEN sig.starts_at IS NULL THEN NULL ELSE json_build_object(
              'startsAt', sig.starts_at, 'tipo', sig.tipo, 'duracionMin', sig.duracion_min,
              'timezone', cl.timezone, 'guia', sig.guia, 'meetingUrl', sig.url) END
              AS "siguienteClase",
            COALESCE((SELECT json_agg(json_build_object(
                        'nombre', a.nombres || ' ' || a.apellidos, 'docTipo', a.doc_tipo,
                        'docNumero', a.doc_numero, 'telefono', a.telefono, 'email', a.email,
                        'parentesco', g.parentesco))
                        FROM people_guardianship g
                        JOIN people_person a ON a.id = g.apoderado_id
                       WHERE g.nino_id = p.id), '[]'::json) AS apoderados
       FROM people_person p
       LEFT JOIN identity_user u ON u.id = p.user_id
       LEFT JOIN LATERAL (
         SELECT * FROM contracts_contract cc WHERE cc.beneficiario_id = p.id
          ORDER BY cc.created_at DESC LIMIT 1
       ) c ON true
       LEFT JOIN enrollment_enrollment e ON e.child_person_id = p.id AND e.estado IN ('ACTIVA', 'RESERVADA')
       LEFT JOIN scheduling_classroom cl ON cl.id = e.classroom_id
       LEFT JOIN catalog_course cu ON cu.id = cl.course_id
       LEFT JOIN catalog_campaign ca ON ca.id = cu.campaign_id
       LEFT JOIN identity_user gu ON gu.id = cl.guia_user_id
       LEFT JOIN people_person gp ON gp.user_id = gu.id
       LEFT JOIN scheduling_guia gg ON gg.guia_user_id = gu.id
       LEFT JOIN identity_perfil gpf ON gpf.user_id = gu.id
       LEFT JOIN LATERAL (
         SELECT s.starts_at, s.tipo::text AS tipo, s.duracion_min,
                -- El link propio del Club manda (SQL_LINK_CLUB de scheduling, que
                -- people no puede importar); si no, la sala del guía o la del salón.
                COALESCE((SELECT NULLIF(TRIM(lc.link), '') FROM scheduling_link_club lc
                           WHERE lc.id = s.link_club_id),
                         NULLIF(TRIM(sg.zoom_url), ''), scl.meeting_url) AS url,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', sg.nombres, sg.apellidos)), ''),
                         NULLIF(TRIM(CONCAT_WS(' ', spf.nombres, spf.apellidos)), ''),
                         su.username) AS guia
           FROM scheduling_session s
           JOIN scheduling_classroom scl ON scl.id = s.classroom_id
           LEFT JOIN identity_user su ON su.id = COALESCE(s.guia_user_id, scl.guia_user_id)
           LEFT JOIN scheduling_guia sg ON sg.guia_user_id = su.id
           LEFT JOIN identity_perfil spf ON spf.user_id = su.id
          -- Su salón, o lo que se le AGENDÓ en otro (Academic management › Agendar).
          -- Un CLUB es de inscritos: de su salón solo si se inscribió.
          WHERE ((s.classroom_id = cl.id AND s.tipo <> 'CLUB')
                 OR EXISTS (SELECT 1 FROM scheduling_agendado a
                             WHERE a.child_person_id = p.id AND a.estado = 'ACTIVA'
                               AND a.classroom_id = s.classroom_id AND a.starts_at = s.starts_at))
            AND s.starts_at + make_interval(mins => s.duracion_min) > now()
            -- Cancelada sin reemplazo: no se dicta (mismo criterio que
            -- SQL_SESION_CANCELADA de scheduling, que people no puede importar).
            AND NOT EXISTS (
              SELECT 1 FROM scheduling_cancelacion cx
               WHERE cx.session_id = s.id AND cx.estado = 'APROBADA'
                 AND cx.reemplazo_guia_user_id IS NULL)
          ORDER BY s.starts_at
          LIMIT 1
       ) sig ON true
      WHERE p.id = $1`,
    [id],
  );
  if (row === null) return null;
  return { ...row, apoderados: row.apoderados ?? [] };
}

export async function insertGuardianship(
  ninoId: string,
  apoderadoId: string,
  parentesco: string | null,
  client?: Queryable,
): Promise<void> {
  await execute(
    `INSERT INTO people_guardianship (id, nino_id, apoderado_id, parentesco)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (nino_id, apoderado_id) DO NOTHING`,
    [newId(), ninoId, apoderadoId, parentesco],
    client,
  );
}

export async function linkUser(
  personId: string,
  userId: string,
  client?: Queryable,
): Promise<void> {
  await execute(
    `UPDATE people_person SET user_id = $2, updated_at = now() WHERE id = $1`,
    [personId, userId],
    client,
  );
}

export async function setPersonEstado(
  personId: string,
  estado: "ACTIVA" | "INACTIVA",
  client?: Queryable,
): Promise<void> {
  await execute(
    `UPDATE people_person SET estado = $2::people_person_estado, updated_at = now() WHERE id = $1`,
    [personId, estado],
    client,
  );
}

/**
 * Lista paginada con ALCANCE POR PAÍS: si `countryScope` no es null, solo se
 * ven personas de esos países (ADR-0009). Búsqueda simple por nombre/documento.
 */
export async function listPersons(params: {
  countryScope: string[] | null;
  buscar?: string;
  limit: number;
  offset: number;
}): Promise<PersonListItem[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (params.countryScope !== null) {
    values.push(params.countryScope);
    where.push(`p.country_code = ANY($${values.length})`);
  }
  if (params.buscar !== undefined && params.buscar !== "") {
    values.push(`%${params.buscar}%`);
    where.push(
      `(p.nombres ILIKE $${values.length} OR p.apellidos ILIKE $${values.length} OR p.doc_numero ILIKE $${values.length} OR u.username ILIKE $${values.length})`,
    );
  }
  values.push(params.limit);
  const limitIdx = values.length;
  values.push(params.offset);
  const offsetIdx = values.length;

  interface Row extends PersonRecord {
    apoderados: { id: string; nombres: string; apellidos: string }[] | null;
    username: string | null;
  }
  const rows = await queryRows<Row>(
    `SELECT p.id, p.nombres, p.apellidos,
            p.fecha_nacimiento::text AS "fechaNacimiento",
            p.doc_tipo AS "docTipo", p.doc_numero AS "docNumero",
            p.country_code AS "countryCode", p.email, p.telefono, p.estado,
            p.user_id AS "userId", u.username,
            (SELECT json_agg(json_build_object('id', a.id, 'nombres', a.nombres, 'apellidos', a.apellidos))
               FROM people_guardianship g
               JOIN people_person a ON a.id = g.apoderado_id
              WHERE g.nino_id = p.id) AS apoderados
       FROM people_person p
       LEFT JOIN identity_user u ON u.id = p.user_id
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY p.apellidos, p.nombres
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );
  return rows.map((r) => ({ ...r, apoderados: r.apoderados ?? [] }));
}
