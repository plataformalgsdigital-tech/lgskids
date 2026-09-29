import { describe, expect, it } from "vitest";
import { desfaseHoras, horaEnElOtroGrupo, otroGrupo, proximoCambioDeDesfase } from "./husos";

/**
 * El desfase CL–CO no es fijo: Chile cambia la hora y Colombia no. El mismo
 * horario de las 17:00 de Chile lo viven los demás a las 15:00 en verano
 * austral y a las 16:00 en invierno. Estas cifras salen de la base IANA del
 * runtime, así que la prueba las fija contra fechas concretas.
 */
describe("desfase entre los grupos de país", () => {
  it("en verano austral Chile va DOS horas por delante", () => {
    // Enero: Chile en horario de verano (UTC−3), Colombia siempre UTC−5.
    expect(desfaseHoras("2027-01-15")).toBe(2);
    expect(horaEnElOtroGrupo("17:00", "01", "2027-01-15")).toEqual({ hora: "15:00", dias: 0 });
  });

  it("en invierno austral va UNA hora por delante", () => {
    // Junio: Chile vuelve a UTC−4.
    expect(desfaseHoras("2027-06-15")).toBe(1);
    expect(horaEnElOtroGrupo("17:00", "01", "2027-06-15")).toEqual({ hora: "16:00", dias: 0 });
  });

  it("mirado al revés: las 17:00 de Colombia son más tarde en Chile", () => {
    expect(horaEnElOtroGrupo("17:00", "02", "2027-01-15")).toEqual({ hora: "19:00", dias: 0 });
    expect(horaEnElOtroGrupo("17:00", "02", "2027-06-15")).toEqual({ hora: "18:00", dias: 0 });
  });

  it("avisa cuando la hora cae en OTRO día", () => {
    // Chile va por delante, así que en los bordes del día se cruza la fecha:
    // 00:30 de Chile son las 22:30 del día ANTERIOR en Colombia…
    expect(horaEnElOtroGrupo("00:30", "01", "2027-01-15")).toEqual({
      hora: "22:30",
      dias: -1,
    });
    // …y las 23:00 de Colombia son la 01:00 del día SIGUIENTE en Chile.
    expect(horaEnElOtroGrupo("23:00", "02", "2027-01-15")).toEqual({
      hora: "01:00",
      dias: 1,
    });
  });

  it("encuentra el próximo cambio y dice cuál será el desfase", () => {
    const cambio = proximoCambioDeDesfase("2027-01-15");
    expect(cambio).not.toBeNull();
    // El horario de verano chileno termina a comienzos de abril.
    expect(cambio?.fecha.slice(0, 7)).toBe("2027-04");
    expect(cambio?.desfase).toBe(1);
    // Y el de vuelta, a comienzos de septiembre.
    const vuelta = proximoCambioDeDesfase("2027-06-15");
    expect(vuelta?.fecha.slice(0, 7)).toBe("2027-09");
    expect(vuelta?.desfase).toBe(2);
  });

  it("solo hay dos grupos y se miran entre sí", () => {
    expect(otroGrupo("01")).toBe("02");
    expect(otroGrupo("02")).toBe("01");
  });
});
