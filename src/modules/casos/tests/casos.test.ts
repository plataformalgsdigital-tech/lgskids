import { describe, expect, it } from "vitest";
import {
  CIERRES_POR_AREA,
  ESTADOS,
  ESTADOS_QUE_CIERRAN,
  cierraElCaso,
  prefijoCodigo,
  problemaCierre,
  problemaTransicion,
  reincidencia,
} from "../domain/casos";

describe("casos de atención: reglas", () => {
  it("abierto/cerrado se decide en UN lugar", () => {
    for (const e of ESTADOS) expect(cierraElCaso(e)).toBe(ESTADOS_QUE_CIERRAN.includes(e));
    expect(cierraElCaso("REMITIDO_ACADEMICO")).toBe(false);
    expect(cierraElCaso("SIN_CONTACTO")).toBe(true);
  });

  it("cada cierre ofrecido por área es un estado que cierra (MOSAICO ofrecía estados inválidos)", () => {
    for (const lista of Object.values(CIERRES_POR_AREA)) {
      for (const e of lista) expect(cierraElCaso(e)).toBe(true);
    }
  });

  it("asignar: sin área a cualquiera; desde un área, solo a Finanzas; cerrado, nada", () => {
    expect(
      problemaTransicion(
        { estado: "EN_GESTION", area: null },
        { tipo: "ASIGNAR", area: "ACADEMICO" },
      ),
    ).toBeNull();
    expect(
      problemaTransicion(
        { estado: "REMITIDO_ACADEMICO", area: "ACADEMICO" },
        { tipo: "ASIGNAR", area: "COORDINACION" },
      ),
    ).not.toBeNull();
    expect(
      problemaTransicion(
        { estado: "REMITIDO_COORDINACION", area: "COORDINACION" },
        { tipo: "ASIGNAR", area: "FINANZAS" },
      ),
    ).toBeNull();
    expect(
      problemaTransicion(
        { estado: "REMITIDO_FINANZAS", area: "FINANZAS" },
        { tipo: "ASIGNAR", area: "FINANZAS" },
      ),
    ).not.toBeNull();
    expect(
      problemaTransicion(
        { estado: "RESUELTO", area: null },
        { tipo: "ASIGNAR", area: "ACADEMICO" },
      ),
    ).not.toBeNull();
  });

  it("cerrar: solo con un cierre del área, y con acuerdo salvo sin contacto", () => {
    expect(
      problemaTransicion(
        { estado: "EN_GESTION", area: null },
        { tipo: "CERRAR", estado: "RESUELTO" },
      ),
    ).toBeNull();
    expect(
      problemaTransicion(
        { estado: "EN_GESTION", area: null },
        { tipo: "CERRAR", estado: "SALON_CAMBIADO" },
      ),
    ).not.toBeNull();
    expect(
      problemaTransicion(
        { estado: "REMITIDO_ACADEMICO", area: "ACADEMICO" },
        { tipo: "CERRAR", estado: "SALON_CAMBIADO" },
      ),
    ).toBeNull();
    expect(
      problemaTransicion(
        { estado: "REMITIDO_ACADEMICO", area: "ACADEMICO" },
        { tipo: "CERRAR", estado: "CURSO_CAMBIADO" },
      ),
    ).not.toBeNull();
    expect(
      problemaTransicion(
        { estado: "EN_GESTION", area: null },
        { tipo: "CERRAR", estado: "REMITIDO_FINANZAS" },
      ),
    ).not.toBeNull();
    expect(problemaCierre("RESUELTO", null)).not.toBeNull();
    expect(problemaCierre("RESUELTO", "  ")).not.toBeNull();
    expect(problemaCierre("RESUELTO", "Llamará el lunes")).toBeNull();
    expect(problemaCierre("SIN_CONTACTO", null)).toBeNull();
  });

  it("reincidencia por reglas", () => {
    expect(reincidencia({ reportes: 1, casosAnteriores: 0, reportes30Dias: 1 })).toBe("BAJA");
    expect(reincidencia({ reportes: 3, casosAnteriores: 0, reportes30Dias: 1 })).toBe("MEDIA");
    expect(reincidencia({ reportes: 1, casosAnteriores: 1, reportes30Dias: 1 })).toBe("MEDIA");
    expect(reincidencia({ reportes: 1, casosAnteriores: 0, reportes30Dias: 3 })).toBe("ALTA");
    expect(reincidencia({ reportes: 5, casosAnteriores: 0, reportes30Dias: 0 })).toBe("ALTA");
  });

  it("el código va por contrato: el N° de LGS sin el documento, el interno o SINCONTRATO", () => {
    expect(prefijoCodigo({ externalRef: "02-16016-26#1012345678", numero: 7 })).toBe(
      "CA-021601626",
    );
    expect(prefijoCodigo({ externalRef: null, numero: 42 })).toBe("CA-K42");
    expect(prefijoCodigo(null)).toBe("CA-SINCONTRATO");
  });
});
