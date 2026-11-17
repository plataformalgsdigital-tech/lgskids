import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * MATERIAL GUÍA (2026-11-17): lo que el guía abre desde "Material" y "Recursos" en
 * el panel de la sesión, por lección del catálogo Curso.
 *
 *  - MATERIAL: presentaciones (PPT/PPTX) y PDF.
 *  - RECURSO:  imágenes, videos mp4 y enlaces.
 *
 * Reglas PURAS (con pruebas): qué tipo es un archivo —lo decide el CONTENIDO, no el
 * MIME que diga el navegador: en Windows un .pptx puede llegar como octet-stream—,
 * qué tipo va en qué pestaña, qué es un enlace válido y el token que deja a Office
 * para la web bajar UNA presentación durante un rato.
 */

export const TABS_MATERIAL_GUIA = ["MATERIAL", "RECURSO"] as const;
export type TabMaterialGuia = (typeof TABS_MATERIAL_GUIA)[number];

export const TIPOS_MATERIAL_GUIA = ["PPT", "PDF", "IMAGEN", "VIDEO", "ENLACE"] as const;
export type TipoMaterialGuia = (typeof TIPOS_MATERIAL_GUIA)[number];

/** Qué tipos admite cada pestaña. */
export const TIPOS_POR_TAB: Record<TabMaterialGuia, readonly TipoMaterialGuia[]> = {
  MATERIAL: ["PPT", "PDF"],
  RECURSO: ["IMAGEN", "VIDEO", "ENLACE"],
};

/** Tope por archivo (como el material del alumno: un PPTX con audio o un mp4 de clase). */
export const TAMANO_MAXIMO_MATERIAL_GUIA = 80 * 1024 * 1024;

/** Cuánto vale el enlace con que Office para la web baja la presentación. */
export const MINUTOS_TOKEN_OFFICE = 60;

export function tabMaterialGuiaValida(v: unknown): v is TabMaterialGuia {
  return typeof v === "string" && (TABS_MATERIAL_GUIA as readonly string[]).includes(v);
}

export interface ArchivoDetectado {
  tipo: Exclude<TipoMaterialGuia, "ENLACE">;
  /** MIME con el que se guarda (el que acepta la política de `files`). */
  mime: string;
  extension: string;
}

const MIME_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const MIME_PPT = "application/vnd.ms-powerpoint";

const empieza = (b: Buffer, ...firma: number[]) => firma.every((v, i) => b[i] === v);

/**
 * Qué es el archivo, o null si no es nada de lo que admite el Material Guía.
 * Se mira la extensión Y la firma de los primeros bytes (un .pdf que no empieza por
 * `%PDF` no pasa), para que un archivo renombrado no entre por otra pestaña.
 */
export function detectarArchivoGuia(nombre: string, bytes: Buffer): ArchivoDetectado | null {
  const ext = nombre.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" && empieza(bytes, 0x25, 0x50, 0x44, 0x46)) {
    return { tipo: "PDF", mime: "application/pdf", extension: "pdf" };
  }
  // PPTX/PPSX son ZIP (PK\x03\x04); PPT/PPS son OLE2 (D0 CF 11 E0).
  if ((ext === "pptx" || ext === "ppsx") && empieza(bytes, 0x50, 0x4b, 0x03, 0x04)) {
    return { tipo: "PPT", mime: MIME_PPTX, extension: ext };
  }
  if ((ext === "ppt" || ext === "pps") && empieza(bytes, 0xd0, 0xcf, 0x11, 0xe0)) {
    return { tipo: "PPT", mime: MIME_PPT, extension: ext };
  }
  if (["jpg", "jpeg"].includes(ext) && empieza(bytes, 0xff, 0xd8, 0xff)) {
    return { tipo: "IMAGEN", mime: "image/jpeg", extension: "jpg" };
  }
  if (ext === "png" && empieza(bytes, 0x89, 0x50, 0x4e, 0x47)) {
    return { tipo: "IMAGEN", mime: "image/png", extension: "png" };
  }
  if (
    ext === "webp" &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return { tipo: "IMAGEN", mime: "image/webp", extension: "webp" };
  }
  // mp4: la caja `ftyp` va en los bytes 4-8.
  if (["mp4", "m4v"].includes(ext) && bytes.subarray(4, 8).toString("latin1") === "ftyp") {
    return { tipo: "VIDEO", mime: "video/mp4", extension: "mp4" };
  }
  return null;
}

/** La política de `files` para este módulo: solo lo que `detectarArchivoGuia` reconoce. */
export const MIMES_MATERIAL_GUIA: ReadonlyMap<string, string> = new Map([
  ["application/pdf", "pdf"],
  [MIME_PPTX, "pptx"],
  [MIME_PPT, "ppt"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["video/mp4", "mp4"],
]);

/** Texto de ayuda con lo que admite cada pestaña. */
export const AYUDA_POR_TAB: Record<TabMaterialGuia, string> = {
  MATERIAL: "PPT, PPTX o PDF",
  RECURSO: "JPG, PNG, WebP, MP4 o un enlace",
};

/** Un enlace http(s) válido, o null. Nada de `javascript:` ni `data:`. */
export function enlaceValido(texto: string): string | null {
  const t = texto.trim();
  if (t.length === 0 || t.length > 2000) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// —— Token del enlace temporal de Office para la web ————————————————————————

function firma(itemId: string, venceEn: number, secreto: string): string {
  return createHmac("sha256", secreto)
    .update(`material-guia:${itemId}:${String(venceEn)}`)
    .digest("base64url");
}

/** `venceEn` en segundos desde epoch. Sirve para ESE ítem y hasta esa hora. */
export function firmarTokenMaterialGuia(itemId: string, venceEn: number, secreto: string): string {
  return `${String(venceEn)}.${firma(itemId, venceEn, secreto)}`;
}

/** `ahora` en segundos desde epoch. Compara la firma en tiempo constante. */
export function tokenMaterialGuiaValido(
  itemId: string,
  token: string,
  secreto: string,
  ahora: number,
): boolean {
  const m = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (m === null) return false;
  const venceEn = Number(m[1]);
  if (venceEn < ahora) return false;
  const esperada = Buffer.from(firma(itemId, venceEn, secreto));
  const recibida = Buffer.from(m[2] ?? "");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** La dirección que Microsoft abre: su visor incrustable con `src` = nuestro archivo temporal. */
export function urlVisorOffice(urlArchivo: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(urlArchivo)}`;
}
