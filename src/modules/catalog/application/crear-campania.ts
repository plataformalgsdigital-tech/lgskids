import { registrarAuditoria } from "@/modules/audit";
import { ConflictError } from "@/platform/errors";
import { withTransaction } from "@/platform/db/transaction";
import { newId } from "@/platform/ids";
import { planificarCampania } from "../domain/campania";
import { LECCIONES_POR_NIVEL, NIVELES, TIPOS_CURSO } from "../domain/curriculo";
import type { CampaignGraph } from "./ports";
import { campaignNombreExists, insertCampaignGraph } from "../infrastructure/catalog-repository";

/**
 * Crea una campaña COMPLETA en una sola transacción (sección 2.2):
 * campaña → curso JUNIOR + curso YOUNGSTER → 4 niveles c/u →
 * 4 lecciones por nivel con cuestionario de práctica + Level Up por nivel.
 *
 * No existe otro camino que cree cursos/niveles/lecciones: la estructura
 * nace entera o no nace (misma filosofía que el alta única de alumno).
 */
export async function crearCampania(input: {
  actorUserId: string;
  nombre: string;
  inicio: string; // YYYY-MM-DD (inicio de campaña)
  cursoInicio: string; // YYYY-MM-DD (inicio del curso)
  fin?: string | undefined; // editable; por defecto inicio + 12 meses
  ip?: string | null;
}): Promise<{ id: string; nombre: string; inicio: string; fin: string; finalVenta: string }> {
  const plan = planificarCampania(input);

  if (await campaignNombreExists(plan.nombre)) {
    throw new ConflictError(`Ya existe una campaña llamada "${plan.nombre}".`);
  }

  const graph: CampaignGraph = {
    campaign: {
      id: newId(),
      nombre: plan.nombre,
      inicio: plan.inicio,
      fin: plan.fin,
      finalVenta: plan.finalVenta,
    },
    courses: TIPOS_CURSO.map((tc) => ({
      id: newId(),
      tipo: tc.tipo,
      // El curso arranca en su propia fecha; las sesiones corren hasta el fin.
      inicio: plan.cursoInicio,
      // final_curso NOMINAL = fin de campaña. NUNCA se reescribe (regla 1).
      finalCurso: plan.fin,
      levels: NIVELES.map((nivel) => ({
        id: newId(),
        codigo: nivel.codigo,
        nombre: nivel.nombre,
        orden: nivel.orden,
        duracionMeses: nivel.duracionMeses,
        lessons: Array.from({ length: LECCIONES_POR_NIVEL }, (_, i) => ({
          id: newId(),
          orden: i + 1,
          titulo: `Lección ${i + 1}`,
          quizPracticaId: newId(),
        })),
        quizLevelUpId: newId(),
      })),
    })),
  };

  await withTransaction((tx) => insertCampaignGraph(tx, graph));

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.campania_creada",
    entidad: "catalog_campaign",
    entidadId: graph.campaign.id,
    payload: {
      nombre: plan.nombre,
      inicio: plan.inicio,
      fin: plan.fin,
      cursoInicio: plan.cursoInicio,
      finalVenta: plan.finalVenta,
      cursos: graph.courses.length,
    },
    ip: input.ip ?? null,
  });

  return {
    id: graph.campaign.id,
    nombre: plan.nombre,
    inicio: plan.inicio,
    fin: plan.fin,
    finalVenta: plan.finalVenta,
  };
}
