import { PERMISOS, getAccessProfile } from "@/modules/access";
import { agendaProximas, historialAsistencia, resumenAsistencia } from "@/modules/attendance";
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

  return json({
    alumno: { nombre: `${persona.nombres} ${persona.apellidos}` },
    matricula,
    asistencia,
    proxima: agenda[0] ?? null,
    agenda,
    progreso,
    historial,
  });
});
