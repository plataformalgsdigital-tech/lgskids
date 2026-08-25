import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import {
  deleteHorarioCatalogo,
  existsHorarioEtiqueta,
  getHorarioCatalogo,
  insertHorarioCatalogo,
  listHorariosCatalogo,
  setHorarioActivo,
  updateHorarioCatalogo,
  type HorarioCatalogoRecord,
  type HorarioSlotInput,
} from "../infrastructure/scheduling-repository";

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Grupos de país del catálogo de horarios (por desfase horario CL vs. resto). */
export const GRUPOS_PAIS: Record<"01" | "02", string> = {
  "01": "Chile",
  "02": "Colombia, Ecuador y Perú",
};

function validarSlots(slots: HorarioSlotInput[]): void {
  if (slots.length < 1 || slots.length > 4) {
    throw new ValidationError("El horario necesita entre 1 y 4 bloques.");
  }
  for (const slot of slots) {
    if (!HORA_RE.test(slot.horaLocal)) {
      throw new ValidationError(`Hora inválida: ${slot.horaLocal} (formato HH:MM).`);
    }
    if (slot.diaSemana < 0 || slot.diaSemana > 6) {
      throw new ValidationError("diaSemana debe estar entre 0 (domingo) y 6 (sábado).");
    }
  }
  const claves = new Set(slots.map((s) => `${s.diaSemana}-${s.horaLocal}`));
  if (claves.size !== slots.length) {
    throw new ValidationError("Hay bloques duplicados (mismo día y hora).");
  }
}

/** Crea un horario reutilizable del catálogo, para un tipo de curso y grupo de país. */
export async function crearHorario(input: {
  actorUserId: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  grupoPais: "01" | "02";
  salonNumero: string;
  etiqueta: string;
  orden?: number | undefined;
  slots: HorarioSlotInput[];
  ip?: string | null;
}): Promise<{ id: string }> {
  if (input.etiqueta.trim().length < 2) {
    throw new ValidationError("La etiqueta del horario es obligatoria (mínimo 2 caracteres).");
  }
  validarSlots(input.slots);
  if (
    await existsHorarioEtiqueta(
      input.tipoCurso,
      input.grupoPais,
      input.salonNumero,
      input.etiqueta,
    )
  ) {
    throw new ConflictError(
      `Ya existe un horario "${input.etiqueta.trim()}" para ${input.tipoCurso} · Salón ${input.salonNumero} en ${GRUPOS_PAIS[input.grupoPais]}.`,
    );
  }

  const id = await withTransaction((tx) =>
    insertHorarioCatalogo(tx, {
      tipoCurso: input.tipoCurso,
      grupoPais: input.grupoPais,
      salonNumero: input.salonNumero,
      etiqueta: input.etiqueta,
      orden: input.orden ?? 0,
      slots: input.slots,
    }),
  );

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.horario_creado",
    entidad: "scheduling_horario",
    entidadId: id,
    payload: {
      tipoCurso: input.tipoCurso,
      grupoPais: input.grupoPais,
      salonNumero: input.salonNumero,
      etiqueta: input.etiqueta.trim(),
      slots: input.slots.length,
    },
    ip: input.ip ?? null,
  });
  return { id };
}

/** Edita un horario del catálogo (etiqueta, grupo, curso y bloques). No afecta
 * salones ya creados: el catálogo solo alimenta el selector. */
export async function actualizarHorario(input: {
  actorUserId: string;
  horarioId: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  grupoPais: "01" | "02";
  salonNumero: string;
  etiqueta: string;
  orden?: number | undefined;
  slots: HorarioSlotInput[];
  ip?: string | null;
}): Promise<void> {
  const horario = await getHorarioCatalogo(input.horarioId);
  if (horario === null) throw new NotFoundError("El horario no existe.");
  if (input.etiqueta.trim().length < 2) {
    throw new ValidationError("La etiqueta del horario es obligatoria (mínimo 2 caracteres).");
  }
  validarSlots(input.slots);
  if (
    await existsHorarioEtiqueta(
      input.tipoCurso,
      input.grupoPais,
      input.salonNumero,
      input.etiqueta,
      input.horarioId,
    )
  ) {
    throw new ConflictError(
      `Ya existe un horario "${input.etiqueta.trim()}" para ${input.tipoCurso} · Salón ${input.salonNumero} en ${GRUPOS_PAIS[input.grupoPais]}.`,
    );
  }

  await withTransaction((tx) =>
    updateHorarioCatalogo(tx, {
      id: input.horarioId,
      tipoCurso: input.tipoCurso,
      grupoPais: input.grupoPais,
      salonNumero: input.salonNumero,
      etiqueta: input.etiqueta,
      orden: input.orden ?? horario.orden,
      slots: input.slots,
    }),
  );

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.horario_editado",
    entidad: "scheduling_horario",
    entidadId: input.horarioId,
    payload: {
      tipoCurso: input.tipoCurso,
      grupoPais: input.grupoPais,
      salonNumero: input.salonNumero,
      etiqueta: input.etiqueta.trim(),
      slots: input.slots.length,
    },
    ip: input.ip ?? null,
  });
}

export async function listarHorarios(filtros?: {
  tipoCurso?: string | undefined;
  grupoPais?: string | undefined;
  soloActivos?: boolean | undefined;
}): Promise<HorarioCatalogoRecord[]> {
  return listHorariosCatalogo(filtros);
}

/** Elimina un horario del catálogo (borrado real; sus bloques caen por cascada).
 * No afecta salones ya creados: el catálogo solo alimenta el selector. */
export async function eliminarHorario(input: {
  actorUserId: string;
  horarioId: string;
  ip?: string | null;
}): Promise<void> {
  const horario = await getHorarioCatalogo(input.horarioId);
  if (horario === null) throw new NotFoundError("El horario no existe.");
  await deleteHorarioCatalogo(input.horarioId);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.horario_eliminado",
    entidad: "scheduling_horario",
    entidadId: input.horarioId,
    payload: {
      tipoCurso: horario.tipoCurso,
      grupoPais: horario.grupoPais,
      salonNumero: horario.salonNumero,
      etiqueta: horario.etiqueta,
    },
    ip: input.ip ?? null,
  });
}

/** Activa/desactiva un horario del catálogo (desactivar no borra ni mueve nada). */
export async function cambiarActivoHorario(input: {
  actorUserId: string;
  horarioId: string;
  activo: boolean;
  ip?: string | null;
}): Promise<void> {
  const horario = await getHorarioCatalogo(input.horarioId);
  if (horario === null) throw new NotFoundError("El horario no existe.");
  await setHorarioActivo(input.horarioId, input.activo);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: input.activo ? "scheduling.horario_activado" : "scheduling.horario_desactivado",
    entidad: "scheduling_horario",
    entidadId: input.horarioId,
    payload: { etiqueta: horario.etiqueta },
    ip: input.ip ?? null,
  });
}
