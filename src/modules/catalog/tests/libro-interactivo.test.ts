import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  CSP_LIBRO,
  MENSAJE_ALMACEN_LIBRO,
  PREFIJO_NOMBRE_LIBRO,
  PUENTE_ALMACEN,
  SANDBOX_LIBRO,
  esHtml,
  esPdf,
  inyectarPuente,
} from "../domain/libro-interactivo";

const SCRIPT = `<script>${PUENTE_ALMACEN}</script>`;
const html = (s: string) => Buffer.from(s, "utf8");
const conPuente = (s: string) => inyectarPuente(html(s)).toString("utf8");

describe("inyectarPuente", () => {
  it("pone el puente como PRIMER elemento del <head>, antes que cualquier script", () => {
    const r = conPuente(
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><script>libro()</script>',
    );
    expect(r.startsWith(`<!doctype html><html lang="es"><head>${SCRIPT}<meta`)).toBe(true);
    expect(r.indexOf(SCRIPT)).toBeLessThan(r.indexOf("libro()"));
  });

  it("reconoce <HEAD> en mayúsculas y con atributos", () => {
    expect(conPuente('<HTML><HEAD class="x"><title>t</title>')).toBe(
      `<HTML><HEAD class="x">${SCRIPT}<title>t</title>`,
    );
  });

  it("no confunde <header> con <head>", () => {
    expect(conPuente("<!doctype html><html><body><header>hola</header>")).toBe(
      `<!doctype html><html>${SCRIPT}<body><header>hola</header>`,
    );
  });

  it("sin <html>, va DESPUÉS del doctype (delante lo mandaría a modo quirks)", () => {
    expect(conPuente("<!DOCTYPE html><p>hola")).toBe(`<!DOCTYPE html>${SCRIPT}<p>hola`);
  });

  it("no pierde ni altera un solo byte del libro", () => {
    const original = html("<!doctype html><html><head></head><body>ñandú 🦤</body></html>");
    const r = inyectarPuente(original).toString("utf8").replace(SCRIPT, "");
    expect(Buffer.from(r, "utf8").equals(original)).toBe(true);
  });
});

describe("la caja del libro", () => {
  it("NUNCA lleva allow-same-origin: con él dejaría de ser una caja", () => {
    expect(SANDBOX_LIBRO).not.toContain("allow-same-origin");
    expect(CSP_LIBRO).toContain(`sandbox ${SANDBOX_LIBRO}`);
  });

  it("el libro no sale a la red y solo lo enmarca la plataforma", () => {
    expect(CSP_LIBRO).toContain("connect-src 'none'");
    expect(CSP_LIBRO).toContain("frame-ancestors 'self'");
  });
});

describe("verificación de contenido", () => {
  it("esHtml mira el contenido, no la extensión", () => {
    expect(esHtml(html("<!doctype html><html>"))).toBe(true);
    expect(esHtml(html("﻿  \n<HTML lang='es'>"))).toBe(true);
    expect(esHtml(html("<!-- saved from url=(0014)about:internet -->\n<!DOCTYPE html>"))).toBe(
      true,
    );
    expect(esHtml(html("%PDF-1.7 ..."))).toBe(false);
    expect(esHtml(html("<!-- comentario sin cerrar"))).toBe(false);
    expect(esHtml(html("hola"))).toBe(false);
  });

  it("esPdf acepta la firma en el primer kilobyte", () => {
    expect(esPdf(html("%PDF-1.7\n..."))).toBe(true);
    expect(esPdf(Buffer.concat([Buffer.alloc(300, 0x20), html("%PDF-1.4")]))).toBe(true);
    expect(esPdf(Buffer.concat([Buffer.alloc(2000, 0x20), html("%PDF-1.4")]))).toBe(false);
    expect(esPdf(html("<!doctype html>"))).toBe(false);
  });
});

/**
 * El puente se EJECUTA sobre una ventana falsa: es JavaScript que corre en el
 * navegador del niño y lo que importa es su comportamiento, no su texto.
 */
describe("puente de almacenamiento", () => {
  function montar(nombre: string) {
    const enviados: unknown[] = [];
    const ventana: Record<string, unknown> = {
      name: nombre,
      parent: { postMessage: (m: unknown) => enviados.push(JSON.parse(JSON.stringify(m))) },
    };
    runInNewContext(PUENTE_ALMACEN, { window: ventana });
    const almacen = ventana["localStorage"] as Storage;
    return { ventana, almacen, enviados };
  }

  it("arranca con el progreso que le entrega el panel por window.name", () => {
    const { almacen } = montar(`${PREFIJO_NOMBRE_LIBRO}{"lgs-rookie-v1":"{\\"a\\":1}"}`);
    expect(almacen.getItem("lgs-rookie-v1")).toBe('{"a":1}');
    expect(almacen.getItem("otra")).toBeNull();
    expect(almacen.length).toBe(1);
  });

  it("cada cambio viaja al panel completo y queda en window.name para una recarga", () => {
    const { ventana, almacen, enviados } = montar("");
    almacen.setItem("k", "v");
    almacen.setItem("n", 5 as unknown as string); // localStorage guarda texto
    expect(enviados.at(-1)).toEqual({ tipo: MENSAJE_ALMACEN_LIBRO, datos: { k: "v", n: "5" } });
    expect(ventana["name"]).toBe(`${PREFIJO_NOMBRE_LIBRO}{"k":"v","n":"5"}`);

    almacen.removeItem("k");
    expect(enviados.at(-1)).toEqual({ tipo: MENSAJE_ALMACEN_LIBRO, datos: { n: "5" } });
    almacen.clear();
    expect(enviados.at(-1)).toEqual({ tipo: MENSAJE_ALMACEN_LIBRO, datos: {} });
  });

  it("descarta lo que no sea texto y sobrevive a un window.name ajeno o roto", () => {
    expect(
      montar(`${PREFIJO_NOMBRE_LIBRO}{"ok":"1","num":2,"obj":{}}`).almacen.getItem("num"),
    ).toBeNull();
    expect(montar(`${PREFIJO_NOMBRE_LIBRO}{roto`).almacen.length).toBe(0);
    expect(montar("otra-ventana").almacen.length).toBe(0);
  });

  it("sessionStorage queda en memoria y NO se manda al panel", () => {
    const { ventana, enviados } = montar("");
    (ventana["sessionStorage"] as Storage).setItem("s", "1");
    expect((ventana["sessionStorage"] as Storage).getItem("s")).toBe("1");
    expect(enviados).toHaveLength(0);
  });
});
