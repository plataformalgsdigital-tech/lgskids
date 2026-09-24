import { describe, expect, it } from "vitest";
import { ValidationError } from "@/platform/errors";
import { SpacesStorage } from "../infrastructure/spaces-storage";

/**
 * La clave la genera la plataforma (`uuid/uuid.ext`), pero se valida igual que
 * en el disco: si alguna vez llegara de fuera, un `..` en la clave sacaría al
 * lector de su carpeta. Se comprueba ANTES de la red, así que esta prueba no
 * necesita credenciales ni salir a internet.
 */
describe("Spaces: la clave se valida antes de salir a la red", () => {
  const storage = new SpacesStorage({
    key: "DO00EJEMPLO",
    secret: "secreto-de-prueba",
    bucket: "lgskids",
    region: "nyc3",
    endpoint: "https://nyc3.digitaloceanspaces.com",
  });

  for (const clave of ["../secreto.pdf", "/etc/passwd", "carpeta\\archivo.pdf"]) {
    it(`rechaza "${clave}"`, async () => {
      await expect(storage.leer(clave)).rejects.toBeInstanceOf(ValidationError);
      await expect(storage.guardar(clave, Buffer.from("x"), "text/plain")).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(storage.eliminar(clave)).rejects.toBeInstanceOf(ValidationError);
    });
  }
});
