import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/platform/errors";
import { AccessProfile } from "../application/profile";
import { CODIGOS_OP, MAX_PERMISOS_POR_ROL, OPCIONES_MENU } from "../domain/opciones";
import { MATRIZ_ROL_PERMISOS, PERMISOS, SECCIONES_MENU } from "../domain/permisos";

const perfil = (permisos: string[]) =>
  new AccessProfile({
    roles: [{ roleCode: "coordinador", countryCode: null }],
    permissions: permisos.map((code) => ({ code, countryCode: null })),
  });

describe("opciones de pantalla (tercer nivel del árbol)", () => {
  it("una opción solo cuenta con su permiso base: marcarla sola no da nada", () => {
    expect(perfil(["op.calendario.suspender"]).hasPermission("op.calendario.suspender")).toBe(
      false,
    );
    expect(
      perfil(["op.calendario.suspender", "salones.gestionar"]).hasPermission(
        "op.calendario.suspender",
      ),
    ).toBe(true);
    // Y quitarla deja el permiso funcional, pero no esa acción.
    const sinSuspender = perfil(["salones.gestionar"]);
    expect(() => sinSuspender.requireOpcion("op.calendario.suspender")).toThrow(ForbiddenError);
    expect(sinSuspender.hasPermission("salones.gestionar")).toBe(true);
  });

  it("cada opción cuelga de una opción del menú que existe, y no se repite", () => {
    const menus = new Set(SECCIONES_MENU.flatMap((s) => s.hijos.map((h) => h.permiso as string)));
    for (const o of OPCIONES_MENU) expect(menus, o.permiso).toContain(o.menu);
    const codigos = OPCIONES_MENU.map((o) => o.permiso);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("un rol con TODO marcado se puede guardar (el tope del PUT alcanza)", () => {
    // Con el tope en 100, quitarle un par de casillas a Servicio respondía
    // "La entrada no es válida": el rol seguía teniendo más de 100.
    const todos = new Set<string>([...Object.values(PERMISOS), ...CODIGOS_OP]);
    expect(todos.size).toBeLessThanOrEqual(MAX_PERMISOS_POR_ROL);
  });

  it("su base es un permiso del catálogo, y la reutilizada ya existe", () => {
    const catalogo = new Set<string>(Object.values(PERMISOS));
    for (const o of OPCIONES_MENU) {
      for (const b of o.base) expect(catalogo, `${o.permiso} ← ${b}`).toContain(b);
      if (!o.permiso.startsWith("op.")) expect(catalogo).toContain(o.permiso);
    }
  });

  it("toda opción nueva tiene MIGRACIÓN (producción no corre el seed)", () => {
    const dir = join(process.cwd(), "prisma", "migrations");
    const sql = readdirSync(dir)
      .map((d) => {
        try {
          return readFileSync(join(dir, d, "migration.sql"), "utf8");
        } catch {
          return "";
        }
      })
      .join("\n");
    for (const c of CODIGOS_OP) expect(sql, c).toContain(`'${c}'`);
  });

  it("la matriz del seed da cada opción a quien tiene su base", () => {
    const coordinador = new Set<string>(MATRIZ_ROL_PERMISOS.coordinador);
    expect(coordinador).toContain("op.calendario.suspender");
    expect(coordinador).not.toContain("op.usuarios.tab_roles"); // no tiene roles.asignar
    const guia = new Set<string>(MATRIZ_ROL_PERMISOS.guia);
    expect(guia).toContain("op.calendario.asistencia");
    expect(guia).not.toContain("op.calendario.suspender");
  });
});
