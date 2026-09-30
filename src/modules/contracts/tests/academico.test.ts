import { describe, expect, it } from "vitest";
import { estadoAcademico } from "../domain/academico";

/**
 * La regla que responde "¿este niño está tomando el programa?". Se prueba sola
 * —sin base— porque es una decisión, no una consulta: lo que puede romperse es
 * el ORDEN en que manda cada condición.
 */
describe("estado académico", () => {
  it("ACTIVO: contrato aprobado, vigente y con matrícula", () => {
    expect(
      estadoAcademico({ contratoEstado: "APROBADO", vencido: false, matriculaEstado: "ACTIVA" }),
    ).toMatchObject({ activo: true, estado: "ACTIVO", motivo: null });
  });

  it("VENCER manda sobre tener matrícula", () => {
    // La matrícula sigue ACTIVA hasta que el barrido pase: si mirara solo eso,
    // un contrato vencido seguiría diciendo que el niño está cursando.
    expect(
      estadoAcademico({ contratoEstado: "APROBADO", vencido: true, matriculaEstado: "ACTIVA" }),
    ).toMatchObject({ activo: false, motivo: "CONTRATO_VENCIDO" });
  });

  it("en PAUSA no está cursando, y se dice por qué", () => {
    expect(
      estadoAcademico({ contratoEstado: "ONHOLD", vencido: false, matriculaEstado: "ACTIVA" }),
    ).toMatchObject({ activo: false, motivo: "CONTRATO_EN_PAUSA" });
  });

  it("distingue la RESERVA de LGS de un contrato del panel sin aprobar", () => {
    // Las dos están PENDIENTE, pero lo que falta hacer es distinto.
    expect(
      estadoAcademico({
        contratoEstado: "PENDIENTE",
        vencido: false,
        matriculaEstado: "RESERVADA",
      }),
    ).toMatchObject({ motivo: "RESERVA_SIN_APROBAR" });
    expect(
      estadoAcademico({ contratoEstado: "PENDIENTE", vencido: false, matriculaEstado: null }),
    ).toMatchObject({ motivo: "CONTRATO_PENDIENTE" });
  });

  it("aprobado pero sin salón todavía no es cursar", () => {
    expect(
      estadoAcademico({ contratoEstado: "APROBADO", vencido: false, matriculaEstado: null }),
    ).toMatchObject({ activo: false, motivo: "SIN_MATRICULA" });
  });

  it("sin contrato y con contrato inactivo", () => {
    expect(
      estadoAcademico({ contratoEstado: null, vencido: false, matriculaEstado: null }),
    ).toMatchObject({ motivo: "SIN_CONTRATO" });
    expect(
      estadoAcademico({ contratoEstado: "INACTIVO", vencido: false, matriculaEstado: "ACTIVA" }),
    ).toMatchObject({ motivo: "CONTRATO_INACTIVO" });
  });

  it("siempre trae una frase lista para mostrar", () => {
    for (const caso of [
      { contratoEstado: "APROBADO", vencido: false, matriculaEstado: "ACTIVA" },
      { contratoEstado: "ONHOLD", vencido: false, matriculaEstado: "ACTIVA" },
      { contratoEstado: null, vencido: false, matriculaEstado: null },
    ] as const) {
      expect(estadoAcademico(caso).detalle.length).toBeGreaterThan(0);
    }
  });
});
