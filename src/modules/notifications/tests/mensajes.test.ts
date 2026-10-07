import { describe, expect, it } from "vitest";
import {
  marcadoresDe,
  rellenarParaHistorial,
  rellenarPlantilla,
  usaClave,
} from "../domain/plantilla";
import { telefonoWhatsApp } from "../domain/telefono";

describe("plantillas", () => {
  it("rellena los marcadores, admite espacios y deja vacío lo desconocido", () => {
    expect(
      rellenarPlantilla("Hola {{ apoderado }}, {{nombre}} entra con {{usuario}}{{nada}}.", {
        apoderado: "Ana",
        nombre: "Sofía",
        usuario: "sgomez1234",
      }),
    ).toBe("Hola Ana, Sofía entra con sgomez1234.");
  });

  it("lista los marcadores sin repetir y detecta la clave", () => {
    expect(marcadoresDe("{{nombre}} {{clave}} {{nombre}}")).toEqual(["nombre", "clave"]);
    expect(usaClave("Tu clave: {{ clave }}")).toBe(true);
    expect(usaClave("Hola {{nombre}}")).toBe(false);
  });

  it("el texto del historial NUNCA lleva la clave", () => {
    const texto = rellenarParaHistorial("{{usuario}} / {{clave}}", {
      usuario: "sgomez1234",
      clave: "tanodote00",
    });
    expect(texto).toBe("sgomez1234 / ••••••");
    expect(texto).not.toContain("tanodote00");
  });
});

describe("teléfono para WhatsApp", () => {
  it("deja tal cual el número con indicativo", () => {
    expect(telefonoWhatsApp("+56 9 4245 9016", "CL")).toEqual({ ok: true, numero: "56942459016" });
    expect(telefonoWhatsApp("573001234567", "CO")).toEqual({ ok: true, numero: "573001234567" });
  });

  it("completa el indicativo SOLO al móvil local con la forma exacta del país", () => {
    expect(telefonoWhatsApp("300 123 4567", "CO")).toEqual({ ok: true, numero: "573001234567" });
    expect(telefonoWhatsApp("9 4245 9016", "CL")).toEqual({ ok: true, numero: "56942459016" });
    expect(telefonoWhatsApp("987654321", "PE")).toEqual({ ok: true, numero: "51987654321" });
    expect(telefonoWhatsApp("0991234567", "EC")).toEqual({ ok: true, numero: "593991234567" });
    // Un fijo colombiano de 7 dígitos no se "arregla": no llegaría a nadie.
    expect(telefonoWhatsApp("6012345", "CO").ok).toBe(false);
  });

  it("rechaza lo vacío y lo corto", () => {
    expect(telefonoWhatsApp(null, "CO")).toEqual({ ok: false, error: "Sin teléfono" });
    expect(telefonoWhatsApp("12345", "CL").ok).toBe(false);
  });
});
