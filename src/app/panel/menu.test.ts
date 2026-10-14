import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISOS, SECCIONES_MENU } from "@/modules/access/domain/permisos";
import { MENU, PERMISO_SECCION, SECCIONES } from "./menu";

/**
 * El menú lateral y el árbol de permisos de Roles (`SECCIONES_MENU`) son dos
 * listas que tienen que decir lo mismo. Si se desalinean, aparece un ítem que
 * nadie puede apagar, o una casilla en Roles que no apaga nada. Esto lo fija:
 *  - cada sección tiene su permiso PADRE, y es el mismo en los dos lados;
 *  - cada ítem tiene su permiso FUNCIONAL y su permiso de MENÚ (salvo el
 *    Tablero, que es suelto, y lo de superadmin, que va por rol);
 *  - todo permiso nombrado existe en el catálogo;
 *  - cada ítem lleva a una página que existe (aunque sea "en construcción").
 */
const CATALOGO = new Set<string>(Object.values(PERMISOS));
const APP = path.resolve(__dirname, "..");

/** ¿Hay una página para esta ruta (propia, o una carpeta dinámica hermana)? */
function hayPagina(href: string): boolean {
  const dir = path.join(APP, ...href.split("/").filter((p) => p !== ""));
  if (existsSync(path.join(dir, "page.tsx"))) return true;
  const padre = path.dirname(dir);
  return (
    existsSync(padre) &&
    readdirSync(padre).some(
      (d) => /^\[[^\]]+\]$/.test(d) && existsSync(path.join(padre, d, "page.tsx")),
    )
  );
}

describe("menú lateral ↔ permisos", () => {
  it("las secciones son las mismas, en el mismo orden y con el mismo permiso padre", () => {
    expect([...SECCIONES]).toEqual(SECCIONES_MENU.map((s) => s.etiqueta));
    for (const s of SECCIONES_MENU) {
      expect(PERMISO_SECCION[s.etiqueta as (typeof SECCIONES)[number]]).toBe(s.permiso);
      expect(CATALOGO.has(s.permiso)).toBe(true);
    }
  });

  it("cada ítem tiene permiso funcional y de menú, y su casilla en Roles", () => {
    for (const item of MENU) {
      expect(CATALOGO.has(item.permiso), `${item.etiqueta}: ${item.permiso}`).toBe(true);
      if (item.seccion === "Tablero" || item.soloSuperadmin === true) continue;
      expect(item.permisoMenu, `${item.etiqueta} sin permiso de menú`).toBeDefined();
      expect(
        CATALOGO.has(item.permisoMenu ?? ""),
        `${item.etiqueta}: ${String(item.permisoMenu)}`,
      ).toBe(true);
      const seccion = SECCIONES_MENU.find((s) => s.etiqueta === item.seccion);
      expect(
        seccion?.hijos.some((h) => h.permiso === item.permisoMenu),
        `${item.etiqueta} no tiene casilla en Roles › ${item.seccion}`,
      ).toBe(true);
    }
  });

  it("cada casilla de Roles apaga un ítem que existe", () => {
    for (const s of SECCIONES_MENU) {
      for (const h of s.hijos) {
        expect(
          MENU.some((i) => i.seccion === s.etiqueta && i.permisoMenu === h.permiso),
          `Roles › ${s.etiqueta} › ${h.etiqueta} no corresponde a ningún ítem`,
        ).toBe(true);
      }
    }
  });

  it("cada ítem lleva a una página que existe", () => {
    for (const item of MENU) {
      if (item.href === undefined) continue;
      expect(hayPagina(item.href), `${item.etiqueta} → ${item.href}`).toBe(true);
    }
  });
});
