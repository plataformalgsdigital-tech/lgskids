import { searchContracts } from "../infrastructure/contract-repository";

/**
 * Ficha del ESTUDIANTE para Gestión de Usuarios: el niño con sus contratos y
 * su cuenta. En KIDS la cuenta del alumno NO se crea a mano: nace al aprobar
 * su contrato (alta única, regla 5) y se reactiva al aprobar una renovación.
 * Por eso esta vista busca al niño y dice en qué punto está su cuenta; la
 * acción que corresponde (aprobar el contrato) es la del alta única.
 */
export interface EstudianteEncontrado {
  personaId: string;
  nombre: string;
  docTipo: string;
  docNumero: string;
  fechaNacimiento: string | null;
  personaEstado: string;
  cuenta: { userId: string; username: string; estado: string } | null;
  apoderados: { nombre: string; telefono: string | null; parentesco: string | null }[];
  contratos: {
    id: string;
    numero: number;
    externalRef: string | null;
    estado: string;
    countryCode: string;
    tipoCurso: string;
    inicio: string;
    finalContrato: string;
    titular: string;
    titularEmail: string | null;
    titularTelefono: string | null;
    salon: string | null;
    campania: string | null;
  }[];
}

/** Busca por N° de contrato o LGS, documento, nombre o usuario (con alcance por país). */
export async function buscarEstudiantes(params: {
  q: string;
  countryScope: string[] | null;
}): Promise<EstudianteEncontrado[]> {
  const q = params.q.trim();
  if (q.length < 2) return [];
  const filas = await searchContracts({ q, countryScope: params.countryScope, limit: 50 });

  const porNino = new Map<string, EstudianteEncontrado>();
  for (const f of filas) {
    let e = porNino.get(f.beneficiarioId);
    if (e === undefined) {
      e = {
        personaId: f.beneficiarioId,
        nombre: f.beneficiario,
        docTipo: f.beneficiarioDocTipo,
        docNumero: f.beneficiarioDocNumero,
        fechaNacimiento: f.beneficiarioFechaNac,
        personaEstado: f.beneficiarioEstado,
        cuenta:
          f.userId !== null && f.username !== null
            ? { userId: f.userId, username: f.username, estado: f.cuentaEstado ?? "" }
            : null,
        apoderados: f.apoderados.map((a) => ({
          nombre: a.nombre,
          telefono: a.telefono,
          parentesco: a.parentesco,
        })),
        contratos: [],
      };
      porNino.set(f.beneficiarioId, e);
    }
    e.contratos.push({
      id: f.id,
      numero: f.numero,
      externalRef: f.externalRef,
      estado: f.estado,
      countryCode: f.countryCode,
      tipoCurso: f.tipoCurso,
      inicio: f.inicio,
      finalContrato: f.finalContrato,
      titular: f.titular,
      titularEmail: f.titularEmail,
      titularTelefono: f.titularTelefono,
      salon: f.salon,
      campania: f.campania,
    });
  }
  return [...porNino.values()];
}
