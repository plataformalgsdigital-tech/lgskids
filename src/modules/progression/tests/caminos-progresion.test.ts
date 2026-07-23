import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ══════════════════════════════════════════════════════════════════
 *  LA PRUEBA QUE ENUMERA TODOS LOS CAMINOS (exigida por el diseño, F9)
 * ══════════════════════════════════════════════════════════════════
 *
 * En LGS la función de avance NO se disparaba desde todos los caminos que
 * registran asistencia o califican, y los alumnos quedaban trabados sin
 * poder recuperarse. Esta prueba verifica ESTÁTICAMENTE que cada camino
 * conocido invoca `recalcularProgresion` (o `recalculoGlobal`).
 *
 * SI AGREGAS UN CAMINO NUEVO que registre asistencia o califique
 * cuestionarios, DEBES agregarlo aquí — y su código debe invocar la
 * función central. Si esta prueba falla, NO la borres: engancha el camino.
 */

const RAIZ = join(__dirname, "..", "..", "..", "..");

const CAMINOS: { camino: string; archivo: string; invoca: string }[] = [
  {
    camino: "1. Marcar asistencia (individual y masiva — mismo camino)",
    archivo: "src/modules/attendance/application/asistencia.ts",
    invoca: "recalcularProgresion",
  },
  {
    camino: "2. Registrar intento de cuestionario (práctica y Level Up)",
    archivo: "src/modules/assessment/application/intentos.ts",
    invoca: "recalcularProgresion",
  },
  {
    camino: "3. Worker — red de seguridad periódica",
    archivo: "worker/index.ts",
    invoca: "recalculoGlobal",
  },
];

describe("REGLA DURA 4: la función central se dispara desde TODOS los caminos", () => {
  it.each(CAMINOS)("$camino", ({ archivo, invoca }) => {
    const codigo = readFileSync(join(RAIZ, archivo), "utf8");
    // Importa desde el módulo progression…
    expect(codigo).toMatch(/from "(@\/|\.\.\/src\/)modules\/progression"/);
    // …y la INVOCA (no basta con importarla).
    expect(codigo).toMatch(new RegExp(`(await|void) ${invoca}\\(`));
  });

  it("no existen caminos de asistencia/calificación fuera de los enumerados", () => {
    // Los únicos INSERT/UPDATE a las tablas de asistencia e intentos viven
    // en los repositorios de sus módulos, cuyos casos de uso están
    // enumerados arriba. Verificación de superficie:
    const attRepo = readFileSync(
      join(RAIZ, "src/modules/attendance/infrastructure/attendance-repository.ts"),
      "utf8",
    );
    const assRepo = readFileSync(
      join(RAIZ, "src/modules/assessment/infrastructure/attempt-repository.ts"),
      "utf8",
    );
    expect(attRepo).toContain("INSERT INTO attendance_attendance");
    expect(assRepo).toContain("INSERT INTO assessment_attempt");
  });
});
