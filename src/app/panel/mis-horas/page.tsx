"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Guía › Mis horas y facturas. Las horas las calcula LGS (misma liquidación que los
 * advisors: 1 sesión = 1 h; sin asistentes = ½ h si es por horas). Aquí el guía ve
 * sus horas de cada corte y SUBE su factura o boleta; LGS la revisa y el estado
 * (recibida, devuelta, aceptada, pagada) vuelve aquí. No se muestran valores ($).
 */

interface Corte {
  corte: "MES" | "Q1" | "Q2";
  estado: string;
  requiereFactura: boolean;
  horas: number;
  plazo: string;
  plazoReenvio: string | null;
  horasOk: boolean;
  pagadoEn: string | null;
  factura: { estado: string; comentarioDevolucion: string | null } | null;
}
interface Factura {
  id: string;
  periodo: string;
  corte: "MES" | "Q1" | "Q2";
  nombre: string;
  estado: string;
  motivo: string | null;
  concepto: string | null;
  subidaEn: string;
}
interface Datos {
  liquidacion: { registrada: boolean; tipoContratacion?: string | null; cortes: Corte[] };
  facturas: Factura[];
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const NOMBRE_CORTE: Record<string, string> = {
  MES: "Mes completo",
  Q1: "1ª quincena",
  Q2: "2ª quincena",
};
const ESTADO_CORTE: Record<string, { t: string; c: string }> = {
  ABIERTO: { t: "Pendiente de factura", c: "#6b7280" },
  FACTURA_RECIBIDA: { t: "Factura en revisión", c: "#1565c0" },
  DEVUELTA: { t: "Factura devuelta", c: "#b45309" },
  SIN_FACTURA: { t: "Venció el plazo", c: "#b91c1c" },
  SIN_HORAS: { t: "Sin horas", c: "#9ca3af" },
  VERIFICADO: { t: "Verificada · lista para pago", c: "#15803d" },
  PAGADO: { t: "Pagada", c: "#15803d" },
};
const ESTADO_FACTURA: Record<string, string> = {
  ENVIANDO: "Enviando a revisión",
  RECIBIDA: "En revisión",
  DEVUELTA: "Devuelta",
  RECHAZADA: "No recibida",
  ACEPTADA: "Aceptada",
  PAGADA: "Pagada",
  REEMPLAZADA: "Reemplazada",
};
const SUBIBLE = new Set(["ABIERTO", "FACTURA_RECIBIDA", "DEVUELTA"]);
/** Un corte se puede cobrar en varias facturas; Administración las revisa sumadas. */
const MAX_FACTURAS = 3;
const CONCEPTOS: { v: string; t: string }[] = [
  { v: "NORMAL", t: "Horas normales" },
  { v: "EXAM_INTERN", t: "Exam. Intern." },
  { v: "FESTIVO", t: "Festivos" },
  { v: "OTRO", t: "Otro" },
];
const NOMBRE_CONCEPTO: Record<string, string> = Object.fromEntries(
  CONCEPTOS.map((c) => [c.v, c.t]),
);
const VIVAS = new Set(["ENVIANDO", "RECIBIDA"]);
const botonSec = (ocupado: boolean): CSSProperties => ({
  cursor: ocupado ? "wait" : "pointer",
  opacity: ocupado ? 0.6 : 1,
  background: "white",
  color: "var(--lgs-azul-oscuro)",
  border: "1px solid #cbd5e1",
  fontWeight: 600,
  fontSize: "0.78rem",
  padding: "0.25rem 0.6rem",
  borderRadius: "0.45rem",
});
const fmtH = (n: number) => n.toLocaleString("es", { maximumFractionDigits: 2 });
const fFecha = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const hoy = new Date();
const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

export default function MisHorasPage() {
  const [periodo, setPeriodo] = useState(mesActual);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conceptoSel, setConceptoSel] = useState<Record<string, string>>({});

  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    async function cargar() {
      const res = await apiFetch(`/api/guia/mis-horas?periodo=${periodo}`);
      const c: Datos & { error?: { message?: string } } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDatos(null);
        setError(c.error?.message ?? "No se pudieron cargar tus horas.");
        return;
      }
      setError(null);
      setDatos(c);
    }
    void cargar();
  }, [periodo, recarga]);
  const cambiarPeriodo = (p: string) => {
    setDatos(null);
    setPeriodo(p > mesActual ? mesActual : p);
  };

  async function subir(
    corte: Corte,
    file: File,
    opciones: { modo: "agregar" | "reemplazar"; concepto: string; reemplazaId?: string },
  ) {
    setSubiendo(opciones.reemplazaId ?? corte.corte);
    setAviso(null);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("periodo", periodo);
    fd.set("corte", corte.corte);
    fd.set("concepto", opciones.concepto);
    fd.set("modo", opciones.modo);
    if (opciones.reemplazaId !== undefined) fd.set("reemplazaId", opciones.reemplazaId);
    const res = await apiFetch("/api/guia/mis-horas/factura", { method: "POST", body: fd });
    const c: { factura?: Factura | null; error?: { message?: string } } = await res
      .json()
      .catch(() => ({}));
    setSubiendo(null);
    if (!res.ok) {
      setError(c.error?.message ?? "No se pudo subir la factura.");
      return;
    }
    const f = c.factura;
    setAviso(
      f?.estado === "RECHAZADA"
        ? `La factura no fue recibida: ${f.motivo ?? ""}`
        : f?.estado === "ENVIANDO"
          ? "Factura guardada. Se enviará a revisión en los próximos minutos."
          : "Factura enviada a revisión.",
    );
    setRecarga((n) => n + 1);
  }

  async function quitar(f: Factura) {
    if (!window.confirm(`¿Quitar la factura "${f.nombre}" de este corte?`)) return;
    setSubiendo(f.id);
    setAviso(null);
    setError(null);
    const res = await apiFetch(`/api/guia/mis-horas/factura/${f.id}`, { method: "DELETE" });
    const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
    setSubiendo(null);
    if (!res.ok) {
      setError(c.error?.message ?? "No se pudo quitar la factura.");
      return;
    }
    setAviso("Factura retirada del corte.");
    setRecarga((n) => n + 1);
  }

  const [anio, mes] = periodo.split("-");
  const anios = [String(hoy.getFullYear() - 1), String(hoy.getFullYear())];
  const cortes = datos?.liquidacion.cortes ?? [];
  /** Facturas actuales del corte (sin las reemplazadas o quitadas), de la más antigua a la más nueva. */
  const facturasCorte = (corte: string) =>
    (datos?.facturas ?? [])
      .filter((f) => f.corte === corte && f.estado !== "REEMPLAZADA")
      .reverse();

  return (
    <main style={{ padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem" }}>Mis horas y facturas</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", marginTop: "0.3rem" }}>
        Tus horas de cada corte y tu factura o boleta. La factura se sube por corte (PDF o imagen)
        dentro del plazo; Administración la revisa y aquí verás si fue recibida, devuelta o pagada.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", alignItems: "center" }}>
        <select
          value={mes}
          onChange={(e) => {
            const p = `${anio}-${e.target.value}`;
            cambiarPeriodo(p);
          }}
          aria-label="Mes"
          style={{ padding: "0.4rem 0.6rem", borderRadius: "0.5rem", border: "1px solid #d1d5db" }}
        >
          {MESES.map((m, i) => {
            const v = String(i + 1).padStart(2, "0");
            return (
              <option key={v} value={v} disabled={`${anio}-${v}` > mesActual}>
                {m}
              </option>
            );
          })}
        </select>
        <select
          value={anio}
          onChange={(e) => {
            const p = `${e.target.value}-${mes}`;
            cambiarPeriodo(p);
          }}
          aria-label="Año"
          style={{ padding: "0.4rem 0.6rem", borderRadius: "0.5rem", border: "1px solid #d1d5db" }}
        >
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {error !== null && (
        <p style={{ marginTop: "1rem", color: "#b91c1c", fontSize: "0.9rem" }}>{error}</p>
      )}
      {aviso !== null && (
        <p style={{ marginTop: "1rem", color: "#15803d", fontSize: "0.9rem" }}>{aviso}</p>
      )}

      {datos === null && error === null ? (
        <p style={{ marginTop: "1.5rem", color: "var(--texto-suave)" }}>Cargando…</p>
      ) : datos !== null && !datos.liquidacion.registrada ? (
        <p style={{ marginTop: "1.5rem", color: "var(--texto-suave)" }}>
          Aún no estás registrado en la liquidación de horas. Consulta con Administración.
        </p>
      ) : datos !== null ? (
        <section
          style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {cortes.map((c) => {
            const e = ESTADO_CORTE[c.estado] ?? { t: c.estado, c: "#6b7280" };
            const plazo =
              c.plazoReenvio !== null && c.plazoReenvio > c.plazo ? c.plazoReenvio : c.plazo;
            const lista = facturasCorte(c.corte);
            const vivas = lista.filter((x) => VIVAS.has(x.estado)).length;
            const puedeSubir = c.requiereFactura && SUBIBLE.has(c.estado);
            const puedeAgregar = puedeSubir && vivas < MAX_FACTURAS;
            const concepto = conceptoSel[c.corte] ?? (vivas === 0 ? "NORMAL" : "EXAM_INTERN");
            const rechazada = lista.find((x) => x.estado === "RECHAZADA") ?? null;
            return (
              <div
                key={c.corte}
                style={{
                  border: "1px solid #e3e7f0",
                  borderRadius: "0.8rem",
                  padding: "1rem 1.1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ minWidth: "12rem" }}>
                    <strong style={{ fontSize: "1.02rem" }}>
                      {NOMBRE_CORTE[c.corte]} · {MESES[Number(mes) - 1]} {anio}
                    </strong>
                    <div style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
                      <b style={{ color: "var(--lgs-azul-oscuro)", fontSize: "1.1rem" }}>
                        {fmtH(c.horas)} h
                      </b>
                      {c.requiereFactura ? ` · factura hasta el ${fFecha(plazo)}` : ""}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: e.c,
                      border: `1px solid ${e.c}`,
                      borderRadius: "999px",
                      padding: "0.15rem 0.6rem",
                    }}
                  >
                    {e.t}
                  </span>
                </div>
                {lista.length > 0 && (
                  <div
                    style={{
                      marginTop: "0.6rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.35rem",
                    }}
                  >
                    {lista.map((f) => (
                      <div
                        key={f.id}
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: "0.5rem",
                          fontSize: "0.85rem",
                          background: "#f8fafc",
                          border: "1px solid #eef0f5",
                          borderRadius: "0.5rem",
                          padding: "0.35rem 0.6rem",
                        }}
                      >
                        <span style={{ fontWeight: 700, color: "var(--lgs-azul-oscuro)" }}>
                          {NOMBRE_CONCEPTO[f.concepto ?? "NORMAL"] ?? f.concepto}
                        </span>
                        <a
                          href={`/api/guia/mis-horas/factura/${f.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {f.nombre}
                        </a>
                        <span style={{ color: "var(--texto-suave)" }}>
                          · {ESTADO_FACTURA[f.estado] ?? f.estado} · subida el {fFecha(f.subidaEn)}
                        </span>
                        {puedeSubir && VIVAS.has(f.estado) && (
                          <span style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
                            <label style={botonSec(subiendo !== null)}>
                              {subiendo === f.id ? "Procesando…" : "Reemplazar"}
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png,image/webp"
                                style={{ display: "none" }}
                                disabled={subiendo !== null}
                                onChange={(ev) => {
                                  const file = ev.target.files?.[0];
                                  if (file !== undefined) {
                                    void subir(c, file, {
                                      modo: "reemplazar",
                                      concepto: f.concepto ?? "NORMAL",
                                      reemplazaId: f.id,
                                    });
                                  }
                                  ev.target.value = "";
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              disabled={subiendo !== null}
                              onClick={() => void quitar(f)}
                              style={{
                                ...botonSec(subiendo !== null),
                                color: "#b91c1c",
                                borderColor: "#fca5a5",
                              }}
                            >
                              Quitar
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {puedeAgregar && (
                  <div
                    style={{
                      marginTop: "0.6rem",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <select
                      value={concepto}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConceptoSel((m) => ({ ...m, [c.corte]: v }));
                      }}
                      aria-label="Concepto de la factura"
                      style={{
                        padding: "0.35rem 0.5rem",
                        borderRadius: "0.5rem",
                        border: "1px solid #d1d5db",
                        fontSize: "0.82rem",
                      }}
                    >
                      {CONCEPTOS.map((k) => (
                        <option key={k.v} value={k.v}>
                          {k.t}
                        </option>
                      ))}
                    </select>
                    <label
                      style={{
                        cursor: subiendo !== null ? "wait" : "pointer",
                        opacity: subiendo !== null ? 0.6 : 1,
                        background: "var(--lgs-azul)",
                        color: "white",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        padding: "0.45rem 0.9rem",
                        borderRadius: "0.55rem",
                      }}
                    >
                      {subiendo === c.corte
                        ? "Subiendo y revisando…"
                        : vivas > 0
                          ? "Agregar otra factura"
                          : c.estado === "DEVUELTA"
                            ? "Subir factura corregida"
                            : "Subir factura"}
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        disabled={subiendo !== null}
                        onChange={(ev) => {
                          const file = ev.target.files?.[0];
                          if (file !== undefined) {
                            void subir(c, file, {
                              modo: vivas > 0 ? "agregar" : "reemplazar",
                              concepto,
                            });
                          }
                          ev.target.value = "";
                        }}
                      />
                    </label>
                    <span style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>
                      Hasta {MAX_FACTURAS} facturas por corte (p. ej. horas normales y Exam.
                      Intern.): se revisan sumadas contra tus horas.
                    </span>
                  </div>
                )}
                {c.estado === "DEVUELTA" && c.factura?.comentarioDevolucion != null && (
                  <div
                    style={{
                      marginTop: "0.6rem",
                      fontSize: "0.85rem",
                      background: "#fffbeb",
                      border: "1px solid #fcd34d",
                      borderRadius: "0.5rem",
                      padding: "0.5rem 0.75rem",
                      color: "#92400e",
                    }}
                  >
                    Administración la devolvió: “{c.factura.comentarioDevolucion}”. Sube la
                    corregida antes del {fFecha(plazo)}.
                  </div>
                )}
                {rechazada !== null && rechazada.motivo !== null && (
                  <div style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "#b91c1c" }}>
                    No fue recibida: {rechazada.motivo}
                  </div>
                )}
                {c.estado === "SIN_FACTURA" && (
                  <div style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "#b91c1c" }}>
                    Venció el plazo para subir la factura. Comunícate con Administración.
                  </div>
                )}
                {c.pagadoEn !== null && (
                  <div style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "#15803d" }}>
                    Pagada el {fFecha(c.pagadoEn)}.
                  </div>
                )}
              </div>
            );
          })}
          {cortes.length === 0 && (
            <p style={{ color: "var(--texto-suave)" }}>No hay horas registradas en este mes.</p>
          )}

          {datos.facturas.length > 0 && (
            <details style={{ marginTop: "0.5rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 700 }}>
                Historial de facturas del mes ({datos.facturas.length})
              </summary>
              <table
                style={{
                  width: "100%",
                  marginTop: "0.5rem",
                  fontSize: "0.82rem",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--texto-suave)" }}>
                    <th style={{ padding: "0.3rem" }}>Subida</th>
                    <th style={{ padding: "0.3rem" }}>Corte</th>
                    <th style={{ padding: "0.3rem" }}>Archivo</th>
                    <th style={{ padding: "0.3rem" }}>Estado</th>
                    <th style={{ padding: "0.3rem" }}>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.facturas.map((f) => (
                    <tr key={f.id} style={{ borderTop: "1px solid #eef0f5" }}>
                      <td style={{ padding: "0.3rem" }}>{fFecha(f.subidaEn)}</td>
                      <td style={{ padding: "0.3rem" }}>
                        {NOMBRE_CORTE[f.corte]}
                        {f.concepto !== null
                          ? ` · ${NOMBRE_CONCEPTO[f.concepto] ?? f.concepto}`
                          : ""}
                      </td>
                      <td style={{ padding: "0.3rem" }}>
                        <a
                          href={`/api/guia/mis-horas/factura/${f.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {f.nombre}
                        </a>
                      </td>
                      <td style={{ padding: "0.3rem" }}>{ESTADO_FACTURA[f.estado] ?? f.estado}</td>
                      <td style={{ padding: "0.3rem" }}>{f.motivo ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </section>
      ) : null}
    </main>
  );
}
