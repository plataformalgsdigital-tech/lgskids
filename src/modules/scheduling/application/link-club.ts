import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { type DatosLinkClub, problemaLinkClub, problemaLinkParaFecha } from "../domain/link-club";

/**
 * LINKS DE CLUBES (2026-10-28): tabla de salas propias de los Clubs
 * (`scheduling_link_club`). La sesión del Club guarda la referencia
 * (`scheduling_session.link_club_id`) y su enlace manda sobre la sala del guía
 * (`SQL_SALA_SESION`). Un enlace en uso no se borra: se desactiva.
 */

export interface LinkClub {
  id: string;
  nombre: string;
  diaSemana: number;
  horario: string;
  link: string;
  activo: boolean;
  /** Sesiones que lo usan (las que aún no terminan). */
  sesionesFuturas: number;
  /** Sesiones que lo usan, en total: con alguna no se puede borrar. */
  sesiones: number;
}

export async function listarLinksClub(): Promise<LinkClub[]> {
  return queryRows<LinkClub>(
    `SELECT lc.id, lc.nombre, lc.dia_semana AS "diaSemana", lc.horario, lc.link, lc.activo,
            count(s.id) FILTER (WHERE s.starts_at + make_interval(mins => s.duracion_min) > now())::int
              AS "sesionesFuturas",
            count(s.id)::int AS sesiones
       FROM scheduling_link_club lc
       LEFT JOIN scheduling_session s ON s.link_club_id = lc.id
      GROUP BY lc.id
      ORDER BY lc.activo DESC, lc.dia_semana, lc.horario, lc.nombre`,
  );
}

function validar(d: DatosLinkClub): DatosLinkClub {
  const problema = problemaLinkClub(d);
  if (problema !== null) throw new ValidationError(problema);
  return {
    nombre: d.nombre.trim(),
    diaSemana: d.diaSemana,
    horario: d.horario.trim(),
    link: d.link.trim(),
  };
}

export async function crearLinkClub(
  input: DatosLinkClub & { actorUserId: string; ip?: string | null },
): Promise<{ id: string }> {
  const d = validar(input);
  const id = newId();
  await execute(
    `INSERT INTO scheduling_link_club (id, nombre, dia_semana, horario, link, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, d.nombre, d.diaSemana, d.horario, d.link, input.actorUserId],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.link_club_creado",
    entidad: "scheduling_link_club",
    entidadId: id,
    payload: { ...d },
    ip: input.ip ?? null,
  });
  return { id };
}

/**
 * Edita un link. Cambiar el DÍA de uno que ya usan sesiones futuras se rechaza:
 * esas sesiones quedarían con un link de otro día.
 */
export async function editarLinkClub(
  input: DatosLinkClub & { id: string; activo: boolean; actorUserId: string; ip?: string | null },
): Promise<void> {
  const d = validar(input);
  const antes = (await listarLinksClub()).find((l) => l.id === input.id);
  if (antes === undefined) throw new NotFoundError("El link no existe.");
  if (antes.diaSemana !== d.diaSemana && antes.sesionesFuturas > 0) {
    throw new ConflictError(
      `Lo usan ${String(antes.sesionesFuturas)} sesión(es) por delante: no se le cambia el día. Crea otro link para el día nuevo.`,
    );
  }
  await execute(
    `UPDATE scheduling_link_club
        SET nombre = $2, dia_semana = $3, horario = $4, link = $5, activo = $6, updated_at = now()
      WHERE id = $1`,
    [input.id, d.nombre, d.diaSemana, d.horario, d.link, input.activo],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.link_club_editado",
    entidad: "scheduling_link_club",
    entidadId: input.id,
    payload: { antes, despues: { ...d, activo: input.activo } },
    ip: input.ip ?? null,
  });
}

/** Borra un link que NINGUNA sesión usó; si alguna lo usa, se desactiva. */
export async function eliminarLinkClub(input: {
  id: string;
  actorUserId: string;
  ip?: string | null;
}): Promise<void> {
  const link = (await listarLinksClub()).find((l) => l.id === input.id);
  if (link === undefined) throw new NotFoundError("El link no existe.");
  if (link.sesiones > 0) {
    throw new ConflictError(
      `Lo usan ${String(link.sesiones)} sesión(es): no se borra. Desactívalo para que no se ofrezca más.`,
    );
  }
  await execute(`DELETE FROM scheduling_link_club WHERE id = $1`, [input.id]);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.link_club_eliminado",
    entidad: "scheduling_link_club",
    entidadId: input.id,
    payload: { nombre: link.nombre, link: link.link },
    ip: input.ip ?? null,
  });
}

/**
 * Exige que el link sirva para un Club en esa fecha (activo y del mismo día).
 * Lo usan crear y editar el evento, dentro de su transacción.
 *
 * `yaLoTenia`: el Club ya usaba ESE link. Entonces vale aunque se haya
 * desactivado — desactivar solo deja de ofrecerlo a clubes nuevos; editar el
 * Club (por ejemplo, cambiarle el advisor) no puede obligar a cambiarle el link.
 */
export async function exigirLinkClubParaFecha(
  linkClubId: string,
  fecha: string,
  tx?: PoolClient,
  yaLoTenia = false,
): Promise<void> {
  const link = await queryOne<{ nombre: string; diaSemana: number; activo: boolean }>(
    `SELECT nombre, dia_semana AS "diaSemana", activo FROM scheduling_link_club WHERE id = $1`,
    [linkClubId],
    tx,
  );
  if (link === null) throw new NotFoundError("El link del Club no existe.");
  const problema = problemaLinkParaFecha({ ...link, activo: link.activo || yaLoTenia }, fecha);
  if (problema !== null) throw new ValidationError(problema);
}
