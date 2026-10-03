import { describe, expect, it } from "vitest";
import { numeroContrato, textoNumeroContrato } from "./numero-contrato";

describe("número de contrato a mostrar", () => {
  it("separa el N° de LGS del documento del niño", () => {
    expect(numeroContrato({ externalRef: "02-10764-26#121290", numero: 3 })).toEqual({
      numero: "02-10764-26",
      origen: "LGS",
      documento: "121290",
    });
    expect(textoNumeroContrato({ externalRef: "02-10764-26#121290", numero: 3 })).toBe(
      "LGS 02-10764-26 · doc. 121290",
    );
  });

  it("un N° de LGS sin sufijo se muestra tal cual", () => {
    expect(textoNumeroContrato({ externalRef: "02-10764-26", numero: 3 })).toBe("LGS 02-10764-26");
  });

  it("sin N° de LGS, el interno es el único número", () => {
    expect(numeroContrato({ externalRef: null, numero: 12 })).toEqual({
      numero: "N° 12",
      origen: "KIDS",
      documento: null,
    });
    expect(textoNumeroContrato({ externalRef: null, numero: null })).toBe("—");
  });
});
