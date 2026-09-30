/**
 * ¿EL NIÑO ESTÁ CURSANDO EL PROGRAMA?
 *
 * Es la pregunta que hace LGS ("¿este usuario está tomando el programa?") y la
 * que la sección Kids necesita decir en una palabra. Hoy la respuesta está
 * repartida en tres sitios —el estado del contrato, si venció y si tiene
 * matrícula viva— y cada pantalla la reconstruía a su manera.
 *
 * Se DERIVA, no se guarda (decisión del negocio, 2026-09-30). Una columna
 * `activo` escrita a mano diría ACTIVO con el contrato ya vencido en cuanto
 * alguien se olvidara de apagarla, y es justo la desincronización que el resto
 * de la plataforma evita: el estado de campaña y la lista del salón tampoco se
 * almacenan.
 *
 * El MOTIVO importa tanto como el sí/no: "inactivo" a secas obliga a quien
 * pregunta a abrir el panel para saber si hay que renovar, reactivar o
 * matricular.
 */

export type MotivoInactivo =
  | "SIN_CONTRATO"
  | "CONTRATO_PENDIENTE"
  | "CONTRATO_EN_PAUSA"
  | "CONTRATO_INACTIVO"
  | "CONTRATO_VENCIDO"
  | "SIN_MATRICULA"
  | "RESERVA_SIN_APROBAR";

/**
 * Las TRES situaciones que LGS muestra en la ficha de su beneficiario
 * ("KIDS: Cursando / Suspendido / No cursando"), pedidas por el negocio
 * (2026-09-30).
 *
 * Se entregan YA clasificadas para que LGS no tenga que interpretar los
 * motivos: si cada sistema mapeara `motivo` a su manera, un día LGS diría
 * "Suspendido" de un contrato vencido. La regla vive aquí, una vez.
 *
 * SUSPENDIDO es solo la PAUSA: es lo único que vuelve solo al reactivarse. Todo
 * lo demás —vencido, inactivo, sin salón, sin aprobar— es NO_CURSANDO, y el
 * `motivo` dice cuál.
 */
export type SituacionAcademica = "CURSANDO" | "SUSPENDIDO" | "NO_CURSANDO";

export interface EstadoAcademico {
  activo: boolean;
  estado: "ACTIVO" | "INACTIVO";
  situacion: SituacionAcademica;
  motivo: MotivoInactivo | null;
  /** Frase lista para mostrar o para que LGS la repita tal cual. */
  detalle: string;
}

const DETALLE: Record<MotivoInactivo, string> = {
  SIN_CONTRATO: "No tiene contrato en KIDS.",
  CONTRATO_PENDIENTE: "Su contrato está pendiente de aprobar.",
  CONTRATO_EN_PAUSA: "Su contrato está en pausa.",
  CONTRATO_INACTIVO: "Su contrato está inactivo.",
  CONTRATO_VENCIDO: "Su contrato venció.",
  SIN_MATRICULA: "Aprobado pero sin salón asignado.",
  RESERVA_SIN_APROBAR: "Reservó cupo, falta aprobar su contrato.",
};

const inactivo = (motivo: MotivoInactivo): EstadoAcademico => ({
  activo: false,
  estado: "INACTIVO",
  situacion: motivo === "CONTRATO_EN_PAUSA" ? "SUSPENDIDO" : "NO_CURSANDO",
  motivo,
  detalle: DETALLE[motivo],
});

/**
 * ACTIVO = contrato APROBADO y no vencido + matrícula ACTIVA en un salón.
 *
 * Un niño matriculado en un curso que todavía no empieza cuenta como ACTIVO:
 * ya está tomando el programa desde el punto de vista de quien lo vendió, y
 * decir "inactivo" haría pensar que algo salió mal.
 */
export function estadoAcademico(datos: {
  /** Estado del contrato más reciente del niño; null si no tiene ninguno. */
  contratoEstado: "PENDIENTE" | "APROBADO" | "ONHOLD" | "INACTIVO" | null;
  /** ¿Pasó su fin + los días de gracia? (lo decide `contratoVencido`). */
  vencido: boolean;
  /** Estado de su matrícula viva; null si no tiene. */
  matriculaEstado: "ACTIVA" | "RESERVADA" | null;
}): EstadoAcademico {
  if (datos.contratoEstado === null) return inactivo("SIN_CONTRATO");
  if (datos.contratoEstado === "INACTIVO") return inactivo("CONTRATO_INACTIVO");
  if (datos.contratoEstado === "ONHOLD") return inactivo("CONTRATO_EN_PAUSA");
  if (datos.contratoEstado === "PENDIENTE") {
    // La reserva de LGS ya tomó cupo: se distingue de un contrato del panel
    // sin aprobar, porque lo que falta hacer es distinto.
    return inactivo(
      datos.matriculaEstado === "RESERVADA" ? "RESERVA_SIN_APROBAR" : "CONTRATO_PENDIENTE",
    );
  }
  // APROBADO: vencer manda sobre todo lo demás.
  if (datos.vencido) return inactivo("CONTRATO_VENCIDO");
  if (datos.matriculaEstado !== "ACTIVA") return inactivo("SIN_MATRICULA");
  return {
    activo: true,
    estado: "ACTIVO",
    situacion: "CURSANDO",
    motivo: null,
    detalle: "Cursando el programa.",
  };
}
