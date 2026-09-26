import { ValidationError } from "@/platform/errors";

/**
 * N° de contrato de LGS: `PP-NNNNN-YY` (país 2 díg · correlativo · año 2 díg).
 * Prefijo de país: 01=CL, 02=CO, 03=EC, 04=PE. KIDS NO genera este número
 * (lo lleva LGS); solo lo recibe, valida y lo usa para mostrar/buscar.
 *
 * **Admite un sufijo `#<documento>`** (2026-09-26). Un contrato de LGS puede
 * llevar VARIOS hermanos y en KIDS cada niño es su propio contrato, así que
 * LGS manda `01-16016-26#1012345678` para que cada uno tenga su referencia.
 * Sin el sufijo, la segunda reserva del mismo contrato caería en la
 * idempotencia y devolvería el contrato del PRIMER hermano: el segundo niño
 * nunca quedaría inscrito y nadie vería un error.
 */
export const PREFIJO_PAIS: Record<string, string> = {
  "01": "CL",
  "02": "CO",
  "03": "EC",
  "04": "PE",
};

const RE_EXTERNAL_REF = /^(0[1-4])-(\d+)-(\d{2})(?:#([A-Za-z0-9][A-Za-z0-9._-]{0,29}))?$/;

export interface ExternalRefPartes {
  prefijo: string; // "01".."04"
  pais: string; // "CL".."PE"
  numero: string; // correlativo (dígitos)
  anio: string; // "26"
  /** Documento del niño cuando el contrato LGS trae varios hermanos. */
  sufijo: string | null;
  /** El N° de contrato LGS sin el sufijo: lo que ve la gente. */
  base: string;
}

/** Parsea el N° LGS; null si el formato no es válido. */
export function parseExternalRef(externalRef: string): ExternalRefPartes | null {
  const m = RE_EXTERNAL_REF.exec(externalRef.trim());
  if (m === null) return null;
  const prefijo = m[1] as string;
  const pais = PREFIJO_PAIS[prefijo];
  if (pais === undefined) return null;
  const numero = m[2] as string;
  const anio = m[3] as string;
  return {
    prefijo,
    pais,
    numero,
    anio,
    sufijo: m[4] ?? null,
    base: `${prefijo}-${numero}-${anio}`,
  };
}

/**
 * Valida el N° LGS: formato `PP-NNNNN-YY` y que el prefijo de país coincida
 * con el país del contrato. Lanza ValidationError si algo no cuadra.
 */
export function validarExternalRef(externalRef: string, countryCode: string): void {
  const partes = parseExternalRef(externalRef);
  if (partes === null) {
    throw new ValidationError(
      "El N° de contrato LGS debe tener el formato PP-NNNNN-YY (ej. 01-16016-26), con país 01=CL, 02=CO, 03=EC, 04=PE. Puede llevar el documento del niño al final: 01-16016-26#1012345678.",
    );
  }
  if (partes.pais !== countryCode) {
    throw new ValidationError(
      `El prefijo ${partes.prefijo} (${partes.pais}) no coincide con el país del contrato (${countryCode}).`,
    );
  }
}
