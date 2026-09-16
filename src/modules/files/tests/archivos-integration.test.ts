import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";
import { descargarArchivo, subirArchivo } from "../application/archivos";
import { LADO_MAXIMO } from "../infrastructure/optimizar-imagen";

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

  it("encoge una imagen grande al subirla y la deja en WebP", async () => {
    // El arte entraba tal cual salía del diseñador: banners de 2-3 MB que un
    // niño en tablet bajaba enteros. Un PNG de 2400 px debe salir en WebP,
    // acotado a LADO_MAXIMO y pesando bastante menos.
    const sharp = (await import("sharp")).default;
    const grande = await sharp({
      create: { width: 2400, height: 1600, channels: 3, background: "#2a6fd6" },
    })
      .png()
      .toBuffer();

    const { id } = await subirArchivo({
      actorUserId: ACTOR,
      nombreOriginal: "banner-grande.png",
      mime: "image/png",
      bytes: grande,
      entidad: "catalog_imagen_curso",
      entidadId: "TEST:OPTIMIZAR",
    });

    const d = await descargarArchivo(id);
    expect(d.meta.mime).toBe("image/webp");
    expect(d.bytes.length).toBeLessThan(grande.length);

    const meta = await sharp(d.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(LADO_MAXIMO);
    expect(meta.height).toBeLessThanOrEqual(LADO_MAXIMO);

    await execute(`DELETE FROM files_object WHERE id = $1`, [id]);
  });

  it("conserva la TRANSPARENCIA: un premio sin alfa se rompe sobre cualquier fondo", async () => {
    const sharp = (await import("sharp")).default;
    const conAlfa = await sharp({
      create: { width: 900, height: 900, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const { id } = await subirArchivo({
      actorUserId: ACTOR,
      nombreOriginal: "premio.png",
      mime: "image/png",
      bytes: conAlfa,
      entidad: "catalog_premio_nivel",
      entidadId: "TEST:ALFA",
    });

    const d = await descargarArchivo(id);
    const meta = await sharp(d.bytes).metadata();
    expect(meta.hasAlpha).toBe(true);

    await execute(`DELETE FROM files_object WHERE id = $1`, [id]);
  });

  it("no toca un PDF: la optimización es solo para imágenes", async () => {
    const bytes = Buffer.from("%PDF-1.4 no me toques");
    const { id } = await subirArchivo({
      actorUserId: ACTOR,
      nombreOriginal: "intacto.pdf",
      mime: "application/pdf",
      bytes,
    });
    const d = await descargarArchivo(id);
    expect(d.meta.mime).toBe("application/pdf");
    expect(d.bytes.equals(bytes)).toBe(true);
    await execute(`DELETE FROM files_object WHERE id = $1`, [id]);
  });
});
