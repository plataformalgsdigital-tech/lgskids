import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";
import { descargarArchivo, subirArchivo } from "../application/archivos";

const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";

describe.runIf(RUN)("archivos (integración, adaptador local)", () => {
  let archivoId: string | undefined;

  afterAll(async () => {
    if (archivoId !== undefined) {
      await execute(`DELETE FROM files_object WHERE id = $1`, [archivoId]);
    }
    await closePool();
  });

  it("sube un PDF con clave interna impredecible y lo descarga íntegro", async () => {
    const bytes = Buffer.from("%PDF-1.4 contenido de prueba KIDS2026");
    const { id } = await subirArchivo({
      actorUserId: ACTOR,
      nombreOriginal: "contrato-prueba.pdf",
      mime: "application/pdf",
      bytes,
      entidad: "contracts_contract",
      entidadId: null,
    });
    archivoId = id;

    const descargado = await descargarArchivo(id);
    expect(descargado.meta.nombreOriginal).toBe("contrato-prueba.pdf");
    expect(descargado.meta.mime).toBe("application/pdf");
    expect(descargado.bytes.equals(bytes)).toBe(true);
  });

  it("rechaza tipos de archivo no permitidos", async () => {
    await expect(
      subirArchivo({
        actorUserId: ACTOR,
        nombreOriginal: "virus.exe",
        mime: "application/x-msdownload",
        bytes: Buffer.from("MZ"),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza archivos vacíos", async () => {
    await expect(
      subirArchivo({
        actorUserId: ACTOR,
        nombreOriginal: "vacio.pdf",
        mime: "application/pdf",
        bytes: Buffer.alloc(0),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
