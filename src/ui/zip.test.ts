import { describe, expect, it } from "vitest";
import { armarZip, crc32 } from "./zip";

describe("ZIP sin compresión", () => {
  it("CRC-32 estándar", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("guarda cada archivo tal cual y cierra con el directorio central", () => {
    const uno = new TextEncoder().encode("hola");
    const zip = armarZip([
      { nombre: "JUNIOR/lámina.webp", datos: uno },
      { nombre: "vobo.png", datos: new Uint8Array([1, 2, 3]) },
    ]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    // El contenido va sin tocar, justo después del encabezado y el nombre.
    const largoNombre = v.getUint16(26, true);
    expect([...zip.slice(30 + largoNombre, 30 + largoNombre + 4)]).toEqual([...uno]);
    // Fin del directorio central: 2 entradas, y apunta a donde empieza.
    const fin = zip.length - 22;
    expect(v.getUint32(fin, true)).toBe(0x06054b50);
    expect(v.getUint16(fin + 10, true)).toBe(2);
    expect(v.getUint32(v.getUint32(fin + 16, true), true)).toBe(0x02014b50);
  });
});
