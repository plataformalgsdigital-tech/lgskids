import { fichaContratoHandler } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

/** Ficha del contrato: titular, beneficiario y los hermanos del mismo N° de LGS. */
export const GET = fichaContratoHandler;
