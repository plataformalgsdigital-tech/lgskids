/**
 * CASOS DE ATENCIÓN (2026-10-14) — las reglas puras.
 *
 * Réplica del proceso de MOSAICO (Servicio › Casos de Atención) ajustada a
 * KIDS: el guía REPORTA desde la sesión ("Requiere atención"), el reporte abre
 * un caso (o se suma a uno abierto), Servicio lo ASIGNA a un área, el área lo
 * gestiona —contactos con la familia, acuerdo, notas— y lo CIERRA con una
 * conclusión.
 *
 * Diferencias deliberadas con MOSAICO:
 *  - Áreas de KIDS: no hay Nivelación (aquí son los REFUERZOS, un estado de
 *    cierre) y Finanzas es la de LGS, que es quien cobra.
 *  - "Abierto" significa UNA sola cosa en todas partes: no estar en un estado
 *    que cierra (`cierraElCaso`). En MOSAICO unas consultas miraban solo
 *    EN_GESTION y otras los estados de cierre, y un caso asignado salía
 *    "cerrado" en la ficha y abierto en la bandeja.
 *  - Los contactos se registran mientras el caso esté abierto, asignado o no
 *    (MOSAICO exigía EN_GESTION y rechazaba los de un caso asignado).
 *  - Asignar NO toca `cerrado_*` (MOSAICO lo marcaba como cerrado al asignar).
 *  - La reincidencia se DERIVA por reglas al leer, sin IA ni columnas.
 */

export const TEMAS = ["ASISTENCIA", "CONDUCTA", "DESEMPENO", "SALUD", "PAGO", "OTRO"] as const;
export type Tema = (typeof TEMAS)[number];
export const ETIQUETA_TEMA: Record<Tema, string> = {
  ASISTENCIA: "Asistencia",
  CONDUCTA: "Conducta",
  DESEMPENO: "Desempeño",
  SALUD: "Salud",
  PAGO: "Pago",
  OTRO: "Otro",
};

/** A qué equipo le toca el caso. NULL = recién abierto, sin asignar. */
export const AREAS = ["ACADEMICO", "COORDINACION", "FINANZAS"] as const;
export type Area = (typeof AREAS)[number];
export const ETIQUETA_AREA: Record<Area, string> = {
  ACADEMICO: "Servicio Académico",
  COORDINACION: "Coordinación Académica",
  FINANZAS: "Finanzas (LGS)",
};

export const ESTADOS = [
  "EN_GESTION",
  "REMITIDO_ACADEMICO",
  "REMITIDO_COORDINACION",
  "REMITIDO_FINANZAS",
  "RESUELTO",
  "SALON_CAMBIADO",
  "CURSO_CAMBIADO",
  "PAUSA_ACTIVADA",
  "REFUERZO_AGENDADO",
  "SIN_CONTACTO",
] as const;
export type Estado = (typeof ESTADOS)[number];
export const ETIQUETA_ESTADO: Record<Estado, string> = {
  EN_GESTION: "En gestión",
  REMITIDO_ACADEMICO: "Servicio Académico",
  REMITIDO_COORDINACION: "Coordinación Académica",
  REMITIDO_FINANZAS: "Finanzas (LGS)",
  RESUELTO: "Cerrado",
  SALON_CAMBIADO: "Salón cambiado",
  CURSO_CAMBIADO: "Curso cambiado",
  PAUSA_ACTIVADA: "Pausa activada",
  REFUERZO_AGENDADO: "Refuerzo agendado",
  SIN_CONTACTO: "Sin poder contactar",
};

/** Los estados que CIERRAN el caso. Todo lo demás es "abierto". */
export const ESTADOS_QUE_CIERRAN: readonly Estado[] = [
  "RESUELTO",
  "SALON_CAMBIADO",
  "CURSO_CAMBIADO",
  "PAUSA_ACTIVADA",
  "REFUERZO_AGENDADO",
  "SIN_CONTACTO",
];

export function cierraElCaso(estado: Estado): boolean {
  return ESTADOS_QUE_CIERRAN.includes(estado);
}

/** El estado con que queda un caso al asignarlo a un área. */
export const ESTADO_AL_ASIGNAR: Record<Area, Estado> = {
  ACADEMICO: "REMITIDO_ACADEMICO",
  COORDINACION: "REMITIDO_COORDINACION",
  FINANZAS: "REMITIDO_FINANZAS",
};

/**
 * Con qué puede cerrar cada área (y "sin área", lo que cierra Servicio desde la
 * bandeja). Coordinación puede además derivar a Finanzas, como en MOSAICO.
 */
export const CIERRES_POR_AREA: Record<Area | "SIN_AREA", readonly Estado[]> = {
  SIN_AREA: ["RESUELTO", "SIN_CONTACTO"],
  ACADEMICO: ["RESUELTO", "SALON_CAMBIADO", "PAUSA_ACTIVADA", "REFUERZO_AGENDADO", "SIN_CONTACTO"],
  COORDINACION: ["RESUELTO", "CURSO_CAMBIADO", "REFUERZO_AGENDADO", "SIN_CONTACTO"],
  FINANZAS: ["RESUELTO", "PAUSA_ACTIVADA", "SIN_CONTACTO"],
};

/** Un caso cerrado es de solo lectura (como en MOSAICO): no hay "reabrir". */
export type Transicion = { tipo: "ASIGNAR"; area: Area } | { tipo: "CERRAR"; estado: Estado };

/**
 * ¿Se puede pasar del estado/área actual a esta transición? Devuelve el
 * problema en palabras, o null. La MISMA regla la usa el servidor y la pantalla
 * (que solo ofrece lo que aquí se acepta: en MOSAICO el desplegable ofrecía
 * estados que el servidor rechazaba).
 */
export function problemaTransicion(
  actual: { estado: Estado; area: Area | null },
  t: Transicion,
): string | null {
  if (cierraElCaso(actual.estado)) {
    return "El caso está cerrado: es de solo lectura. Si el problema vuelve, abre uno nuevo.";
  }
  if (t.tipo === "ASIGNAR") {
    if (actual.area === t.area) return `El caso ya está en ${ETIQUETA_AREA[t.area]}.`;
    // Desde un área solo se deriva a Finanzas (Coordinación → Finanzas).
    if (actual.area !== null && t.area !== "FINANZAS") {
      return "Un caso asignado solo se puede derivar a Finanzas; para otra área, ciérralo o reasígnalo desde Servicio.";
    }
    return null;
  }
  if (!cierraElCaso(t.estado)) return "Ese estado no cierra el caso.";
  const permitidos = CIERRES_POR_AREA[actual.area ?? "SIN_AREA"];
  if (!permitidos.includes(t.estado)) {
    return `${ETIQUETA_ESTADO[t.estado]} no es un cierre de ${
      actual.area === null ? "un caso sin asignar" : ETIQUETA_AREA[actual.area]
    }.`;
  }
  return null;
}

/**
 * Para cerrar hace falta la CONCLUSIÓN y, salvo que no se haya podido contactar
 * a la familia, el ACUERDO con ella (MOSAICO pedía además fecha de compromiso:
 * aquí es opcional, porque "se cambió de salón" no compromete a nadie a nada).
 */
export function problemaCierre(estado: Estado, acuerdo: string | null): string | null {
  if (estado === "SIN_CONTACTO") return null;
  if (acuerdo === null || acuerdo.trim() === "") {
    return "Para cerrar el caso registra el acuerdo con la familia.";
  }
  return null;
}

export type Reincidencia = "BAJA" | "MEDIA" | "ALTA";

/**
 * Reincidencia DERIVADA por reglas (MOSAICO la calculaba con IA y la guardaba):
 * ALTA con ≥5 reportes, ≥2 casos anteriores o ≥3 reportes en 30 días; MEDIA
 * con ≥3, ≥1 o ≥2; si no, BAJA. Los umbrales son los de su respaldo por reglas.
 */
export function reincidencia(datos: {
  reportes: number;
  casosAnteriores: number;
  reportes30Dias: number;
}): Reincidencia {
  if (datos.reportes >= 5 || datos.casosAnteriores >= 2 || datos.reportes30Dias >= 3) {
    return "ALTA";
  }
  if (datos.reportes >= 3 || datos.casosAnteriores >= 1 || datos.reportes30Dias >= 2) {
    return "MEDIA";
  }
  return "BAJA";
}

/**
 * El prefijo del código del caso, por CONTRATO: `CA-<contrato>-NN`. El N° de LGS
 * sin el sufijo del documento (los hermanos comparten base, cada uno su caso) o
 * el interno de KIDS; sin contrato, SINCONTRATO.
 */
export function prefijoCodigo(
  contrato: { externalRef: string | null; numero: number | null } | null,
): string {
  if (contrato === null) return "CA-SINCONTRATO";
  const base =
    contrato.externalRef !== null && contrato.externalRef !== ""
      ? (contrato.externalRef.split("#")[0] ?? contrato.externalRef)
      : `K${String(contrato.numero ?? 0)}`;
  return `CA-${base.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
}

export const CANALES = ["LLAMADA", "WHATSAPP", "EMAIL"] as const;
export type Canal = (typeof CANALES)[number];
export const RESULTADOS = [
  "CONTESTO",
  "NO_CONTESTO",
  "RESPONDIO",
  "SIN_RESPUESTA",
  "PENDIENTE",
] as const;
export type Resultado = (typeof RESULTADOS)[number];
export const ETIQUETA_RESULTADO: Record<Resultado, string> = {
  CONTESTO: "Contestó",
  NO_CONTESTO: "No contestó",
  RESPONDIO: "Respondió",
  SIN_RESPUESTA: "Sin respuesta",
  PENDIENTE: "Pendiente",
};

/** Quién abrió el caso: el guía desde la sesión, o el equipo desde la bandeja. */
export const ORIGENES = ["GUIA", "SERVICIO"] as const;
export type Origen = (typeof ORIGENES)[number];
