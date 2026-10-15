/**
 * Un ZIP armado en el navegador, SIN compresión ("stored"). Sirve para bajar
 * de una vez archivos que ya vienen comprimidos —imágenes WebP/PNG/JPG—, donde
 * comprimir otra vez no ahorra nada; así no hace falta una dependencia.
 * Nombres en UTF-8 (bit 11), sin ZIP64: hasta 65.535 archivos y 4 GB.
 */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en formato MS-DOS (la que guarda el ZIP). */
function fechaDos(d: Date): { hora: number; fecha: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    fecha: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function armarZip(
  archivos: { nombre: string; datos: Uint8Array }[],
  ahora = new Date(),
): Uint8Array {
  const { hora, fecha } = fechaDos(ahora);
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true); // sin compresión
    local.setUint16(10, hora, true);
    local.setUint16(12, fecha, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, a.datos.length, true);
    local.setUint32(22, a.datos.length, true);
    local.setUint16(26, nombre.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, a.datos);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, hora, true);
    cd.setUint16(14, fecha, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, a.datos.length, true);
    cd.setUint32(24, a.datos.length, true);
    cd.setUint16(28, nombre.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nombre);

    offset += 30 + nombre.length + a.datos.length;
  }

  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);

  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of todo) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}

/** Descarga en el navegador. */
export function descargarBytes(nombre: string, datos: Uint8Array, tipo: string): void {
  const url = URL.createObjectURL(new Blob([datos.slice().buffer], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
