import { PERMISOS, getAccessProfile } from "@/modules/access";
import { listarCampanias } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import {
  clasesDeHoy,
  contratosPorPais,
  ocupacionSalones,
  resumenGuia,
  resumenTablero,
  salonesSinGuia,
  sesionesSinMarcar,
} from "@/modules/reporting";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * TABLERO del panel (administración y guía). El alumno NO lo tiene.
 *
 * Cada bloque se pide solo si el perfil tiene el permiso que lo cubre, así que
 * la respuesta ya viene recortada por rol: la pantalla no esconde datos que
 * igualmente viajaron. Las campañas son el bloque común — las ve cualquiera
 * que entre al tablero.
 */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_TABLERO);

  const puede = (code: string) => profile.hasPermission(code);
  // Un administrador también tiene panel.guia, así que ese permiso no
  // distingue. Lo que separa al guía PURO de coordinación es GESTIONAR
  // salones: `salones.ver` lo tiene también el guía —lo necesita para su
  // calendario—, y usarlo aquí le mostraba el tablero de toda la plataforma.
  const esGuia = puede(PERMISOS.PANEL_GUIA);
  const gestionaSalones = puede(PERMISOS.SALONES_GESTIONAR);
  const verContratos = puede(PERMISOS.CONTRATOS_VER);
  const verReportes = puede(PERMISOS.REPORTES_VER);

  // Bloque común: el estado de las campañas se deriva por fecha, nunca se guarda.
  const campanias = await listarCampanias();

  const esSoloGuia = esGuia && !gestionaSalones;

  const [resumen, sinGuia, ocupacion, contratos, guia, hoy, sinMarcar] = await Promise.all([
    gestionaSalones ? resumenTablero() : Promise.resolve(null),
    gestionaSalones ? salonesSinGuia(6) : Promise.resolve([]),
    verReportes ? ocupacionSalones() : Promise.resolve([]),
    verContratos ? contratosPorPais(profile.countryScope) : Promise.resolve([]),
    esSoloGuia ? resumenGuia(auth.userId) : Promise.resolve(null),
    clasesDeHoy(esSoloGuia ? auth.userId : null, 8),
    sesionesSinMarcar(esSoloGuia ? auth.userId : null, 14, 6),
  ]);

  return json({
    esGuia: esSoloGuia,
    campanias,
    resumen,
    salonesSinGuia: sinGuia,
    ocupacion: ocupacion.slice(0, 8),
    contratos,
    guia,
    clasesDeHoy: hoy,
    sesionesSinMarcar: sinMarcar,
  });
});
