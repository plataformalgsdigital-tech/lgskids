"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { Bandera, NOMBRE_PAIS } from "@/ui/Bandera";
import { ConOpcion } from "@/ui/ConOpcion";
import { SoloSi } from "@/ui/SoloSi";

/**
 * Feriados (Académica › Sesiones). Muestra los feriados del mes, con la bandera de cada
 * país que cubren, y deja agregar feriados PROPIOS (una fecha, uno o varios países,
 * nombre obligatorio). Un feriado propio rige como los de siempre: los salones de esos
 * países no dictan ese día y la sesión se agrega al final. Antes de guardar se ve el
 * impacto; un salón cuya última sesión pasaría del contrato de un niño NO se toca y
 * queda pendiente. Los niños de otro país los gestiona Gestión Festivos.
 */

interface Feriado {
  pais: string;
  fecha: string;
  nombre: string;
  fuente: string;
  propio: boolean;
}
interface Conflicto {
  nombre: string;
  documento: string;
  finContrato: string;
}
interface SalonImpacto {
  id: string;
  nombre: string;
  pais: string;
  curso: string;
  campania: string;
  quita: string[];
  agrega: string[];
  finActual: string | null;
  finNuevo: string | null;
  conflictos: Conflicto[];
  bloqueo: string | null;
  aplicable: boolean;
}
interface Pendiente extends SalonImpacto {
  motivo: string;
}
interface Previo {
  accion: "AGREGAR" | "QUITAR";
  fecha: string;
  paises: string[];
  paisesYaTienen: string[];
  salones: SalonImpacto[];
  ninosOtroPais: number;
}
interface Resultado {
  fecha: string;
  paises: string[];
  regenerados: { id: string; nombre: string }[];
  pendientes: { id: string; nombre: string; motivo: string; conflictos: Conflicto[] }[];
}

const PAISES = ["CL", "CO", "EC", "PE"] as const;
const CURSO: Record<string, string> = { JUNIOR: "Junior", YOUNGSTER: "Youngster" };

const btn: CSSProperties = {
  padding: "0.4rem 0.8rem",
  borderRadius: "0.5rem",
  border: "1px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.82rem",
  cursor: "pointer",
};
const btnPrimario: CSSProperties = {
  ...btn,
  border: "none",
  background: "var(--lgs-azul)",
  color: "white",
};
const input: CSSProperties = {
  padding: "0.45rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.88rem",
  width: "100%",
  boxSizing: "border-box",
};
const caja: CSSProperties = {
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  background: "white",
};

function isoLocal(d: Date): string {
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fechaLarga(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function corta(fecha: string | null): string {
  if (fecha === null) return "—";
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function mensaje(res: Response, porDefecto: string): Promise<string> {
  try {
    const d = (await res.json()) as { error?: { message?: string } };
    return d.error?.message ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

function Banderas({ paises }: { paises: string[] }) {
  return (
    <span style={{ display: "inline-flex", gap: "0.35rem", flexWrap: "wrap" }}>
      {paises.map((p) => (
        <Bandera key={p} pais={p} conNombre alto={15} />
      ))}
    </span>
  );
}

function ListaConflictos({ conflictos }: { conflictos: Conflicto[] }) {
  if (conflictos.length === 0) return null;
  return (
    <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem", fontSize: "0.78rem" }}>
      {conflictos.slice(0, 8).map((c) => (
        <li key={`${c.documento}-${c.nombre}`}>
          {c.nombre} ({c.documento}) · su contrato termina el {corta(c.finContrato)}
        </li>
      ))}
      {conflictos.length > 8 && <li>… y {String(conflictos.length - 8)} más</li>}
    </ul>
  );
}

function FilaSalon({ s }: { s: SalonImpacto }) {
  return (
    <div
      style={{
        padding: "0.6rem 0.75rem",
        borderTop: "1px solid #eef0f6",
        background: s.aplicable ? "white" : "#fff7e6",
      }}
    >
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <Bandera pais={s.pais} alto={13} />
        <strong>
          {CURSO[s.curso] ?? s.curso} · {s.nombre}
        </strong>
        <span style={{ color: "#667" }}>{s.campania}</span>
      </div>
      <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
        {s.quita.length > 0 && <>Quita: {s.quita.map(corta).join(", ")}. </>}
        {s.agrega.length > 0 && <>Agrega: {s.agrega.map(corta).join(", ")}. </>}
        Última sesión: {corta(s.finActual)} → <strong>{corta(s.finNuevo)}</strong>
      </div>
      {s.bloqueo !== null && (
        <div style={{ fontSize: "0.8rem", color: "#9a5b00", marginTop: "0.25rem" }}>
          ⚠ {s.bloqueo}
        </div>
      )}
      {s.conflictos.length > 0 && (
        <div style={{ fontSize: "0.8rem", color: "#9a5b00", marginTop: "0.25rem" }}>
          ⚠ La última sesión pasaría del final del contrato de {String(s.conflictos.length)}{" "}
          niño(s). Este salón NO se tocará.
          <ListaConflictos conflictos={s.conflictos} />
        </div>
      )}
    </div>
  );
}

/** Agregar (con previo) o quitar (con previo) un feriado propio. */
function ModalFeriado(props: {
  accion: "AGREGAR" | "QUITAR";
  inicial: { fecha: string; nombre: string; paises: string[] };
  manana: string;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [fecha, setFecha] = useState(props.inicial.fecha);
  const [nombre, setNombre] = useState(props.inicial.nombre);
  const [paises, setPaises] = useState<string[]>(props.inicial.paises);
  const [previo, setPrevio] = useState<Previo | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const agregar = props.accion === "AGREGAR";

  const alternar = (p: string) => {
    setPrevio(null);
    setPaises((a) => (a.includes(p) ? a.filter((x) => x !== p) : [...a, p]));
  };

  async function revisar() {
    setError(null);
    if (agregar && nombre.trim().length < 3) {
      setError("El nombre del feriado es obligatorio (mínimo 3 caracteres).");
      return;
    }
    if (paises.length === 0) {
      setError("Marca al menos un país.");
      return;
    }
    setOcupado(true);
    const res = await apiFetch("/api/scheduling/feriados/previo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: props.accion, fecha, paises }),
    });
    setOcupado(false);
    if (!res.ok) {
      setError(await mensaje(res, "No se pudo revisar el impacto."));
      return;
    }
    setPrevio((await res.json()) as Previo);
  }

  async function confirmar() {
    setError(null);
    setOcupado(true);
    const res = await apiFetch("/api/scheduling/feriados", {
      method: agregar ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(agregar ? { fecha, nombre: nombre.trim(), paises } : { fecha, paises }),
    });
    setOcupado(false);
    if (!res.ok) {
      setError(await mensaje(res, "No se pudo guardar."));
      return;
    }
    setResultado((await res.json()) as Resultado);
    props.onHecho();
  }

  const sinEfecto = previo !== null && previo.salones.length === 0;
  const nuevos = previo?.paises.filter((p) => !previo.paisesYaTienen.includes(p)) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,40,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 50,
      }}
    >
      <div
        style={{
          ...caja,
          width: "min(46rem, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "1.2rem",
        }}
      >
        <h2 style={{ margin: 0 }}>
          {agregar ? "Agregar feriado propio" : "Quitar feriado propio"}
        </h2>

        {resultado === null ? (
          <>
            <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.9rem" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                Fecha
                <input
                  type="date"
                  style={input}
                  value={fecha}
                  min={props.manana}
                  disabled={!agregar}
                  onChange={(e) => {
                    setPrevio(null);
                    setFecha(e.target.value);
                  }}
                />
              </label>
              {agregar && (
                <label style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                  Nombre del feriado (obligatorio)
                  <input
                    style={input}
                    value={nombre}
                    maxLength={100}
                    placeholder="Ej.: Día de la institución"
                    onChange={(e) => setNombre(e.target.value)}
                  />
                </label>
              )}
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                  Países que cubre
                </div>
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                  {PAISES.map((p) => (
                    <label
                      key={p}
                      style={{
                        display: "inline-flex",
                        gap: "0.4rem",
                        alignItems: "center",
                        padding: "0.35rem 0.6rem",
                        border: `1.5px solid ${paises.includes(p) ? "var(--lgs-azul)" : "#d8dce6"}`,
                        borderRadius: "0.6rem",
                        cursor: agregar ? "pointer" : "default",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={paises.includes(p)}
                        disabled={!agregar}
                        onChange={() => alternar(p)}
                      />
                      <Bandera pais={p} conNombre alto={15} />
                    </label>
                  ))}
                  {agregar && (
                    <button
                      type="button"
                      style={btn}
                      onClick={() => {
                        setPrevio(null);
                        setPaises(paises.length === PAISES.length ? [] : [...PAISES]);
                      }}
                    >
                      {paises.length === PAISES.length ? "Quitar todos" : "Todos los países"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {previo !== null && (
              <div style={{ marginTop: "1rem" }}>
                <h3 style={{ margin: "0 0 0.4rem" }}>Impacto</h3>
                {previo.paisesYaTienen.length > 0 && (
                  <p style={{ margin: "0 0 0.4rem", fontSize: "0.82rem", color: "#9a5b00" }}>
                    Ya es feriado en{" "}
                    {previo.paisesYaTienen.map((p) => NOMBRE_PAIS[p] ?? p).join(", ")}: esos países
                    no se tocan.
                  </p>
                )}
                {agregar && nuevos.length === 0 ? (
                  <p style={{ margin: 0 }}>Esa fecha ya es feriado en todos los países marcados.</p>
                ) : sinEfecto ? (
                  <p style={{ margin: 0, fontSize: "0.85rem" }}>
                    Ningún salón tiene clases ese día en esos países: se guarda y no mueve nada.
                  </p>
                ) : (
                  <div style={{ ...caja, overflow: "hidden" }}>
                    {previo.salones.map((s) => (
                      <FilaSalon key={s.id} s={s} />
                    ))}
                  </div>
                )}
                {agregar && previo.ninosOtroPais > 0 && (
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem" }}>
                    {String(previo.ninosOtroPais)} niño(s) de otro país quedan sin clase ese día:
                    los gestionas en{" "}
                    <Link href="/panel/sesiones/gestion-festivos">Gestión Festivos</Link>.
                  </p>
                )}
                {previo.salones.some((s) => !s.aplicable) && (
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#9a5b00" }}>
                    El feriado se guarda para todos, pero los salones marcados en ámbar quedan
                    PENDIENTES: su calendario no cambia hasta que se resuelva y se regeneren.
                  </p>
                )}
              </div>
            )}

            {error !== null && (
              <p
                role="alert"
                style={{ color: "#b3261e", marginTop: "0.7rem", fontSize: "0.85rem" }}
              >
                {error}
              </p>
            )}

            <div
              style={{
                display: "flex",
                gap: "0.6rem",
                justifyContent: "flex-end",
                marginTop: "1rem",
              }}
            >
              <button type="button" style={btn} onClick={props.onClose} disabled={ocupado}>
                Cancelar
              </button>
              {previo === null ? (
                <button
                  type="button"
                  style={btnPrimario}
                  onClick={() => void revisar()}
                  disabled={ocupado}
                >
                  {ocupado ? "Revisando…" : "Revisar impacto"}
                </button>
              ) : (
                <button
                  type="button"
                  style={btnPrimario}
                  onClick={() => void confirmar()}
                  disabled={ocupado || (agregar && nuevos.length === 0)}
                >
                  {ocupado ? "Guardando…" : agregar ? "Confirmar y guardar" : "Confirmar y quitar"}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p style={{ marginTop: "0.9rem" }}>
              {agregar ? "Feriado guardado" : "Feriado quitado"} para{" "}
              <strong>{fechaLarga(resultado.fecha)}</strong> (
              {resultado.paises.map((p) => NOMBRE_PAIS[p] ?? p).join(", ")}).
            </p>
            <p style={{ margin: "0.3rem 0" }}>
              Salones ajustados: <strong>{String(resultado.regenerados.length)}</strong>
              {resultado.regenerados.length > 0 &&
                ` (${resultado.regenerados.map((s) => s.nombre).join(", ")})`}
            </p>
            {resultado.pendientes.length > 0 && (
              <div style={{ ...caja, padding: "0.7rem", background: "#fff7e6" }}>
                <strong>Salones pendientes ({String(resultado.pendientes.length)})</strong>
                {resultado.pendientes.map((p) => (
                  <div key={p.id} style={{ marginTop: "0.4rem", fontSize: "0.82rem" }}>
                    {p.nombre}: {p.motivo}
                    <ListaConflictos conflictos={p.conflictos} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button type="button" style={btnPrimario} onClick={props.onClose}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FeriadosContenido() {
  const [hoy] = useState(() => isoLocal(new Date()));
  const [manana] = useState(() => isoLocal(new Date(Date.now() + 86_400_000)));
  const [mes, setMes] = useState(() => hoy.slice(0, 7));
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [puedeCrear, setPuedeCrear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState<{
    accion: "AGREGAR" | "QUITAR";
    inicial: { fecha: string; nombre: string; paises: string[] };
  } | null>(null);
  const [regenerando, setRegenerando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const res = await apiFetch(`/api/scheduling/feriados?mes=${mes}`);
      if (!vigente) return;
      if (!res.ok) {
        setError(await mensaje(res, "No se pudieron cargar los feriados."));
        setCargando(false);
        return;
      }
      const d = (await res.json()) as {
        feriados: Feriado[];
        pendientes: Pendiente[];
        puedeCrear: boolean;
      };
      if (!vigente) return;
      setError(null);
      setFeriados(d.feriados);
      setPendientes(d.pendientes);
      setPuedeCrear(d.puedeCrear);
      setCargando(false);
    })();
    return () => {
      vigente = false;
    };
  }, [mes, recarga]);

  const cambiarMes = (delta: number) => {
    const [y, m] = mes.split("-").map(Number) as [number, number];
    const d = new Date(y, m - 1 + delta, 1);
    setCargando(true);
    setMes(`${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  // Un mismo día y nombre puede cubrir varios países: se muestran juntos.
  const grupos = useMemo(() => {
    const mapa = new Map<
      string,
      { fecha: string; nombre: string; propio: boolean; paises: string[] }
    >();
    for (const f of feriados) {
      const clave = `${f.fecha}|${f.nombre}|${String(f.propio)}`;
      const g = mapa.get(clave) ?? {
        fecha: f.fecha,
        nombre: f.nombre,
        propio: f.propio,
        paises: [],
      };
      g.paises.push(f.pais);
      mapa.set(clave, g);
    }
    return [...mapa.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [feriados]);

  async function regenerar(id: string) {
    setRegenerando(id);
    setAviso(null);
    const res = await apiFetch(`/api/scheduling/feriados/salon/${id}`, { method: "POST" });
    setRegenerando(null);
    if (!res.ok) {
      setAviso(await mensaje(res, "No se pudo regenerar el salón."));
      return;
    }
    setAviso("Calendario del salón actualizado.");
    recargar();
  }

  const etiquetaMes = new Date(`${mes}-01T12:00:00`).toLocaleDateString("es", {
    month: "long",
    year: "numeric",
  });

  return (
    <div style={{ padding: "1.2rem", maxWidth: "62rem" }}>
      <Link href="/panel/sesiones" style={{ fontSize: "0.85rem" }}>
        ← Volver a Sesiones
      </Link>
      <h1 style={{ margin: "0.4rem 0 0.2rem" }}>Feriados</h1>
      <p style={{ margin: "0 0 1rem", color: "#556" }}>
        Los feriados que ya rigen por país y los propios que agregues. Un feriado propio vale solo
        para su fecha: los salones de esos países no dictan ese día y la sesión se agrega al final
        del curso, sin pasar del contrato de los niños.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          flexWrap: "wrap",
          marginBottom: "0.8rem",
        }}
      >
        <button type="button" style={btn} onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
          ◀
        </button>
        <strong style={{ minWidth: "10rem", textAlign: "center", textTransform: "capitalize" }}>
          {etiquetaMes}
        </strong>
        <button type="button" style={btn} onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
          ▶
        </button>
        {mes !== hoy.slice(0, 7) && (
          <button
            type="button"
            style={btn}
            onClick={() => {
              setCargando(true);
              setMes(hoy.slice(0, 7));
            }}
          >
            Mes actual
          </button>
        )}
        <span style={{ flex: 1 }} />
        <SoloSi op="op.sesiones.feriados_crear">
          <button
            type="button"
            style={btnPrimario}
            onClick={() =>
              setModal({
                accion: "AGREGAR",
                inicial: {
                  fecha: manana,
                  nombre: "",
                  paises: [...PAISES],
                },
              })
            }
          >
            + Agregar feriado propio
          </button>
        </SoloSi>
      </div>

      {aviso !== null && (
        <p role="status" style={{ fontSize: "0.85rem" }}>
          {aviso}
        </p>
      )}
      {error !== null && (
        <p role="alert" style={{ color: "#b3261e" }}>
          {error}
        </p>
      )}

      <div style={{ ...caja, overflow: "hidden" }}>
        {cargando ? (
          <p style={{ padding: "1rem", margin: 0 }}>Cargando…</p>
        ) : grupos.length === 0 ? (
          <p style={{ padding: "1rem", margin: 0, color: "#667" }}>
            No hay feriados registrados en este mes.
          </p>
        ) : (
          grupos.map((g, i) => (
            <div
              key={`${g.fecha}|${g.nombre}|${String(g.propio)}`}
              style={{
                display: "flex",
                gap: "0.9rem",
                alignItems: "center",
                flexWrap: "wrap",
                padding: "0.7rem 0.9rem",
                borderTop: i === 0 ? "none" : "1px solid #eef0f6",
                background: g.fecha === hoy ? "#f1f6ff" : "white",
              }}
            >
              <div style={{ minWidth: "9.5rem", fontWeight: 700, textTransform: "capitalize" }}>
                {fechaLarga(g.fecha)}
              </div>
              <div style={{ flex: 1, minWidth: "12rem" }}>
                <div style={{ fontWeight: 600 }}>{g.nombre}</div>
                <div style={{ marginTop: "0.25rem" }}>
                  <Banderas paises={g.paises} />
                </div>
              </div>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  padding: "0.15rem 0.5rem",
                  borderRadius: "999px",
                  background: g.propio ? "#fff0d6" : "#eef0f6",
                  color: g.propio ? "#9a5b00" : "#556",
                }}
              >
                {g.propio ? "Propio" : "Oficial"}
              </span>
              {g.propio && g.fecha > hoy && puedeCrear && (
                <button
                  type="button"
                  style={btn}
                  onClick={() =>
                    setModal({
                      accion: "QUITAR",
                      inicial: { fecha: g.fecha, nombre: g.nombre, paises: g.paises },
                    })
                  }
                >
                  Quitar
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {pendientes.length > 0 && (
        <section style={{ ...caja, marginTop: "1.2rem", background: "#fff7e6" }}>
          <div style={{ padding: "0.8rem 0.9rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
              Salones pendientes de ajustar ({String(pendientes.length)})
            </h2>
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.82rem", color: "#664" }}>
              Su calendario no incluye un feriado porque la última sesión pasaría del final del
              contrato de algún niño (o ya hay asistencia en lo que se quitaría). Resuélvelo —por
              ejemplo, ampliando esos contratos— y regenera el salón.
            </p>
          </div>
          {pendientes.map((p) => (
            <div key={p.id} style={{ borderTop: "1px solid #f0dfb8", padding: "0.7rem 0.9rem" }}>
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <Bandera pais={p.pais} alto={13} />{" "}
                  <strong>
                    {CURSO[p.curso] ?? p.curso} · {p.nombre}
                  </strong>{" "}
                  <span style={{ color: "#667" }}>{p.campania}</span>
                  <div style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>
                    {p.motivo} Última sesión: {corta(p.finActual)} → {corta(p.finNuevo)}
                  </div>
                  <ListaConflictos conflictos={p.conflictos} />
                </div>
                <SoloSi op="op.sesiones.feriados_crear">
                  <button
                    type="button"
                    style={btnPrimario}
                    disabled={regenerando === p.id}
                    onClick={() => void regenerar(p.id)}
                  >
                    {regenerando === p.id ? "Regenerando…" : "Regenerar"}
                  </button>
                </SoloSi>
              </div>
            </div>
          ))}
        </section>
      )}

      {modal !== null && (
        <ModalFeriado
          accion={modal.accion}
          inicial={modal.inicial}
          manana={manana}
          onClose={() => setModal(null)}
          onHecho={recargar}
        />
      )}
    </div>
  );
}

/** La página es una opción de Roles: sin ella, "No tienes acceso". */
export default function FeriadosPage() {
  return (
    <ConOpcion op="op.sesiones.feriados" volver="/panel/sesiones">
      <FeriadosContenido />
    </ConOpcion>
  );
}
