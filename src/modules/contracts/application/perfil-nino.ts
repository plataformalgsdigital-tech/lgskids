import { registrarAuditoria } from "@/modules/audit";
import { eliminarArchivo, subirArchivo } from "@/modules/files";
import { fijarClaveNinoTx, problemaClaveNino } from "@/modules/identity";
import { enviarEnlacePerfil } from "@/modules/notifications";
import { progresoDeNino } from "@/modules/progression";
import {
  reservarWelcomeTx,
  welcomeDeNino,
  welcomesDisponibles,
  type WelcomeDeNino,
  type WelcomeDisponible,
} from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { execute, queryOne } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { logger } from "@/platform/logging/logger";
import {
  enlacePerfil,
  estadoEnlacePerfil,
  hashTokenPerfil,
  nuevoTokenPerfil,
  pareceTokenPerfil,
  problemaTextoPerfil,
  type EstadoEnlacePerfil,
} from "../domain/enlace-perfil";

/**
 * CREACIÓN DE PERFIL DEL NIÑO (2026-10-10).
 *
 * Al aprobarse el contrato, KIDS le manda al APODERADO un enlace por WhatsApp.
 * En él el niño ve su usuario, ELIGE su clave, completa su perfil (foto, "sobre
 * ti", hobbies, fecha de nacimiento) y AGENDA su Welcome, obligatorio. Clave,
 * perfil y Welcome van en UNA transacción: o queda todo, o nada, y el enlace
 * sigue sirviendo.
 *
 * Réplica del /nuevo-usuario de LGS, corrigiendo lo que allá falla: el enlace es
 * un token de un solo uso (no el id del registro), la clave va con hash y el
 * cupo del Welcome se toma con bloqueo.
 *
 * La foto es la MISMA que pide /mi-panel: un archivo `student_foto` del niño.
 */

/** Entidad de la foto del alumno en `files` (la que pinta /mi-panel). */
const ENTIDAD_FOTO = "student_foto";
const MIMES_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);

interface FilaEnlace {
  id: string;
  childPersonId: string;
  usadoEn: string | null;
  revocadoEn: string | null;
}

interface MatriculaNino {
  classroomId: string;
  salon: string;
  curso: string;
  campania: string;
  inicioCurso: string;
}

/** La matrícula ACTIVA del niño: de ella salen los Welcome que le sirven. */
async function matriculaDeNino(childPersonId: string): Promise<MatriculaNino | null> {
  return queryOne<MatriculaNino>(
    `SELECT cl.id AS "classroomId", cl.nombre AS salon, co.tipo::text AS curso,
            ca.nombre AS campania, co.inicio::text AS "inicioCurso"
       FROM enrollment_enrollment e
       JOIN scheduling_classroom cl ON cl.id = e.classroom_id
       JOIN catalog_course co ON co.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = co.campaign_id
      WHERE e.child_person_id = $1 AND e.estado = 'ACTIVA'
      ORDER BY e.created_at DESC LIMIT 1`,
    [childPersonId],
  );
}

/** El nivel en que va el niño, con la MISMA regla del panel del alumno. */
async function nivelDeNino(childPersonId: string): Promise<string> {
  const progreso = await progresoDeNino(childPersonId);
  const actual =
    progreso.niveles.find((n) => n.estado === "EN_CURSO") ??
    progreso.niveles.find((n) => n.estado !== "COMPLETADO") ??
    progreso.niveles[0];
  return actual?.codigo ?? "ROOKIE";
}

/**
 * Emite un enlace NUEVO para el niño y revoca el que tuviera vivo (uno vivo por
 * niño). Devuelve el token: es la única vez que existe en claro.
 */
async function emitirEnlace(input: {
  childPersonId: string;
  contractId: string | null;
  actorUserId: string | null;
}): Promise<string> {
  const token = nuevoTokenPerfil();
  await withTransaction(async (tx) => {
    await execute(
      `UPDATE contracts_enlace_perfil SET revocado_en = now()
        WHERE child_person_id = $1 AND usado_en IS NULL AND revocado_en IS NULL`,
      [input.childPersonId],
      tx,
    );
    await execute(
      `INSERT INTO contracts_enlace_perfil (id, child_person_id, contract_id, token_hash, creado_por)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId(), input.childPersonId, input.contractId, hashTokenPerfil(token), input.actorUserId],
      tx,
    );
  });
  return token;
}

export interface EnvioEnlacePerfil {
  enviado: boolean;
  destinatario: string | null;
  error?: string;
}

/**
 * Emite el enlace y se lo manda al apoderado. Lo llama el alta única al aprobar
 * el contrato y el botón "Reenviar enlace de perfil" de la ficha.
 */
export async function enviarCreacionPerfil(input: {
  actorUserId: string;
  childPersonId: string;
  contractId: string | null;
  ip?: string | null;
}): Promise<EnvioEnlacePerfil> {
  const persona = await queryOne<{ userId: string | null; completado: string | null }>(
    `SELECT user_id AS "userId", perfil_completado_en AS completado
       FROM people_person WHERE id = $1`,
    [input.childPersonId],
  );
  if (persona === null) throw new NotFoundError("El niño no existe.");
  if (persona.userId === null) {
    throw new ConflictError("El niño todavía no tiene cuenta: nace al aprobar su contrato.");
  }
  if (persona.completado !== null) {
    throw new ConflictError("El niño ya creó su perfil: el enlace ya no hace falta.");
  }
  const token = await emitirEnlace({
    childPersonId: input.childPersonId,
    contractId: input.contractId,
    actorUserId: input.actorUserId,
  });
  const r = await enviarEnlacePerfil({
    actorUserId: input.actorUserId,
    childPersonId: input.childPersonId,
    enlace: enlacePerfil(env().APP_URL, token),
    ip: input.ip ?? null,
  });
  return r.ok
    ? { enviado: true, destinatario: r.destinatario }
    : { enviado: false, destinatario: r.destinatario, error: r.error ?? "desconocido" };
}

/**
 * Lo mismo, pero SIN romper a quien llama: el alta única no puede fallar porque
 * WhatsApp no respondió. Lo que falle queda dicho en la respuesta y en la
 * auditoría, y se reenvía desde la ficha.
 */
export async function enviarCreacionPerfilSinFallar(input: {
  actorUserId: string;
  childPersonId: string;
  contractId: string | null;
  ip?: string | null;
}): Promise<EnvioEnlacePerfil> {
  try {
    return await enviarCreacionPerfil(input);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.warn("No se pudo enviar el enlace de creación de perfil", {
      childPersonId: input.childPersonId,
      error,
    });
    return { enviado: false, destinatario: null, error };
  }
}

// —— La página pública del enlace ——————————————————————————————————————

async function enlacePorToken(token: string): Promise<FilaEnlace | null> {
  if (!pareceTokenPerfil(token)) return null;
  return queryOne<FilaEnlace>(
    `SELECT id, child_person_id AS "childPersonId", usado_en AS "usadoEn",
            revocado_en AS "revocadoEn"
       FROM contracts_enlace_perfil WHERE token_hash = $1`,
    [hashTokenPerfil(token)],
  );
}

export type FichaPerfil =
  | { estado: "INVALIDO" }
  | { estado: "USADO" | "REVOCADO"; nombre: string }
  | {
      estado: "VIGENTE";
      nombre: string;
      usuario: string;
      fechaNacimiento: string | null;
      curso: string | null;
      salon: string | null;
      inicioCurso: string | null;
      welcomes: WelcomeDisponible[];
    };

/** Lo que ve el niño al abrir su enlace. Un token desconocido no dice nada más. */
export async function fichaPorEnlacePerfil(token: string): Promise<FichaPerfil> {
  const enlace = await enlacePorToken(token);
  if (enlace === null) return { estado: "INVALIDO" };
  const nino = await queryOne<{
    nombres: string;
    fechaNacimiento: string | null;
    usuario: string | null;
  }>(
    `SELECT p.nombres, p.fecha_nacimiento::text AS "fechaNacimiento", u.username AS usuario
       FROM people_person p LEFT JOIN identity_user u ON u.id = p.user_id
      WHERE p.id = $1`,
    [enlace.childPersonId],
  );
  if (nino === null || nino.usuario === null) return { estado: "INVALIDO" };
  const nombre = nino.nombres.trim().split(/\s+/)[0] ?? nino.nombres;
  const estado: EstadoEnlacePerfil = estadoEnlacePerfil(enlace);
  if (estado !== "VIGENTE") return { estado, nombre };

  const matricula = await matriculaDeNino(enlace.childPersonId);
  const welcomes =
    matricula === null
      ? []
      : await welcomesDisponibles({
          classroomId: matricula.classroomId,
          nivel: await nivelDeNino(enlace.childPersonId),
        });
  return {
    estado: "VIGENTE",
    nombre,
    usuario: nino.usuario,
    fechaNacimiento: nino.fechaNacimiento,
    curso: matricula?.curso ?? null,
    salon: matricula?.salon ?? null,
    inicioCurso: matricula?.inicioCurso ?? null,
    welcomes,
  };
}

export interface DatosPerfil {
  clave: string;
  confirmacion: string;
  sobreTi: string;
  hobbies: string;
  fechaNacimiento: string;
  welcomeId: string;
  foto: { nombre: string; mime: string; bytes: Buffer } | null;
}

/**
 * Completa el perfil desde el enlace: clave, perfil y Welcome en UNA
 * transacción. La foto se sube ANTES (vive en `files`, fuera de la base) y se
 * suelta si la transacción falla, para no dejar archivos huérfanos.
 */
export async function completarPerfilNino(
  token: string,
  datos: DatosPerfil,
  ip?: string | null,
): Promise<{ usuario: string; welcome: WelcomeDeNino | null }> {
  // —— Validación de lo que no depende de la base ——
  const problemas = [
    problemaClaveNino(datos.clave),
    datos.clave !== datos.confirmacion ? "Las dos claves no coinciden." : null,
    problemaTextoPerfil("Cuéntanos sobre ti", datos.sobreTi),
    problemaTextoPerfil("Hobbies e intereses", datos.hobbies),
    /^\d{4}-\d{2}-\d{2}$/.test(datos.fechaNacimiento) &&
    !Number.isNaN(Date.parse(datos.fechaNacimiento))
      ? null
      : "Falta la fecha de nacimiento.",
    datos.welcomeId === "" ? "Elige tu sesión Welcome." : null,
    datos.foto === null ? "Falta la foto." : null,
    datos.foto !== null && !MIMES_FOTO.has(datos.foto.mime)
      ? "La foto debe ser JPG, PNG o WebP."
      : null,
  ].filter((p): p is string => p !== null);
  if (problemas.length > 0) {
    throw new ValidationError(problemas[0] ?? "Datos inválidos.", { details: problemas });
  }

  const enlace = await enlacePorToken(token);
  if (enlace === null) throw new NotFoundError("El enlace no es válido.");
  if (estadoEnlacePerfil(enlace) !== "VIGENTE") {
    throw new ConflictError(
      "Este enlace ya se usó o fue reemplazado. Si necesitas uno nuevo, pídelo a LGS Kids.",
    );
  }
  const nino = await queryOne<{ userId: string | null; usuario: string | null }>(
    `SELECT p.user_id AS "userId", u.username AS usuario
       FROM people_person p LEFT JOIN identity_user u ON u.id = p.user_id
      WHERE p.id = $1`,
    [enlace.childPersonId],
  );
  if (nino?.userId == null || nino.usuario === null) {
    throw new ConflictError("El niño todavía no tiene cuenta.");
  }
  const userId = nino.userId;
  const matricula = await matriculaDeNino(enlace.childPersonId);
  if (matricula === null) {
    throw new ConflictError("El niño no tiene matrícula activa: avisa a LGS Kids.");
  }
  const nivel = await nivelDeNino(enlace.childPersonId);

  // La foto va primero; si algo falla después, se suelta.
  const foto = datos.foto as NonNullable<DatosPerfil["foto"]>;
  const subida = await subirArchivo({
    actorUserId: userId,
    nombreOriginal: foto.nombre,
    mime: foto.mime,
    bytes: foto.bytes,
    entidad: ENTIDAD_FOTO,
    entidadId: enlace.childPersonId,
  });

  try {
    await withTransaction(async (tx) => {
      // El enlace se bloquea y se vuelve a mirar: dos envíos del mismo
      // formulario no pueden fijar la clave dos veces.
      const vivo = await queryOne<{ id: string }>(
        `SELECT id FROM contracts_enlace_perfil
          WHERE id = $1 AND usado_en IS NULL AND revocado_en IS NULL FOR UPDATE`,
        [enlace.id],
        tx,
      );
      if (vivo === null) {
        throw new ConflictError("Este enlace ya se usó o fue reemplazado.");
      }
      await fijarClaveNinoTx(tx, userId, datos.clave);
      await execute(
        `UPDATE people_person
            SET sobre_ti = $2, hobbies = $3, fecha_nacimiento = $4::date,
                perfil_completado_en = now(), updated_at = now()
          WHERE id = $1`,
        [enlace.childPersonId, datos.sobreTi.trim(), datos.hobbies.trim(), datos.fechaNacimiento],
        tx,
      );
      await reservarWelcomeTx(tx, {
        welcomeId: datos.welcomeId,
        childPersonId: enlace.childPersonId,
        classroomId: matricula.classroomId,
        nivel,
        agendadoPor: null,
      });
      await execute(
        `UPDATE contracts_enlace_perfil SET usado_en = now() WHERE id = $1`,
        [enlace.id],
        tx,
      );
    });
  } catch (e) {
    await eliminarArchivo(subida.id).catch(() => undefined);
    throw e;
  }

  await registrarAuditoria({
    actorUserId: userId,
    accion: "contracts.perfil_completado",
    entidad: "people_person",
    entidadId: enlace.childPersonId,
    payload: { welcomeId: datos.welcomeId, fotoId: subida.id },
    ip: ip ?? null,
  });
  return { usuario: nino.usuario, welcome: await welcomeDeNino(enlace.childPersonId) };
}

// —— Estado en la ficha del niño ————————————————————————————————————————

/** El niño, si está en el alcance por país de quien mira; si no, 404. */
async function exigirAlcance(childPersonId: string, countryScope: string[] | null): Promise<void> {
  const p = await queryOne<{ pais: string }>(
    `SELECT country_code AS pais FROM people_person WHERE id = $1`,
    [childPersonId],
  );
  if (p === null || (countryScope !== null && !countryScope.includes(p.pais))) {
    throw new NotFoundError("El niño no existe.");
  }
}

/** "Reenviar enlace de perfil" de la ficha: emite uno nuevo y revoca el anterior. */
export async function reenviarEnlacePerfil(input: {
  actorUserId: string;
  childPersonId: string;
  countryScope: string[] | null;
  ip?: string | null;
}): Promise<EnvioEnlacePerfil> {
  await exigirAlcance(input.childPersonId, input.countryScope);
  return enviarCreacionPerfil({
    actorUserId: input.actorUserId,
    childPersonId: input.childPersonId,
    contractId: null,
    ip: input.ip ?? null,
  });
}

export interface EstadoPerfilNino {
  perfilCompletadoEn: string | null;
  sobreTi: string | null;
  hobbies: string | null;
  /** El último enlace emitido, si lo hay. */
  enlace: { estado: EstadoEnlacePerfil; creadoEn: string } | null;
  welcome: WelcomeDeNino | null;
}

export async function estadoPerfilNino(
  childPersonId: string,
  countryScope: string[] | null,
): Promise<EstadoPerfilNino> {
  await exigirAlcance(childPersonId, countryScope);
  const p = await queryOne<{
    perfilCompletadoEn: string | null;
    sobreTi: string | null;
    hobbies: string | null;
  }>(
    `SELECT perfil_completado_en AS "perfilCompletadoEn", sobre_ti AS "sobreTi", hobbies
       FROM people_person WHERE id = $1`,
    [childPersonId],
  );
  if (p === null) throw new NotFoundError("El niño no existe.");
  const e = await queryOne<{ creadoEn: string; usadoEn: string | null; revocadoEn: string | null }>(
    `SELECT creado_en AS "creadoEn", usado_en AS "usadoEn", revocado_en AS "revocadoEn"
       FROM contracts_enlace_perfil WHERE child_person_id = $1
      ORDER BY creado_en DESC LIMIT 1`,
    [childPersonId],
  );
  return {
    ...p,
    enlace: e === null ? null : { estado: estadoEnlacePerfil(e), creadoEn: e.creadoEn },
    welcome: await welcomeDeNino(childPersonId),
  };
}
