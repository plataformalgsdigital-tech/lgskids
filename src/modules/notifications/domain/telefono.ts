/**
 * TELÉFONO para WhatsApp: solo dígitos y CON indicativo de país, que es lo que
 * pide Whapi (`573001234567`). LGS solo quita lo que no es dígito y exige 10;
 * aquí además se completa el indicativo cuando el número viene local, porque
 * los apoderados se cargan a mano y "300 123 4567" sin el 57 no llega a nadie.
 *
 * Solo se completa cuando el número tiene la forma EXACTA de un móvil local
 * del país: adivinar sobre cualquier otra cosa mandaría el mensaje a un extraño.
 */

const INDICATIVO: Record<string, string> = { CL: "56", CO: "57", EC: "593", PE: "51" };

export type TelefonoWhatsApp = { ok: true; numero: string } | { ok: false; error: string };

export function telefonoWhatsApp(crudo: string | null | undefined, pais: string): TelefonoWhatsApp {
  let d = String(crudo ?? "").replace(/\D/g, "");
  if (d === "") return { ok: false, error: "Sin teléfono" };
  if (d.startsWith("00")) d = d.slice(2);

  const local =
    (pais === "CO" && /^3\d{9}$/.test(d)) ||
    (pais === "CL" && /^9\d{8}$/.test(d)) ||
    (pais === "PE" && /^9\d{8}$/.test(d)) ||
    (pais === "EC" && /^09\d{8}$/.test(d));
  if (local) {
    const sinCero = pais === "EC" ? d.slice(1) : d;
    d = `${INDICATIVO[pais] ?? ""}${sinCero}`;
  }

  if (d.length < 10 || d.length > 15) {
    return { ok: false, error: `Teléfono inválido (${String(d.length)} dígitos)` };
  }
  return { ok: true, numero: d };
}
