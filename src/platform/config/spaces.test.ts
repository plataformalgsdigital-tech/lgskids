import { describe, expect, it } from "vitest";
import { armarConfigSpaces } from "./env";

/**
 * Dónde se guardan los archivos lo decide esta función. Si se equivoca, una
 * instalación en producción escribe en el disco EFÍMERO del contenedor y los
 * libros, videos y fotos desaparecen en el siguiente despliegue.
 */
describe("configuración de Spaces", () => {
  const completas = {
    SPACES_KEY: "DO00EJEMPLO",
    SPACES_SECRET: "secreto-de-prueba",
    SPACES_BUCKET: "lgskids",
    SPACES_REGION: "nyc3",
  };

  it("sin ninguna variable devuelve null: se usa el disco (desarrollo y CI)", () => {
    expect(armarConfigSpaces({})).toBeNull();
  });

  it("con las cuatro, arma el endpoint de la región", () => {
    expect(armarConfigSpaces(completas)).toEqual({
      key: "DO00EJEMPLO",
      secret: "secreto-de-prueba",
      bucket: "lgskids",
      region: "nyc3",
      endpoint: "https://nyc3.digitaloceanspaces.com",
    });
  });

  it("un endpoint explícito manda sobre el de la región", () => {
    const c = armarConfigSpaces({ ...completas, SPACES_ENDPOINT: "https://otro.example.com" });
    expect(c?.endpoint).toBe("https://otro.example.com");
  });

  it("a medio configurar LANZA, y dice qué falta", () => {
    // Callar aquí es lo peligroso: arrancaría guardando en el disco efímero.
    expect(() => armarConfigSpaces({ SPACES_KEY: "DO00EJEMPLO" })).toThrow(/SPACES_SECRET/);
    expect(() => armarConfigSpaces({ ...completas, SPACES_BUCKET: undefined })).toThrow(
      /SPACES_BUCKET/,
    );
  });
});
