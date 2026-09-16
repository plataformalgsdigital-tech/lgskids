import { PERMISOS, getAccessProfile } from "@/modules/access";
import { leerLibro, listarLibros } from "@/modules/catalog";
import { matriculaDeNino } from "@/modules/enrollment";
import { bootstrapIdentity } from "@/modules/identity";
import { findPersonByUserId } from "@/modules/people";
import { progresoDeNino } from "@/modules/progression";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET /api/student/libro[?codigo=UNIT%200-1][&nivel=ROOKIE]
 *
 * El libro del NIÑO LOGUEADO. Igual que el dashboard, TODO se deriva del
 * usuario de la sesión (regla 9: datos de menores): el curso sale de su
 * matrícula y los niveles de su progresión, nunca de la query. Un niño solo
 * puede abrir SU libro aunque escriba otra cosa en la URL.
 *
 * Devuelve los cuadernillos del nivel EN CURSO **y los de los ya completados**:
 * terminar Rookie no puede quitarle el cuadernillo de Rookie —lo trabajó, es
 * suyo y va a querer volver—. Lo que NO se abre es el de un nivel al que
 * todavía no ha llegado.
 *
 * Sin `codigo` devuelve la lista; con `codigo`, las páginas. `nivel` solo
 * elige entre los que ya alcanzó: si pide otro, se rechaza.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);

  const persona = await findPersonByUserId(auth.userId);
  if (persona === null) throw new NotFoundError("No encontramos tu ficha.");

  const matricula = await matriculaDeNino(persona.id);
  if (matricula === null) throw new NotFoundError("No tienes una matrícula activa.");
  const curso = matricula.tipoCurso;

  // El mismo criterio de nivel que el dashboard, para que el libro y el banner
  // no discrepen: el que está EN_CURSO, si no el primero sin completar.
  const progreso = await progresoDeNino(persona.id);
  const actual =
    (
      progreso.niveles.find((n) => n.estado === "EN_CURSO") ??
      progreso.niveles.find((n) => n.estado !== "COMPLETADO") ??
      progreso.niveles[0]
    )?.codigo ?? "ROOKIE";

  // Alcanzados = hasta el actual inclusive. `niveles` viene en orden de
  // currículo, así que el corte es posicional y no hay que reordenar.
  const iActual = progreso.niveles.findIndex((n) => n.codigo === actual);
  const alcanzados = (
    iActual >= 0 ? progreso.niveles.slice(0, iActual + 1) : progreso.niveles.slice(0, 1)
  ).map((n) => n.codigo);

  const q = new URL(request.url).searchParams;
  const codigo = q.get("codigo");

  if (codigo === null) {
    const porNivel = await Promise.all(
      alcanzados.map(async (nivel) =>
        (await listarLibros(curso, nivel)).map((l) => ({ ...l, nivel, actual: nivel === actual })),
      ),
    );
    // El del nivel en curso primero: es el que el niño está trabajando.
    const libros = porNivel.flat().sort((a, b) => Number(b.actual) - Number(a.actual));
    return json({ curso, nivel: actual, niveles: alcanzados, libros });
  }

  const pedido = q.get("nivel") ?? actual;
  if (!alcanzados.includes(pedido)) {
    throw new ValidationError("Ese cuadernillo todavía no está en tu recorrido.");
  }
  return json({ curso, nivel: pedido, ...(await leerLibro(curso, pedido, codigo)) });
});
