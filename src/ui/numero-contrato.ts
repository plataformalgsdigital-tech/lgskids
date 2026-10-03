/**
 * QUÉ NÚMERO DE CONTRATO SE MUESTRA.
 *
 * Un contrato que viene de LGS trae su N° de LGS con el DOCUMENTO del niño al
 * final (`02-10764-26#121290`): LGS lo arma así porque un contrato suyo puede
 * traer varios hermanos y en KIDS cada niño es su propio contrato. El número
 * que la gente conoce es el de LGS (`02-10764-26`); el sufijo solo dice de qué
 * niño se trata. Por eso se muestran por separado.
 *
 * El N° interno de KIDS (`numero`, un SERIAL) solo se muestra cuando el
 * contrato NO viene de LGS —los creados en el panel—, porque ahí es el único
 * número que tiene.
 *
 * La referencia COMPLETA sigue siendo la llave con LGS: se guarda y se envía
 * entera; esto es solo cómo se pinta.
 */
export interface NumeroContrato {
  /** El número a mostrar: el de LGS sin sufijo, o "N° 12" si es de KIDS. */
  numero: string;
  origen: "LGS" | "KIDS";
  /** Documento del beneficiario que LGS agregó tras el `#`; null si no trae. */
  documento: string | null;
}

export function numeroContrato(c: {
  externalRef: string | null;
  numero: number | null;
}): NumeroContrato {
  if (c.externalRef !== null && c.externalRef !== "") {
    const corte = c.externalRef.indexOf("#");
    return corte === -1
      ? { numero: c.externalRef, origen: "LGS", documento: null }
      : {
          numero: c.externalRef.slice(0, corte),
          origen: "LGS",
          documento: c.externalRef.slice(corte + 1) || null,
        };
  }
  return {
    numero: c.numero !== null ? `N° ${String(c.numero)}` : "—",
    origen: "KIDS",
    documento: null,
  };
}

/** En una sola línea: "LGS 02-10764-26 · doc. 121290" o "N° 12". */
export function textoNumeroContrato(c: {
  externalRef: string | null;
  numero: number | null;
}): string {
  const n = numeroContrato(c);
  if (n.origen === "KIDS") return n.numero;
  return n.documento !== null ? `LGS ${n.numero} · doc. ${n.documento}` : `LGS ${n.numero}`;
}
