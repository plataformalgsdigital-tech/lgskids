import { describe, expect, it } from "vitest";
import { origenPublico } from "./origen";

const peticion = (cabeceras: Record<string, string>, url = "https://localhost:8080/x") => ({
  headers: new Headers(cabeceras),
  nextUrl: new URL(url),
});

describe("origenPublico", () => {
  it("detrás del proxy: el dominio que ve el navegador, no el puerto del contenedor", () => {
    expect(
      origenPublico(peticion({ host: "app.lgskidsplataforma.com", "x-forwarded-proto": "https" })),
    ).toBe("https://app.lgskidsplataforma.com");
  });

  it("x-forwarded-host manda sobre host", () => {
    expect(
      origenPublico(
        peticion({
          host: "interno:8080",
          "x-forwarded-host": "app.lgskidsplataforma.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://app.lgskidsplataforma.com");
  });

  it("en desarrollo: el host con su puerto y el esquema de la URL", () => {
    expect(origenPublico(peticion({ host: "192.168.1.20:3000" }, "http://localhost:3000/x"))).toBe(
      "http://192.168.1.20:3000",
    );
  });

  it("un host con caracteres raros no llega a la CSP", () => {
    expect(origenPublico(peticion({ host: "evil.com; script-src *" }))).toBe(
      "https://localhost:8080",
    );
  });
});
