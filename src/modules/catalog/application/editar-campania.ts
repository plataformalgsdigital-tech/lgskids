import { registrarAuditoria } from "@/modules/audit";
import { eliminarSalonesDeCampaniaTx, matriculasDeCampania } from "@/modules/scheduling";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import {
  campaignExisteNombre,
  deleteCampaign,
  getCampaignHeader,
  updateCampaign,
} from "../infrastructure/catalog-repository";

/**
 * Edita la FILA de la campaña: nombre, inicio comercial, fin (vigencia) y
 * cierre de ventas.
 *
 * NO toca la ventana del programa (`catalog_course.inicio`/`final_curso`), que
 * es la que genera sesiones. Eso lo mueve `moverFinDePrograma` de `scheduling`,
 * que enseña el previo y se bloquea si hay historia. Separarlos es a propósito:
 * corregir un nombre no puede regenerar el calendario de doce salones.
 */
export async function actualizarFechasCampania(input: {
  actorUserId: string;
  campaignId: string;
  nombre?: string | undefined;
  inicio?: string | undefined;
  fin?: string | undefined;
  finalVenta?: string | undefined;
  ip?: string | null;
}): Promise<void> {
  const header = await getCampaignHeader(input.campaignId);
  if (header === null) throw new NotFoundError("La campaña no existe.");

  const nombre = (input.nombre ?? header.nombre).trim();
  const inicio = input.inicio ?? header.inicio;
  const fin = input.fin ?? header.fin;
  const finalVenta = input.finalVenta ?? header.finalVenta;

  if (nombre.length < 3 || nombre.length > 80) {
    throw new ValidationError("El nombre de la campaña debe tener entre 3 y 80 caracteres.");
  }
  if (await campaignExisteNombre(nombre, input.campaignId)) {
    throw new ConflictError(`Ya hay otra campaña llamada "${nombre}".`);
  }
  if (fin <= finalVenta) {
    throw new ValidationError("El fin de la campaña debe ser posterior al cierre de ventas.");
  }
  if (inicio >= fin) {
    throw new ValidationError("El inicio de la campaña debe ser anterior a su fin.");
  }

  await updateCampaign(input.campaignId, { nombre, inicio, fin, finalVenta });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.campania_editada",
    entidad: "catalog_campaign",
    entidadId: input.campaignId,
    payload: { nombre, inicio, fin, finalVenta },
    ip: input.ip ?? null,
  });
}

/**
 * ELIMINA la campaña con todo lo suyo: cursos, niveles, lecciones y
 * cuestionarios (por cascada) y sus SALONES con sus sesiones.
 *
 * Se BLOQUEA si algún salón tiene matrículas, vivas o históricas: ahí hay niños
 * con contrato, progreso y asistencia colgando. Para cerrar una campaña sin
 * borrarla basta con dejar pasar su fin — el estado se deriva de la fecha.
 *
 * Los salones se borran DENTRO de la misma transacción, y a propósito: la tabla
 * `scheduling_classroom` no tiene clave foránea contra `catalog_course`, así que
 * borrar la campaña sola los dejaría apuntando a un curso inexistente, con su
 * pantalla fallando sin explicación. La matrícula la protege además la base
 * (`ON DELETE RESTRICT`), pero el aviso se da antes de intentarlo.
 */
export async function eliminarCampania(input: {
  actorUserId: string;
  campaignId: string;
  ip?: string | null;
}): Promise<{ salones: number }> {
  const header = await getCampaignHeader(input.campaignId);
  if (header === null) throw new NotFoundError("La campaña no existe.");

  const matriculas = await matriculasDeCampania(input.campaignId);
  if (matriculas > 0) {
    throw new ConflictError(
      `No se puede eliminar "${header.nombre}": sus salones tienen ${String(matriculas)} matrícula(s). Hay niños con contrato y progreso colgando de ella. Para cerrarla, deja pasar su fin: el estado se deriva de la fecha.`,
    );
  }

  const salones = await withTransaction(async (tx) => {
    const borrados = await eliminarSalonesDeCampaniaTx(tx, input.campaignId);
    await deleteCampaign(input.campaignId, tx);
    return borrados;
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.campania_eliminada",
    entidad: "catalog_campaign",
    entidadId: input.campaignId,
    payload: { nombre: header.nombre, salones },
    ip: input.ip ?? null,
  });
  return { salones };
}
