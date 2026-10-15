/**
 * El horario de un salón en una línea, como se muestra en la ficha de campaña
 * y en Academic Change: "MAR-JUE 17:00-18:00 · SÁB 09:00-11:00 (Club)". Es la
 * hora de PARED del salón (la de su zona), no la de quien mira.
 */

export interface SlotResumen {
  tipo: string;
  diaSemana: number;
  horaLocal: string;
  duracionMin: number;
}

const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "17:00" + 60 min → "18:00" (reloj de pared, sin zona). */
function horaFin(inicio: string, dur: number): string {
  const [h, m] = inicio.split(":").map(Number);
  const t = (h ?? 0) * 60 + (m ?? 0) + dur;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Agrupa por hora los días: "LUN-MIÉ 17:00-18:00 · SÁB 09:00-11:00 (Club)". */
export function resumenHorario(horario: SlotResumen[]): string {
  if (horario.length === 0) return "—";
  const porClave = new Map<string, { dias: number[]; dur: number; tipo: string }>();
  for (const s of horario) {
    const clave = `${s.horaLocal}|${s.tipo}`;
    const g = porClave.get(clave) ?? { dias: [], dur: s.duracionMin, tipo: s.tipo };
    g.dias.push(s.diaSemana);
    porClave.set(clave, g);
  }
  return [...porClave.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, g]) => {
      const hora = clave.split("|")[0]!;
      const etiquetas = g.dias
        .sort((a, b) => a - b)
        .map((d) => DIAS_CORTO[d]?.toUpperCase() ?? "?")
        .join("-");
      return `${etiquetas} ${hora}-${horaFin(hora, g.dur)}${g.tipo === "CLUB" ? " (Club)" : ""}`;
    })
    .join(" · ");
}
