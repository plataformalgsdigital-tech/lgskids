import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import {
  existsHorarioEtiqueta,
  getHorarioCatalogo,
  insertHorarioCatalogo,
  listHorariosCatalogo,
  setHorarioActivo,
  type HorarioCatalogoRecord,
  type HorarioSlotInput,
} from "../infrastructure/scheduling-repository";

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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

/** Crea un horario reutilizable del catálogo, para un tipo de curso. */
export async function crearHorario(input: {
  actorUserId: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  etiqueta: string;
  orden?: number | undefined;
  slots: HorarioSlotInput[];
  ip?: string | null;
}): Promise<{ id: string }> {
  if (input.etiqueta.trim().length < 2) {
    throw new ValidationError("La etiqueta del horario es obligatoria (mínimo 2 caracteres).");
  }
  validarSlots(input.slots);
  if (await existsHorarioEtiqueta(input.tipoCurso, input.etiqueta)) {
    throw new ConflictError(
      `Ya existe un horario "${input.etiqueta.trim()}" para ${input.tipoCurso}.`,
    );
  }

  const id = await withTransaction((tx) =>
    insertHorarioCatalogo(tx, {
      tipoCurso: input.tipoCurso,
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
    payload: { tipoCurso: input.tipoCurso, etiqueta: input.etiqueta.trim(), slots: input.slots.length },
    ip: input.ip ?? null,
  });
  return { id };
}

export async function listarHorarios(filtros?: {
  tipoCurso?: string | undefined;
  soloActivos?: boolean | undefined;
}): Promise<HorarioCatalogoRecord[]> {
  return listHorariosCatalogo(filtros);
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
