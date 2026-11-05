import { listarGuiasLgs, type GuiaLgsRow } from "../infrastructure/guias-lgs-repository";

export type GuiaLgs = GuiaLgsRow;

/**
 * Guías para LGS (cuenta + ficha). LGS los trae periódicamente y, cuando un
 * guía falla al entrar allá, pide solo el suyo (`usuario`) para tomar una
 * clave recién cambiada aquí. Solo lectura. KIDS es la fuente de la cuenta.
 */
export async function guiasParaLgs(usuario: string | null): Promise<{ guias: GuiaLgs[] }> {
  const u = (usuario ?? "").trim();
  return { guias: await listarGuiasLgs(u === "" ? null : u.slice(0, 200)) };
}
