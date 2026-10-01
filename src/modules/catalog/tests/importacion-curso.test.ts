import { describe, expect, it } from "vitest";
import {
  claveLeccion,
  conservarZonas,
  planificarFila,
  type LeccionGuardada,
} from "../domain/importacion-curso";

const guardada = (extra: Partial<LeccionGuardada> = {}): LeccionGuardada => ({
  orden: 3,
  contenido: "Colors",
  video: "https://v/1",
  quiz: { cuestionarios: [{ titulo: "Quiz 1", preguntas: [] }] },
  materialGuia: [{ nombre: "Guía", url: "g.pdf" }],
  materialUsuario: [],
  actividades: [{ nombre: "Colors game", link: "https://w/1", x: 40, y: 60, w: 12, h: 8 }],
  recursos: [],
  clubes: [],
  ...extra,
});

const fila = {
  curso: "JUNIOR",
  nivel: "ROOKIE",
  unidad: "Unidad 1",
  leccion: "Leccion 3",
};

describe("importación del catálogo Curso", () => {
  it("una lección nueva se CREA", () => {
    const p = planificarFila({ ...fila, orden: 3, contenido: "Colors" }, null);
    expect(p.accion).toBe("CREAR");
    expect(p.resultado.contenido).toBe("Colors");
    expect(p.resultado.quiz).toBeNull();
  });

  it("actualizar NUNCA borra los cuestionarios", () => {
    // La primera versión escribía quiz = NULL en cada lección existente.
    const p = planificarFila({ ...fila, orden: 3, contenido: "Colors and shapes" }, guardada());
    expect(p.accion).toBe("ACTUALIZAR");
    expect(p.cambios).toEqual(["contenido"]);
    expect(p.resultado.quiz).toEqual(guardada().quiz);
  });

  it("una columna que no vino no se toca", () => {
    // El archivo trae solo el temario: video y materiales quedan como estaban.
    const p = planificarFila({ ...fila, contenido: "Colors" }, guardada());
    expect(p.accion).toBe("SIN_CAMBIOS");
    expect(p.resultado.video).toBe("https://v/1");
    expect(p.resultado.materialGuia).toEqual(guardada().materialGuia);
  });

  it("una columna que vino VACÍA sí borra: es lo que dice el archivo", () => {
    const p = planificarFila({ ...fila, video: null }, guardada());
    expect(p.cambios).toContain("video");
    expect(p.resultado.video).toBeNull();
  });

  it("el juego que sigue con el mismo enlace conserva su zona en la lámina", () => {
    const p = planificarFila(
      { ...fila, actividades: [{ nombre: "Colors!", link: "https://w/1" }] },
      guardada(),
    );
    expect(p.resultado.actividades).toEqual([
      { nombre: "Colors!", link: "https://w/1", x: 40, y: 60, w: 12, h: 8 },
    ]);
    expect(p.cambios).toEqual(["actividades"]); // cambió el nombre
    expect(p.avisos).toEqual([]);
  });

  it("avisa cuando un juego ubicado desaparece del archivo", () => {
    const p = planificarFila(
      { ...fila, actividades: [{ nombre: "Otro", link: "https://w/2" }] },
      guardada(),
    );
    expect(p.avisos.join(" ")).toMatch(/1 juego\(s\).*zona se pierde/);
  });

  it("las zonas no cuentan como cambio si el juego es el mismo", () => {
    const p = planificarFila(
      { ...fila, actividades: [{ nombre: "Colors game", link: "https://w/1" }] },
      guardada(),
    );
    expect(p.accion).toBe("SIN_CAMBIOS");
  });

  it("avisa de juegos cargados en una unidad que no es parada del mapa", () => {
    const p = planificarFila(
      { ...fila, unidad: "Repaso 1", actividades: [{ nombre: "Review", link: "https://w/9" }] },
      null,
    );
    expect(p.avisos.join(" ")).toMatch(/no es una parada del mapa/);
  });

  it("un mismo enlace repetido lleva la zona una sola vez", () => {
    const r = conservarZonas(
      [
        { nombre: "A", link: "https://w/1" },
        { nombre: "B", link: "https://w/1" },
      ],
      guardada().actividades,
    );
    expect(r.actividades[1]).toEqual({ nombre: "B", link: "https://w/1" });
    expect(r.zonasPerdidas).toBe(0);
  });

  it("la clave ignora mayúsculas de la lección, como el índice de la tabla", () => {
    expect(claveLeccion({ ...fila, leccion: "LECCION 3 " })).toBe(claveLeccion(fila));
  });
});
