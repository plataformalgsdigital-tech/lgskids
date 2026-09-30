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

  it("clasifica en las TRES situaciones que muestra LGS", () => {
    // Cursando: el único camino.
    expect(
      estadoAcademico({ contratoEstado: "APROBADO", vencido: false, matriculaEstado: "ACTIVA" })
        .situacion,
    ).toBe("CURSANDO");
    // Suspendido: SOLO la pausa, que es lo único que vuelve solo al reactivar.
    expect(
      estadoAcademico({ contratoEstado: "ONHOLD", vencido: false, matriculaEstado: "ACTIVA" })
        .situacion,
    ).toBe("SUSPENDIDO");
    // Todo lo demás es No cursando, aunque el motivo diga cuál.
    for (const caso of [
      { contratoEstado: "APROBADO", vencido: true, matriculaEstado: "ACTIVA" },
      { contratoEstado: "INACTIVO", vencido: false, matriculaEstado: null },
      { contratoEstado: "APROBADO", vencido: false, matriculaEstado: null },
      { contratoEstado: "PENDIENTE", vencido: false, matriculaEstado: "RESERVADA" },
      { contratoEstado: null, vencido: false, matriculaEstado: null },
    ] as const) {
      expect(estadoAcademico(caso).situacion).toBe("NO_CURSANDO");
    }
  });

  it("un VENCIDO no pasa por Suspendido", () => {
    // Si LGS mapeara el motivo por su cuenta podría confundirlos; por eso la
    // situación viene ya clasificada.
    expect(
      estadoAcademico({ contratoEstado: "APROBADO", vencido: true, matriculaEstado: "ACTIVA" }),
    ).toMatchObject({ situacion: "NO_CURSANDO", motivo: "CONTRATO_VENCIDO" });
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
