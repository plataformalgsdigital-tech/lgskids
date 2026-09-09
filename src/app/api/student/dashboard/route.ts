import { PERMISOS, getAccessProfile } from "@/modules/access";
import {
  agendaProximas,
  comentariosDeGuia,
  historialAsistencia,
  resumenAsistencia,
} from "@/modules/attendance";
import {
  NIVEL_TODOS,
  getHotspotsCurso,
  imagenCursoId,
  imagenCursoIdResuelto,
  mapaCursoId,
  premioNivelId,
  voboId,
} from "@/modules/catalog";
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

  const [asistencia, agenda, progreso, historial, comentarios] = await Promise.all([
    resumenAsistencia(persona.id, matricula.classroomId),
    agendaProximas(matricula.classroomId, 14), // próximas 2 semanas (incluye clubes/talleres)
    progresoDeNino(persona.id),
    historialAsistencia(persona.id, matricula.classroomId, 30),
    // Solo el comentario PARA EL ALUMNO; la nota privada del guía no sale de aquí.
    comentariosDeGuia(persona.id, 20),
  ]);

  // Imagen de portada del curso según el nivel actual (o el primero no completado).
  // Si el nivel no tiene imagen propia, cae a la imagen de TODO el curso (respaldo).
  const nivelActual =
    progreso.niveles.find((n) => n.estado === "EN_CURSO") ??
    progreso.niveles.find((n) => n.estado !== "COMPLETADO") ??
    progreso.niveles[0];

  // Arte curricular: banner del nivel actual + premios/mapas/vobo para "¿Cómo voy?" y "Avance".
  const niveles = progreso.niveles;
  const url = (id: string | null) => (id !== null ? `/api/catalog/imagen-curso/${id}` : null);
  const [imgId, premioIds, bannerIds, mapaId, vId, hotspots] = await Promise.all([
    imagenCursoIdResuelto(matricula.tipoCurso, nivelActual?.codigo ?? NIVEL_TODOS),
    Promise.all(niveles.map((n) => premioNivelId(matricula.tipoCurso, n.codigo))),
    Promise.all(niveles.map((n) => imagenCursoId(matricula.tipoCurso, n.codigo))),
    mapaCursoId(matricula.tipoCurso),
    voboId(),
    getHotspotsCurso(matricula.tipoCurso),
  ]);
  const premios = Object.fromEntries(niveles.map((n, i) => [n.codigo, url(premioIds[i] ?? null)]));
  const bannersNivel = Object.fromEntries(
    niveles.map((n, i) => [n.codigo, url(bannerIds[i] ?? null)]),
  );

  return json({
    alumno: { nombre: `${persona.nombres} ${persona.apellidos}` },
    matricula,
    asistencia,
    proxima: agenda[0] ?? null,
    proximoEvento: agenda.find((e) => e.esEvento) ?? null,
    agenda,
    progreso,
    historial,
    comentarios, // lo que el guía le escribió, del más reciente al más antiguo
    imagenCursoUrl: url(imgId),
    premios, // { [nivelCodigo]: url | null }  → íconos de "¿Cómo voy?"
    bannersNivel, // { [nivelCodigo]: url | null } → mapas de isla en "Avance"
    mapaCursoUrl: url(mapaId), // mapa del curso completo (todas las islas)
    voboUrl: url(vId), // sello "VoBo"
    hotspots, // { isla: {nivel: {unidades,premio}}, mapa: {nivel: {unidades,centro}} }
  });
});
