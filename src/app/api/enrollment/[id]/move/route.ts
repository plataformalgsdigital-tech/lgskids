import type { NextRequest } from "next/server";
import { sincronizarUbicacionConLgs } from "@/modules/contracts";
import { cambioAcademicoHandler } from "@/modules/enrollment";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

/**
 * Cambio académico (otro salón). Si el contrato viene de LGS, al terminar se le
 * avisa a LGS el salón nuevo (best-effort: nunca revierte el cambio en KIDS).
 * El aviso vive aquí y no en el módulo enrollment para no crear un ciclo
 * enrollment → contracts (contracts ya depende de enrollment).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) {
  const res = await cambioAcademicoHandler(request, context);
  if (res.ok) {
    const body = (await res
      .clone()
      .json()
      .catch(() => null)) as { contractId?: string } | null;
    if (body?.contractId) await sincronizarUbicacionConLgs(body.contractId, "cambio de salón");
  }
  return res;
}
