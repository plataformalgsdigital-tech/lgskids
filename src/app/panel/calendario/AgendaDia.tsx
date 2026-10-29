"use client";

import type { CSSProperties, ReactNode } from "react";
import { descargarCsv } from "@/ui/csv";
import { horaLocal } from "@/ui/fecha-local";
import { referenciaHoraria } from "@/ui/hora-paises";
import { COLOR_NEUTRO, PAIS_CORTO, type AgendaSesion, type ColorCampania } from "./agenda-comun";

/**
 * AGENDA del día, como la de LGS (Académico › Agenda de sesiones): los
 * eventos del día agrupados por hora, en tarjetas con tipo, campaña, salón,
 * advisor, inscritos, asistencia y Zoom; contadores arriba y descarga en CSV.
 *
 * Las sesiones se agrupan por la hora de SU salón (la misma del calendario y
 * del filtro de Hora), y cada tarjeta dice además la hora de Chile y la de
 * Colombia. Welcome y eventos administrativos no son de un salón: van en la
 * hora de quien mira.
 */

export interface WelcomeAgenda {
  id: string;
  startsAt: string;
  guia: string;
  inscritos: number;
  limiteUsuarios: number;
  nivel: string | null;
}
export interface AdminAgenda {
  id: string;
  tipo: string;
  titulo: string | null;
  startsAt: string;
  duracionMin: number;
  guias: number;
}

const TIPO_UI: Record<string, { texto: string; bg: string; fg: string }> = {
  SESION: { texto: "SESIÓN", bg: "#e3f2fd", fg: "#0d47a1" },
  CLUB: { texto: "CLUB", bg: "#e8f5e9", fg: "#1b5e20" },
  TALLER: { texto: "TALLER", bg: "#f3e5f5", fg: "#6a1b9a" },
};
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const chip = (bg: string, fg: string): CSSProperties => ({
  background: bg,
  color: fg,
  padding: "0.1rem 0.5rem",
  borderRadius: "0.5rem",
  fontSize: "0.72rem",
  fontWeight: 800,
  whiteSpace: "nowrap",
});
const boton: CSSProperties = {
  padding: "0.4rem 0.7rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.85rem",
};

/** "2026-10-15" ± n días, sin pasar por la zona del navegador. */
export function moverDia(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const f = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, (d ?? 1) + n));
  return f.toISOString().slice(0, 10);
}

function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const f = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1));
  return `${DIAS[f.getUTCDay()] ?? ""} ${String(d)} de ${MESES[(m ?? 1) - 1] ?? ""} de ${String(y)}`;
}

function Contador(props: { icono: string; titulo: string; valor: number; color: string }) {
  return (
    <div
      style={{
        border: "1px solid #e3e7f0",
        borderRadius: "0.8rem",
        padding: "0.75rem 1rem",
        display: "flex",
        alignItems: "center",
        gap: "0.7rem",
        background: "white",
      }}
    >
      <span style={{ fontSize: "1.5rem" }}>{props.icono}</span>
      <div>
        <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>{props.titulo}</div>
        <div style={{ fontSize: "1.6rem", fontWeight: 800, color: props.color, lineHeight: 1.1 }}>
          {props.valor}
        </div>
      </div>
    </div>
  );
}

/** Botón de ícono de la tarjeta (✏️ / ✕). */
function icono(color: string): CSSProperties {
  return {
    border: "none",
    background: "transparent",
    color,
    fontSize: "1rem",
    fontWeight: 800,
    lineHeight: 1,
    padding: "0.25rem 0.4rem",
    borderRadius: "0.4rem",
    cursor: "pointer",
  };
}

function Tarjeta(props: {
  color: ColorCampania;
  onClick?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <div
      role={props.onClick !== undefined ? "button" : undefined}
      tabIndex={props.onClick !== undefined ? 0 : undefined}
      onClick={props.onClick}
      onKeyDown={(e) => {
        if (props.onClick !== undefined && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          props.onClick();
        }
      }}
      style={{
        background: props.color.bg,
        border: `1px solid ${props.color.borde}55`,
        borderLeft: `5px solid ${props.color.borde}`,
        borderRadius: "0.6rem",
        padding: "0.6rem 0.8rem",
        cursor: props.onClick !== undefined ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        fontSize: "0.86rem",
      }}
    >
      {props.children}
    </div>
  );
}

export function AgendaDia(props: {
  fecha: string;
  onFecha: (fecha: string) => void;
  hoy: string;
  sesiones: AgendaSesion[];
  welcomes: WelcomeAgenda[];
  admins: AdminAgenda[];
  colores: Map<string, ColorCampania>;
  cargando: boolean;
  onSesion: (id: string) => void;
  onWelcome: (id: string) => void;
  onAdmin: ((id: string) => void) | null;
  /** ✏️ de un evento creado a mano (null = sin permiso). */
  onEditarSesion: ((id: string) => void) | null;
  /** ✕: cancelar un evento o suspender una clase del horario (el padre decide si puede). */
  onQuitarSesion: ((s: AgendaSesion) => void) | null;
  /** Quién puede cada ✕: los eventos y las clases del horario tienen permisos distintos. */
  puedeQuitar: (s: AgendaSesion) => boolean;
}) {
  type Item =
    | { clase: "sesion"; hora: string; s: AgendaSesion }
    | { clase: "welcome"; hora: string; w: WelcomeAgenda }
    | { clase: "admin"; hora: string; a: AdminAgenda };
  const items: Item[] = [
    ...props.admins.map((a) => ({ clase: "admin" as const, hora: horaLocal(a.startsAt), a })),
    ...props.welcomes.map((w) => ({ clase: "welcome" as const, hora: horaLocal(w.startsAt), w })),
    ...props.sesiones.map((s) => ({ clase: "sesion" as const, hora: s.horaLocal, s })),
  ];
  const porHora = new Map<string, Item[]>();
  for (const it of items) {
    const clave = `${it.hora.slice(0, 2)}:00`;
    porHora.set(clave, [...(porHora.get(clave) ?? []), it]);
  }
  const horas = [...porHora.keys()].sort();
  const cuenta = (tipo: string) => props.sesiones.filter((s) => s.tipo === tipo).length;

  function descargar() {
    descargarCsv(
      `agenda-${props.fecha}`,
      [
        "Fecha",
        "Hora del salón",
        "Hora Chile",
        "Hora Col/Ecu/Perú",
        "Tipo",
        "Campaña",
        "Curso",
        "Salón",
        "País del salón",
        "Advisor",
        "Inscritos",
        "Cupo",
        "Asistieron",
        "Registrada",
        "Zoom",
      ],
      props.sesiones.map((s) => {
        const r = referenciaHoraria(s.startsAt);
        return [
          s.fecha,
          s.horaLocal,
          r.chile,
          r.colombia,
          s.tipo,
          s.campania,
          s.cursoTipo,
          s.salon,
          PAIS_CORTO[s.pais] ?? s.pais,
          s.guia ?? "",
          s.ocupados,
          s.cupo,
          s.asistieron,
          s.cerrada,
          s.meetingUrl ?? "",
        ];
      }),
    );
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <Contador icono="📊" titulo="Total eventos" valor={items.length} color="#1e40af" />
        <Contador icono="📚" titulo="Sesiones" valor={cuenta("SESION")} color="#1d4ed8" />
        <Contador icono="🎯" titulo="Clubs" valor={cuenta("CLUB")} color="#15803d" />
        <Contador icono="🛠️" titulo="Talleres" valor={cuenta("TALLER")} color="#7e22ce" />
        <Contador icono="👋" titulo="Welcome" valor={props.welcomes.length} color="#7c3aed" />
        <Contador icono="🏛️" titulo="Administrativos" valor={props.admins.length} color="#c2410c" />
      </div>

      <section style={{ border: "1px solid #e3e7f0", borderRadius: "0.9rem", padding: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.6rem",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.15rem", textTransform: "capitalize" }}>
              Agenda del {fechaLarga(props.fecha)}
            </h2>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.8rem", color: "var(--texto-suave)" }}>
              {items.length} evento(s) · las sesiones van en la hora de su salón
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              style={boton}
              onClick={() => props.onFecha(moverDia(props.fecha, -1))}
              aria-label="Día anterior"
            >
              ‹
            </button>
            <button type="button" style={boton} onClick={() => props.onFecha(props.hoy)}>
              Hoy
            </button>
            <input
              type="date"
              value={props.fecha}
              onChange={(e) => e.target.value !== "" && props.onFecha(e.target.value)}
              style={{ ...boton, fontWeight: 600 }}
            />
            <button
              type="button"
              style={boton}
              onClick={() => props.onFecha(moverDia(props.fecha, 1))}
              aria-label="Día siguiente"
            >
              ›
            </button>
            <button
              type="button"
              style={{ ...boton, background: "var(--lgs-verde)", border: "none" }}
              disabled={props.sesiones.length === 0}
              onClick={descargar}
            >
              ⬇ CSV
            </button>
          </div>
        </div>

        {props.cargando ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando agenda…</p>
        ) : horas.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>No hay eventos este día con esos filtros.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            {horas.map((h) => (
              <div
                key={h}
                style={{ display: "grid", gridTemplateColumns: "4rem 1fr", gap: "0.75rem" }}
              >
                <div style={{ fontWeight: 800, color: "var(--texto-suave)", paddingTop: "0.4rem" }}>
                  {h}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {(porHora.get(h) ?? []).map((it) => {
                    if (it.clase === "admin") {
                      const a = it.a;
                      return (
                        <Tarjeta
                          key={a.id}
                          color={{ bg: "#fff3e0", borde: "#fb8c00", fg: "#e65100" }}
                          onClick={props.onAdmin !== null ? () => props.onAdmin?.(a.id) : undefined}
                        >
                          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                            <span style={chip("#ffe0b2", "#e65100")}>ADMINISTRATIVO</span>
                            <strong>{a.titulo ?? a.tipo}</strong>
                          </div>
                          <div style={{ color: "var(--texto-suave)" }}>
                            {horaLocal(a.startsAt)} (tu hora) · {a.duracionMin / 60} h · {a.guias}{" "}
                            guía(s)
                          </div>
                        </Tarjeta>
                      );
                    }
                    if (it.clase === "welcome") {
                      const w = it.w;
                      const r = referenciaHoraria(w.startsAt);
                      return (
                        <Tarjeta
                          key={w.id}
                          color={{ bg: "#e8f5e9", borde: "#43a047", fg: "#1b5e20" }}
                          onClick={() => props.onWelcome(w.id)}
                        >
                          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                            <span style={chip("#c8e6c9", "#1b5e20")}>WELCOME</span>
                            <strong>{w.nivel ?? "Todos los niveles"}</strong>
                          </div>
                          <div>
                            Advisor: <strong>{w.guia}</strong>
                          </div>
                          <div style={{ color: "var(--texto-suave)" }}>
                            Agendados: {w.inscritos}/{w.limiteUsuarios} · 🕐 {r.chile} Chile ·{" "}
                            {r.colombia} Col/Ecu/Perú
                          </div>
                        </Tarjeta>
                      );
                    }
                    const s = it.s;
                    const color = props.colores.get(s.campania) ?? COLOR_NEUTRO;
                    const tipo = TIPO_UI[s.tipo] ?? TIPO_UI.SESION!;
                    const r = referenciaHoraria(s.startsAt);
                    return (
                      <Tarjeta key={s.id} color={color} onClick={() => props.onSesion(s.id)}>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.4rem",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={chip(tipo.bg, tipo.fg)}>{tipo.texto}</span>
                          <span style={chip("white", color.fg)}>{s.campania}</span>
                          <strong style={{ color: color.fg }}>{s.salon}</strong>
                          <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                            {s.cursoTipo === "JUNIOR" ? "Junior" : "Youngster"} ·{" "}
                            {PAIS_CORTO[s.pais] ?? s.pais}
                          </span>
                          {s.cerrada && (
                            <span style={chip("#e8f5e9", "#1b5e20")}>✔ registrada</span>
                          )}
                          {/* Editar / cancelar o suspender, como en la agenda de LGS. Lo
                              ya registrado no se toca. */}
                          {!s.cerrada && (
                            <span style={{ marginLeft: "auto", display: "flex", gap: "0.2rem" }}>
                              {s.esEvento && props.onEditarSesion !== null && (
                                <button
                                  type="button"
                                  title="Editar evento"
                                  aria-label="Editar evento"
                                  style={icono("#1e40af")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    props.onEditarSesion?.(s.id);
                                  }}
                                >
                                  ✏️
                                </button>
                              )}
                              {props.onQuitarSesion !== null && props.puedeQuitar(s) && (
                                <button
                                  type="button"
                                  title={s.esEvento ? "Cancelar evento" : "Suspender este día"}
                                  aria-label={s.esEvento ? "Cancelar evento" : "Suspender este día"}
                                  style={icono("#c62828")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    props.onQuitarSesion?.(s);
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                        <div>
                          Advisor:{" "}
                          {s.guia !== null ? (
                            <strong>{s.guia}</strong>
                          ) : (
                            <span style={{ color: "#c62828" }}>sin guía</span>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.9rem",
                            flexWrap: "wrap",
                            color: "var(--texto-suave)",
                          }}
                        >
                          <span>
                            Inscritos:{" "}
                            <strong style={{ color: s.ocupados >= s.cupo ? "#c62828" : "inherit" }}>
                              {s.ocupados}/{s.cupo}
                            </strong>
                          </span>
                          <span>
                            Asistieron: <strong style={{ color: "#15803d" }}>{s.asistieron}</strong>
                          </span>
                          <span>
                            🕐 {r.chile} Chile · {r.colombia} Col/Ecu/Perú
                          </span>
                          {s.meetingUrl !== null && (
                            <a
                              href={s.meetingUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              🔗 Zoom
                            </a>
                          )}
                        </div>
                      </Tarjeta>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
