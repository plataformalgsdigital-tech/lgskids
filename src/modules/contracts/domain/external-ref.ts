import { ValidationError } from "@/platform/errors";

/**
 * N° de contrato de LGS: `PP-NNNNN-YY` (país 2 díg · correlativo · año 2 díg).
 * Prefijo de país: 01=CL, 02=CO, 03=EC, 04=PE. KIDS NO genera este número
 * (lo lleva LGS); solo lo recibe, valida y lo usa para mostrar/buscar.
 */
export const PREFIJO_PAIS: Record<string, string> = {
  "01": "CL",
  "02": "CO",
  "03": "EC",
  "04": "PE",
};

const RE_EXTERNAL_REF = /^(0[1-4])-(\d+)-(\d{2})$/;

export interface ExternalRefPartes {
  prefijo: string; // "01".."04"
  pais: string; // "CL".."PE"
  numero: string; // correlativo (dígitos)
  anio: string; // "26"
}

/** Parsea el N° LGS; null si el formato no es válido. */
export function parseExternalRef(externalRef: string): ExternalRefPartes | null {
  const m = RE_EXTERNAL_REF.exec(externalRef.trim());
  if (m === null) return null;
  const prefijo = m[1] as string;
  const pais = PREFIJO_PAIS[prefijo];
  if (pais === undefined) return null;
  return { prefijo, pais, numero: m[2] as string, anio: m[3] as string };
}

/**
 * Valida el N° LGS: formato `PP-NNNNN-YY` y que el prefijo de país coincida
 * con el país del contrato. Lanza ValidationError si algo no cuadra.
 */
export function validarExternalRef(externalRef: string, countryCode: string): void {
  const partes = parseExternalRef(externalRef);
  if (partes === null) {
    throw new ValidationError(
      "El N° de contrato LGS debe tener el formato PP-NNNNN-YY (ej. 01-16016-26), con país 01=CL, 02=CO, 03=EC, 04=PE.",
    );
  }
  if (partes.pais !== countryCode) {
    throw new ValidationError(
      `El prefijo ${partes.prefijo} (${partes.pais}) no coincide con el país del contrato (${countryCode}).`,
    );
  }
}
