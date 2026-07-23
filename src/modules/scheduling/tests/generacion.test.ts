import { describe, expect, it } from "vitest";
import { contarOcurrencias, diaSemana, primeraOcurrencia, sumarDias } from "../domain/fechas";
import { generarFechasSlot } from "../domain/generacion";

describe("aritmética de fechas", () => {
  it("día de semana correcto (2026-08-03 es lunes)", () => {
    expect(diaSemana("2026-08-03")).toBe(1);
  });
  it("primera ocurrencia de un martes desde un lunes", () => {
    expect(primeraOcurrencia("2026-08-03", 2)).toBe("2026-08-04");
  });
  it("cuenta ocurrencias en ventana de 12 semanas exactas", () => {
    // Lunes 2026-08-03 a domingo 2026-10-25: 12 lunes y 12 martes.
    expect(contarOcurrencias("2026-08-03", "2026-10-25", 1)).toBe(12);
    expect(contarOcurrencias("2026-08-03", "2026-10-25", 2)).toBe(12);
  });
  it("sumarDias cruza meses y años", () => {
    expect(sumarDias("2026-12-28", 7)).toBe("2027-01-04");
  });
});

describe("generarFechasSlot — las reglas que costaron caro (2.3)", () => {
  const base = {
    inicioCurso: "2026-08-03",
    finalCurso: "2026-10-25", // 12 semanas nominales
    diaSemana: 2, // martes
  };

  it("sin feriados: exactamente el conteo nominal dentro de la ventana", () => {
    const { fechas, nominal } = generarFechasSlot({ ...base, noDictables: new Set() });
    expect(nominal).toBe(12);
    expect(fechas).toHaveLength(12);
    expect(fechas[0]).toBe("2026-08-04");
    expect(fechas.at(-1)).toBe("2026-10-20");
  });

  it("un feriado CORRE la sesión al final: el total se conserva y el fin real supera finalCurso", () => {
    // Feriado del calendario del salón: martes 2026-09-15.
    const { fechas } = generarFechasSlot({
      ...base,
      noDictables: new Set(["2026-09-15"]),
    });
    expect(fechas).toHaveLength(12);
    expect(fechas).not.toContain("2026-09-15");
    // La sesión 12 cae una semana después del fin nominal.
    expect(fechas.at(-1)).toBe("2026-10-27");
    expect(fechas.at(-1)! > base.finalCurso).toBe(true);
  });

  it("feriado + suspensión: dos corrimientos, mismo total", () => {
    const { fechas } = generarFechasSlot({
      ...base,
      noDictables: new Set(["2026-09-15", "2026-10-06"]),
    });
    expect(fechas).toHaveLength(12);
    expect(fechas.at(-1)).toBe("2026-11-03");
  });

  it("el corrimiento en cadena salta feriados consecutivos al final", () => {
    // El último martes nominal y el siguiente también son feriados.
    const { fechas } = generarFechasSlot({
      ...base,
      noDictables: new Set(["2026-10-20", "2026-10-27"]),
    });
    expect(fechas).toHaveLength(12);
    expect(fechas.at(-1)).toBe("2026-11-03");
  });

  it("DETERMINÍSTICA: regenerar N veces produce el mismo conjunto (invariante)", () => {
    const noDictables = new Set(["2026-08-18", "2026-09-15"]);
    const primera = generarFechasSlot({ ...base, noDictables });
    for (let i = 0; i < 5; i += 1) {
      expect(generarFechasSlot({ ...base, noDictables })).toEqual(primera);
    }
  });

  it("finalCurso NUNCA cambia: es entrada, no salida (la función ni lo devuelve)", () => {
    const entrada = { ...base, noDictables: new Set(["2026-09-15"]) };
    generarFechasSlot(entrada);
    expect(entrada.finalCurso).toBe("2026-10-25");
  });

  it("ventana sin ocurrencias del día: cero sesiones", () => {
    const { fechas, nominal } = generarFechasSlot({
      inicioCurso: "2026-08-03",
      finalCurso: "2026-08-03", // solo un lunes
      diaSemana: 2,
      noDictables: new Set(),
    });
    expect(nominal).toBe(0);
    expect(fechas).toHaveLength(0);
  });

  it("tope de seguridad ante datos corruptos (todo feriado): no se cuelga", () => {
    const todos = new Set<string>();
    let cursor = "2026-08-04";
    for (let i = 0; i < 300; i += 1) {
      todos.add(cursor);
      cursor = sumarDias(cursor, 7);
    }
    const { fechas } = generarFechasSlot({ ...base, noDictables: todos });
    expect(fechas.length).toBeLessThan(12); // no completó, pero terminó
  });
});
