import { describe, expect, it } from "vitest";
import {
  detectarArchivoGuia,
  enlaceValido,
  firmarTokenMaterialGuia,
  tokenMaterialGuiaValido,
  urlVisorOffice,
} from "../domain/material-guia";

const bytes = (...v: number[]) => Buffer.from([...v, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("material guía: qué es cada archivo (lo decide el contenido)", () => {
  it("reconoce PDF, PPTX, PPT, imágenes y mp4 por firma y extensión", () => {
    expect(detectarArchivoGuia("clase.pdf", bytes(0x25, 0x50, 0x44, 0x46))?.tipo).toBe("PDF");
    expect(detectarArchivoGuia("clase.PPTX", bytes(0x50, 0x4b, 0x03, 0x04))?.tipo).toBe("PPT");
    expect(detectarArchivoGuia("clase.ppsx", bytes(0x50, 0x4b, 0x03, 0x04))?.tipo).toBe("PPT");
    expect(detectarArchivoGuia("vieja.ppt", bytes(0xd0, 0xcf, 0x11, 0xe0))?.tipo).toBe("PPT");
    expect(detectarArchivoGuia("a.jpg", bytes(0xff, 0xd8, 0xff))?.mime).toBe("image/jpeg");
    expect(detectarArchivoGuia("a.png", bytes(0x89, 0x50, 0x4e, 0x47))?.tipo).toBe("IMAGEN");
    const webp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WEBP"),
    ]);
    expect(detectarArchivoGuia("a.webp", webp)?.tipo).toBe("IMAGEN");
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypmp42"),
      Buffer.alloc(8),
    ]);
    expect(detectarArchivoGuia("clase.mp4", mp4)?.tipo).toBe("VIDEO");
  });

  it("un archivo renombrado o de otro tipo no pasa", () => {
    // Un ejecutable con extensión .pdf.
    expect(detectarArchivoGuia("x.pdf", bytes(0x4d, 0x5a))).toBeNull();
    // Un ZIP cualquiera NO es un .ppt viejo, ni un .pptx sin firma ZIP.
    expect(detectarArchivoGuia("x.ppt", bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull();
    expect(detectarArchivoGuia("x.pptx", bytes(0x25, 0x50, 0x44, 0x46))).toBeNull();
    // Extensiones que el módulo no admite.
    expect(detectarArchivoGuia("x.docx", bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull();
    expect(detectarArchivoGuia("x.html", Buffer.from("<html>"))).toBeNull();
    expect(detectarArchivoGuia("sin-extension", bytes(0x25, 0x50, 0x44, 0x46))).toBeNull();
  });
});

describe("material guía: enlaces", () => {
  it("acepta http y https y rechaza lo demás", () => {
    expect(enlaceValido(" https://youtu.be/abc ")).toBe("https://youtu.be/abc");
    expect(enlaceValido("http://sitio.com/a?b=1")).toBe("http://sitio.com/a?b=1");
    expect(enlaceValido("javascript:alert(1)")).toBeNull();
    expect(enlaceValido("data:text/html;base64,AAAA")).toBeNull();
    expect(enlaceValido("ftp://x.com")).toBeNull();
    expect(enlaceValido("no es un enlace")).toBeNull();
    expect(enlaceValido("")).toBeNull();
    expect(enlaceValido(`https://x.com/${"a".repeat(2000)}`)).toBeNull();
  });
});

describe("material guía: enlace temporal de Office para la web", () => {
  const secreto = "secreto-de-prueba-secreto-de-prueba";
  const id = "11111111-1111-4111-8111-111111111111";
  const ahora = 1_800_000_000;

  it("sirve para ESE ítem y hasta esa hora", () => {
    const token = firmarTokenMaterialGuia(id, ahora + 3600, secreto);
    expect(tokenMaterialGuiaValido(id, token, secreto, ahora)).toBe(true);
    expect(tokenMaterialGuiaValido(id, token, secreto, ahora + 3601)).toBe(false);
    // Otro ítem, otro secreto o una firma adulterada no sirven.
    expect(
      tokenMaterialGuiaValido("22222222-2222-4222-8222-222222222222", token, secreto, ahora),
    ).toBe(false);
    expect(
      tokenMaterialGuiaValido(id, token, "otro-secreto-otro-secreto-otro-secreto", ahora),
    ).toBe(false);
    expect(tokenMaterialGuiaValido(id, `${token.slice(0, -1)}x`, secreto, ahora)).toBe(false);
    expect(tokenMaterialGuiaValido(id, "basura", secreto, ahora)).toBe(false);
  });

  it("el visor lleva el archivo codificado en src", () => {
    const u = urlVisorOffice(
      "https://app.lgskidsplataforma.com/api/material-guia/t/1.x/abc/presentacion.pptx",
    );
    expect(u.startsWith("https://view.officeapps.live.com/op/embed.aspx?src=")).toBe(true);
    expect(u).toContain(encodeURIComponent("https://app.lgskidsplataforma.com/"));
  });
});
