import { matriculaDeNino } from "@/modules/enrollment";
import { findPersonByUserId } from "@/modules/people";
import { progresoDeNino } from "@/modules/progression";
import { NotFoundError } from "@/platform/errors";

export interface AlcanceAlumno {
  personaId: string;
  curso: string;
  /** El nivel que está trabajando. */
  actual: string;
  /** El actual y los ya completados, en orden de currículo. */
  alcanzados: string[];
}

/**
 * Qué material puede abrir el NIÑO LOGUEADO. Todo sale de su sesión (regla 9):
 * el curso, de su matrícula; los niveles, de su progresión. Nunca de la URL.
 *
 * Alcanzados = el nivel en curso **y los completados**: terminar Rookie no
 * puede quitarle el libro de Rookie —lo trabajó y va a querer volver—. Lo que
 * NO se abre es un nivel al que todavía no llegó.
 */
export async function alcanceDelAlumno(userId: string): Promise<AlcanceAlumno> {
  const persona = await findPersonByUserId(userId);
  if (persona === null) throw new NotFoundError("No encontramos tu ficha.");
  const matricula = await matriculaDeNino(persona.id);
  if (matricula === null) throw new NotFoundError("No tienes una matrícula activa.");

  // El mismo criterio de nivel que el dashboard, para que el material y el
  // banner no discrepen: el EN_CURSO, si no el primero sin completar.
  const progreso = await progresoDeNino(persona.id);
  const actual =
    (
      progreso.niveles.find((n) => n.estado === "EN_CURSO") ??
      progreso.niveles.find((n) => n.estado !== "COMPLETADO") ??
      progreso.niveles[0]
    )?.codigo ?? "ROOKIE";

  // `niveles` viene en orden de currículo: el corte es posicional.
  const iActual = progreso.niveles.findIndex((n) => n.codigo === actual);
  const alcanzados = (
    iActual >= 0 ? progreso.niveles.slice(0, iActual + 1) : progreso.niveles.slice(0, 1)
  ).map((n) => n.codigo);

  return { personaId: persona.id, curso: matricula.tipoCurso, actual, alcanzados };
}
