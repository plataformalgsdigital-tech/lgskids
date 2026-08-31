"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Sesion {
  id: string;
  fecha: string;
  horaLocal: string;
  tipo: string;
  numero: number;
  classroomId: string;
  salon: string;
  cursoTipo: string;
  campania: string;
  cupo: number;
  ocupados: number;
}

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
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const COLOR_CURSO: Record<string, { bg: string; fg: string }> = {
  JUNIOR: { bg: "#e3f2fd", fg: "#0d47a1" },
  YOUNGSTER: { bg: "#f3e5f5", fg: "#6a1b9a" },
};
const CELDA_ALTO = "6.5rem";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function fechaBonita(iso: string): string {
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
  return `${dias[f.getDay()]}, ${d} de ${MESES[(m ?? 1) - 1]} de ${y}`;
}
const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

export default function MisClasesPage() {
  const [y, setY] = useState<number>(() => new Date().getFullYear());
  const [m, setM] = useState<number>(() => new Date().getMonth());
  const [sesiones, setSesiones] = useState<Sesion[] | null>(null);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      setSesiones(null);
      const diasMes = new Date(y, m + 1, 0).getDate();
      const from = `${y}-${pad2(m + 1)}-01`;
      const to = `${y}-${pad2(m + 1)}-${pad2(diasMes)}`;
      const res = await apiFetch(`/api/guia/agenda?from=${from}&to=${to}`);
      if (res.ok) {
        const data: { sesiones: Sesion[] } = await res.json();
        setSesiones(data.sesiones);
      } else {
        setSesiones([]);
      }
    }
    void cargar();
  }, [y, m]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, Sesion[]>();
    for (const s of sesiones ?? []) {
      const lista = mapa.get(s.fecha) ?? [];
      lista.push(s);
      mapa.set(s.fecha, lista);
    }
    return mapa;
  }, [sesiones]);

  const diasMes = new Date(y, m + 1, 0).getDate();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const celdas: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: diasMes }, (_, i) => i + 1),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  function mover(delta: number) {
    const nueva = m + delta;
    if (nueva < 0) {
      setM(11);
      setY((v) => v - 1);
    } else if (nueva > 11) {
      setM(0);
      setY((v) => v + 1);
    } else setM(nueva);
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "68rem", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Mis clases</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <strong style={{ textTransform: "capitalize", minWidth: "9rem", textAlign: "right" }}>
            {MESES[m]} {y}
          </strong>
          <button type="button" onClick={() => mover(-1)} style={{ ...inputStyle, cursor: "pointer" }}>
            ‹
          </button>
          <button type="button" onClick={() => mover(1)} style={{ ...inputStyle, cursor: "pointer" }}>
            ›
          </button>
        </div>
      </div>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", marginTop: "0.3rem" }}>
        Tus sesiones. Haz clic en una para pasar asistencia y registrar cuestionarios.
      </p>

      <div
        style={{ marginTop: "0.75rem", display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px" }}
      >
        {DOW.map((d) => (
          <div
            key={d}
            style={{
              padding: "0.4rem",
              fontSize: "0.78rem",
              fontWeight: 700,
              color: "var(--texto-suave)",
              textAlign: "center",
            }}
          >
            {d}
          </div>
        ))}
        {celdas.map((dia, i) => {
          if (dia === null) {
            return (
              <div
                key={`v${i}`}
                style={{ height: CELDA_ALTO, background: "#fafbfe", borderRadius: "0.4rem" }}
              />
            );
          }
          const fecha = `${y}-${pad2(m + 1)}-${pad2(dia)}`;
          const delDia = (porDia.get(fecha) ?? []).sort((a, b) =>
            a.horaLocal.localeCompare(b.horaLocal),
          );
          const visibles = delDia.slice(0, 2);
          const ocultos = delDia.length - visibles.length;
          return (
            <div
              key={fecha}
              style={{
                height: CELDA_ALTO,
                border: "1px solid #edf0f6",
                borderRadius: "0.4rem",
                padding: "0.3rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
                overflow: "hidden",
              }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--texto-suave)" }}>
                {dia}
              </span>
              {visibles.map((s) => {
                const color = COLOR_CURSO[s.cursoTipo] ?? { bg: "#eceff1", fg: "#37474f" };
                return (
                  <Link
                    key={s.id}
                    href={`/panel/calendario/${s.classroomId}/sesion/${s.id}`}
                    title={`${s.horaLocal} · ${s.salon} · ${s.ocupados}/${s.cupo}`}
                    style={{
                      display: "block",
                      background: color.bg,
                      color: color.fg,
                      borderRadius: "0.35rem",
                      padding: "0.15rem 0.35rem",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      textDecoration: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.horaLocal} {s.tipo === "CLUB" ? "Club " : ""}
                    {s.salon}
                  </Link>
                );
              })}
              {ocultos > 0 && (
                <button
                  type="button"
                  onClick={() => setDiaAbierto(fecha)}
                  style={{
                    alignSelf: "flex-start",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    color: "var(--lgs-azul)",
                    cursor: "pointer",
                  }}
                >
                  +{ocultos} más
                </button>
              )}
            </div>
          );
        })}
      </div>

      {sesiones === null && (
        <p style={{ marginTop: "0.75rem", color: "var(--texto-suave)" }}>Cargando tus clases…</p>
      )}
      {sesiones !== null && sesiones.length === 0 && (
        <p style={{ marginTop: "0.75rem", color: "var(--texto-suave)" }}>
          No tienes sesiones este mes. (Se muestran las de los salones donde eres guía.)
        </p>
      )}

      {diaAbierto !== null && (
        <div
          onClick={() => setDiaAbierto(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "0.9rem",
              padding: "1.25rem",
              width: "100%",
              maxWidth: "34rem",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.05rem", textTransform: "capitalize" }}>
                {fechaBonita(diaAbierto)}
              </h3>
              <button
                type="button"
                onClick={() => setDiaAbierto(null)}
                style={{ ...inputStyle, cursor: "pointer", padding: "0.3rem 0.6rem" }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {(porDia.get(diaAbierto) ?? [])
                .slice()
                .sort((a, b) => a.horaLocal.localeCompare(b.horaLocal))
                .map((s) => (
                  <Link
                    key={s.id}
                    href={`/panel/calendario/${s.classroomId}/sesion/${s.id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "0.6rem",
                      padding: "0.55rem 0.75rem",
                      border: "1px solid #edf0f6",
                      borderRadius: "0.6rem",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span>
                      <strong>{s.horaLocal}</strong> · {s.salon} ({s.cursoTipo === "JUNIOR" ? "Jr" : "Yg"})
                    </span>
                    <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                      {s.ocupados}/{s.cupo} →
                    </span>
                  </Link>
                ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
