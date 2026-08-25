import { registrarAuditoria } from "@/modules/audit";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { getCampaignHeader, updateCampaignFechas } from "../infrastructure/catalog-repository";

/**
 * Edita la vigencia (fin, los 12 meses) y/o el cierre de matrícula
 * (final_venta) de una campaña. NO toca `final_curso` de los cursos (regla
 * dura 1): las sesiones ya generadas no cambian. Solo afecta el estado
 * derivado y la ventana de venta.
 */
export async function actualizarFechasCampania(input: {
  actorUserId: string;
  campaignId: string;
  fin?: string | undefined;
  finalVenta?: string | undefined;
  ip?: string | null;
}): Promise<void> {
  const header = await getCampaignHeader(input.campaignId);
  if (header === null) throw new NotFoundError("La campaña no existe.");

  const fin = input.fin ?? header.fin;
  const finalVenta = input.finalVenta ?? header.finalVenta;
  if (fin <= finalVenta) {
    throw new ValidationError("El fin de la campaña debe ser posterior al cierre de matrícula.");
  }

  await updateCampaignFechas(input.campaignId, { fin, finalVenta });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.campania_editada",
    entidad: "catalog_campaign",
    entidadId: input.campaignId,
    payload: { fin, finalVenta },
    ip: input.ip ?? null,
  });
}
