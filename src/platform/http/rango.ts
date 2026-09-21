import { NextResponse } from "next/server";

/**
 * Peticiones por RANGO (`Range: bytes=…`), para servir video.
 *
 * Sin esto Safari —iPad incluido— no reproduce el video: pide `bytes=0-1` para
 * sondear y exige un 206. Chrome también pide por rangos (`bytes=0-`) y los usa
 * para adelantar el video sin bajarlo entero.
 *
 * Solo el primer rango: los navegadores no piden varios para un <video>, y
 * responder multipart/byteranges no aporta nada aquí.
 */
export type Rango = { inicio: number; fin: number };

/** null = sin cabecera (responder entero); "invalido" = 416. */
export function leerRango(cabecera: string | null, total: number): Rango | "invalido" | null {
  if (cabecera === null || cabecera.trim() === "") return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecera.split(",")[0]?.trim() ?? "");
  if (m === null) return "invalido";
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return "invalido";
  let inicio: number;
  let fin: number;
  if (a === "") {
    // `bytes=-500`: los ÚLTIMOS 500 bytes.
    const sufijo = Number(b);
    if (sufijo === 0) return "invalido";
    inicio = Math.max(0, total - sufijo);
    fin = total - 1;
  } else {
    inicio = Number(a);
    fin = b === "" ? total - 1 : Math.min(Number(b), total - 1);
  }
  if (inicio >= total || inicio > fin) return "invalido";
  return { inicio, fin };
}

/** Responde `bytes` entero (200) o el tramo pedido (206), o 416 si no cabe. */
export function respuestaConRango(
  bytes: Buffer,
  cabeceraRango: string | null,
  cabeceras: Record<string, string>,
): NextResponse {
  const total = bytes.length;
  const rango = leerRango(cabeceraRango, total);
  const comunes = { ...cabeceras, "Accept-Ranges": "bytes" };
  if (rango === "invalido") {
    return new NextResponse(null, {
      status: 416,
      headers: { ...comunes, "Content-Range": `bytes */${String(total)}` },
    });
  }
  if (rango === null) {
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: { ...comunes, "Content-Length": String(total) },
    });
  }
  const tramo = bytes.subarray(rango.inicio, rango.fin + 1);
  return new NextResponse(new Uint8Array(tramo), {
    status: 206,
    headers: {
      ...comunes,
      "Content-Length": String(tramo.length),
      "Content-Range": `bytes ${String(rango.inicio)}-${String(rango.fin)}/${String(total)}`,
    },
  });
}
