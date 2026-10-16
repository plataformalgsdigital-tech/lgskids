"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { referenciaHoraria } from "@/ui/hora-paises";

/**
 * AGENDAR (Academic management › 3). Tipo → fecha → lo que hay ese día (llenos y
 * choques a la vista) → RESUMEN → confirmar. Si está lleno, el resumen avisa el
 * sobrecupo y solo quien tiene "Autorizar sobrecupo" puede aceptarlo; el
 * servidor vuelve a comprobar todo (regla, cupo con bloqueo, choque y permiso).
 */

interface Opcion {
  tipo: string;
  id: string;
  startsAt: string;
  duracionMin: number;
  salon: string;
  campania: string | null;
  guia: string | null;
  limite: number;
  ocupados: number;
  lleno: boolean;
  enSuLista: boolean;
  choque: string | null;
  timezone: string | null;
}
interface Agendado {
  id: string;
  tipo: string;
  startsAt: string;
  salon: string;
  vigente: boolean;
}
interface Datos {
  agendados: Agendado[];
  welcome: { welcomeId: string; startsAt: string; guia: string } | null;
  tipos: { valor: string; etiqueta: string }[];
  puedeSobrecupo: boolean;
  opciones?: Opcion[];
}

const boton: CSSProperties = {
  padding: "0.45rem 0.9rem",
  borderRadius: "0.6rem",
  border: "1px solid #d8dce6",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.85rem",
};
const chip = (bg: string, fg: string): CSSProperties => ({
  background: bg,
  color: fg,
  borderRadius: "1rem",
  padding: "0.1rem 0.5rem",
  fontSize: "0.72rem",
  fontWeight: 800,
});

function hoyLocal(): string {
  const d = new Date();
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fechaLarga(instante: string, zona: string | null): string {
  const f = new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(zona !== null && { timeZone: zona }),
  }).format(new Date(instante));
  return f.charAt(0).toUpperCase() + f.slice(1);
}

function horas(instante: string): string {
  const h = referenciaHoraria(instante);
  return `${h.chile} Chile · ${h.colombia} Col/Ecu/Perú`;
}

export function AgendarPanel(props: { childPersonId: string; nombre: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [tipo, setTipo] = useState("");
  const [fecha, setFecha] = useState(hoyLocal());
  const [opciones, setOpciones] = useState<Opcion[] | null>(null);
  const [elegida, setElegida] = useState<Opcion | null>(null);
  const [autorizo, setAutorizo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const base = `/api/contracts/ninos/${props.childPersonId}/agenda`;

  const cargar = useCallback(async () => {
    const consulta = tipo !== "" ? `?tipo=${tipo}&fecha=${fecha}` : "";
    const res = await apiFetch(`${base}${consulta}`);
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar la agenda del niño.");
      return;
    }
    const d = (await res.json()) as Datos;
    setDatos(d);
    setOpciones(d.opciones ?? null);
  }, [base, tipo, fecha]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  const etiquetaTipo = (t: string) => datos?.tipos.find((x) => x.valor === t)?.etiqueta ?? t;

  async function confirmar() {
    if (elegida === null) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: elegida.tipo,
          id: elegida.id,
          autorizarSobrecupo: elegida.lleno && autorizo,
        }),
      });
      if (!res.ok) {
        const c: {
          error?: {
            message?: string;
            details?: { tipo?: string; limite?: number; ocupados?: number };
          };
        } = await res.json().catch(() => ({}));
        const det = c.error?.details;
        if (det?.tipo === "sobrecupo") {
          // Se llenó mientras se miraba: el resumen pasa a pedir la autorización.
          setElegida({
            ...elegida,
            lleno: true,
            limite: det.limite ?? elegida.limite,
            ocupados: det.ocupados ?? elegida.ocupados,
          });
          setError("Se llenó mientras lo revisabas: confirma el sobrecupo o elige otro horario.");
          return;
        }
        setError(c.error?.message ?? "No se pudo agendar.");
        return;
      }
      setAviso(
        `✓ Agendado: ${etiquetaTipo(elegida.tipo)} · ${fechaLarga(elegida.startsAt, elegida.timezone)} · ${horas(elegida.startsAt)}`,
      );
      setElegida(null);
      setAutorizo(false);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar(a: Agendado) {
    if (!window.confirm(`¿Cancelar ${etiquetaTipo(a.tipo)} del ${fechaLarga(a.startsAt, null)}?`)) {
      return;
    }
    const res = await apiFetch(`${base}/${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("No se pudo cancelar.");
      return;
    }
    await cargar();
  }

  if (datos === null) {
    return error !== null ? (
      <p role="alert" style={{ color: "#c62828", margin: 0 }}>
        {error}
      </p>
    ) : (
      <p style={{ margin: 0 }}>Cargando…</p>
    );
  }

  // ── Resumen antes de confirmar ──────────────────────────────────────────
  if (elegida !== null) {
    const quedaria = elegida.ocupados + 1;
    const exceso = elegida.limite > 0 ? Math.max(0, quedaria - elegida.limite) : 0;
    const bloqueado = elegida.lleno && (!datos.puedeSobrecupo || !autorizo);
    const fila = (k: string, v: string) => (
      <tr>
        <th
          style={{
            textAlign: "left",
            padding: "0.3rem 0.6rem",
            color: "var(--texto-suave)",
            fontWeight: 600,
          }}
        >
          {k}
        </th>
        <td style={{ padding: "0.3rem 0.6rem" }}>{v}</td>
      </tr>
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Resumen: confirma antes de agendar</h3>
        <table style={{ borderCollapse: "collapse", fontSize: "0.88rem" }}>
          <tbody>
            {fila("Niño", props.nombre)}
            {fila("Qué", etiquetaTipo(elegida.tipo))}
            {fila("Fecha", fechaLarga(elegida.startsAt, elegida.timezone))}
            {fila("Hora", horas(elegida.startsAt))}
            {fila("Dónde", elegida.salon === "—" ? "Welcome (sala del guía)" : elegida.salon)}
            {fila("Guía", elegida.guia ?? "—")}
            {fila(
              "Cupo",
              elegida.limite > 0
                ? `${String(elegida.ocupados)} de ${String(elegida.limite)} → quedaría ${String(quedaria)} de ${String(elegida.limite)}`
                : `${String(elegida.ocupados)} (sin límite)`,
            )}
          </tbody>
        </table>
        {elegida.lleno && (
          <div
            role="alert"
            style={{
              border: "1px solid #ffb74d",
              background: "#fff8e1",
              borderRadius: "0.6rem",
              padding: "0.7rem 0.9rem",
              fontSize: "0.88rem",
            }}
          >
            <strong>⚠ Sobrecupo.</strong> Está lleno: agendarlo lo deja{" "}
            <strong>{String(exceso)}</strong> {exceso === 1 ? "lugar" : "lugares"} por encima del
            cupo.
            {datos.puedeSobrecupo ? (
              <label
                style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", fontWeight: 700 }}
              >
                <input
                  type="checkbox"
                  checked={autorizo}
                  onChange={(e) => setAutorizo(e.target.checked)}
                />
                Autorizo el sobrecupo
              </label>
            ) : (
              <div style={{ marginTop: "0.4rem" }}>
                No tienes el permiso <em>Autorizar sobrecupo</em>: elige otro horario o pídeselo a
                administración.
              </div>
            )}
          </div>
        )}
        {error !== null && (
          <p role="alert" style={{ margin: 0, color: "#c62828", fontWeight: 600 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
          <button
            type="button"
            style={boton}
            disabled={ocupado}
            onClick={() => {
              setElegida(null);
              setError(null);
            }}
          >
            ← Volver
          </button>
          <button
            type="button"
            disabled={ocupado || bloqueado}
            onClick={() => void confirmar()}
            style={{
              ...boton,
              border: "none",
              background: "var(--lgs-verde)",
              color: "#1b2a10",
              opacity: ocupado || bloqueado ? 0.5 : 1,
            }}
          >
            {ocupado ? "Agendando…" : "✓ Confirmar y agendar"}
          </button>
        </div>
      </div>
    );
  }

  // ── Elegir ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
      {aviso !== null && (
        <p style={{ margin: 0, color: "#1b5e20", fontWeight: 700, fontSize: "0.88rem" }}>{aviso}</p>
      )}
      {(datos.welcome !== null || datos.agendados.length > 0) && (
        <div
          style={{ border: "1px solid #e3e7f0", borderRadius: "0.6rem", padding: "0.6rem 0.8rem" }}
        >
          <div style={{ fontWeight: 800, fontSize: "0.8rem", color: "var(--texto-suave)" }}>
            YA AGENDADO
          </div>
          {datos.welcome !== null && (
            <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              👋 Welcome · {fechaLarga(datos.welcome.startsAt, null)} ·{" "}
              {horas(datos.welcome.startsAt)}
            </div>
          )}
          {datos.agendados.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                fontSize: "0.85rem",
                marginTop: "0.25rem",
                flexWrap: "wrap",
              }}
            >
              <span>
                {etiquetaTipo(a.tipo)} · {fechaLarga(a.startsAt, null)} · {horas(a.startsAt)} ·{" "}
                {a.salon}
              </span>
              {!a.vigente && (
                <span style={chip("#ffebee", "#b71c1c")}>la sesión ya no existe a esa hora</span>
              )}
              <button
                type="button"
                style={{ ...boton, padding: "0.15rem 0.5rem", fontSize: "0.75rem" }}
                onClick={() => void cancelar(a)}
              >
                Cancelar
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <div
          style={{
            fontWeight: 700,
            fontSize: "0.82rem",
            color: "var(--texto-suave)",
            marginBottom: "0.3rem",
          }}
        >
          1. Tipo de evento
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {datos.tipos.map((t) => (
            <button
              key={t.valor}
              type="button"
              onClick={() => {
                setTipo(t.valor);
                setAviso(null);
                setError(null);
              }}
              style={{
                ...boton,
                borderColor: tipo === t.valor ? "var(--lgs-azul)" : "#d8dce6",
                background: tipo === t.valor ? "#e8f1fd" : "white",
              }}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.3rem",
          fontSize: "0.82rem",
          maxWidth: "14rem",
        }}
      >
        <span style={{ fontWeight: 700, color: "var(--texto-suave)" }}>2. Fecha</span>
        <input
          type="date"
          value={fecha}
          min={hoyLocal()}
          onChange={(e) => setFecha(e.target.value)}
          style={{
            padding: "0.45rem 0.6rem",
            borderRadius: "0.5rem",
            border: "1.5px solid #d8dce6",
          }}
        />
      </label>

      {tipo !== "" && (
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "0.82rem",
              color: "var(--texto-suave)",
              marginBottom: "0.3rem",
            }}
          >
            3. {etiquetaTipo(tipo)} ese día
          </div>
          {error !== null && (
            <p role="alert" style={{ margin: 0, color: "#c62828", fontWeight: 600 }}>
              {error}
            </p>
          )}
          {opciones === null ? (
            <p style={{ margin: 0, fontSize: "0.85rem" }}>Cargando…</p>
          ) : opciones.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
              No hay {etiquetaTipo(tipo).toLowerCase()} para este niño ese día.
              {tipo === "REGULAR" && " (Solo clases de otros salones de su misma campaña y curso.)"}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {opciones.map((o) => {
                const deshabilitada = o.enSuLista || o.choque !== null;
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={deshabilitada}
                    onClick={() => {
                      setElegida(o);
                      setAutorizo(false);
                      setError(null);
                    }}
                    style={{
                      ...boton,
                      textAlign: "left",
                      fontWeight: 400,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "0.6rem",
                      flexWrap: "wrap",
                      opacity: deshabilitada ? 0.6 : 1,
                      cursor: deshabilitada ? "not-allowed" : "pointer",
                      borderColor: o.lleno ? "#ffb74d" : "#d8dce6",
                    }}
                  >
                    <span>
                      <strong>{horas(o.startsAt)}</strong> · {o.salon === "—" ? "Welcome" : o.salon}
                      {o.guia !== null && ` · ${o.guia}`}
                      {o.campania !== null && (
                        <span style={{ color: "var(--texto-suave)" }}> · {o.campania}</span>
                      )}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        gap: "0.3rem",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: "0.78rem" }}>
                        👥 {String(o.ocupados)}/{o.limite > 0 ? String(o.limite) : "∞"}
                      </span>
                      {o.lleno && <span style={chip("#fff3e0", "#e65100")}>LLENO</span>}
                      {o.enSuLista && (
                        <span style={chip("#eceff1", "#37474f")}>✓ ya en su lista</span>
                      )}
                      {o.choque !== null && (
                        <span style={chip("#ffebee", "#b71c1c")}>⚠ choca con {o.choque}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
