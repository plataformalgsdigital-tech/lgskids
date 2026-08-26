import { PERMISOS, getAccessProfile } from "@/modules/access";
import { agendaProximas, historialAsistencia, resumenAsistencia } from "@/modules/attendance";
import { imagenCursoId } from "@/modules/catalog";
import { matriculaDeNino } from "@/modules/enrollment";
import { bootstrapIdentity } from "@/modules/identity";
import { findPersonByUserId } from "@/modules/people";
import { progresoDeNino } from "@/modules/progression";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Panel del ALUMNO: todo se deriva del usuario logueado (auth.userId) — un
 * niño solo ve SUS datos. Compone people + enrollment + attendance +
 * progression en la capa app (sin acoplar módulos entre sí).
 */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);

  const persona = await findPersonByUserId(auth.userId);
  if (persona === null) {
    return json({ alumno: null, matricula: null });
  }

  const matricula = await matriculaDeNino(persona.id);
  if (matricula === null) {
    return json({
      alumno: { nombre: `${persona.nombres} ${persona.apellidos}` },
      matricula: null,
    });
  }

  const [asistencia, agenda, progreso, historial] = await Promise.all([
    resumenAsistencia(persona.id, matricula.classroomId),
    agendaProximas(matricula.classroomId, 8),
    progresoDeNino(persona.id),
    historialAsistencia(persona.id, matricula.classroomId, 30),
  ]);

  // Imagen de portada del curso según el nivel actual (o el primero no completado).
  const nivelActual =
    progreso.niveles.find((n) => n.estado === "EN_CURSO") ??
    progreso.niveles.find((n) => n.estado !== "COMPLETADO") ??
    progreso.niveles[0];
  const imgId =
    nivelActual !== undefined ? await imagenCursoId(matricula.tipoCurso, nivelActual.codigo) : null;

  return json({
    alumno: { nombre: `${persona.nombres} ${persona.apellidos}` },
    matricula,
    asistencia,
    proxima: agenda[0] ?? null,
    agenda,
    progreso,
    historial,
    imagenCursoUrl: imgId !== null ? `/api/catalog/imagen-curso/${imgId}` : null,
  });
});
