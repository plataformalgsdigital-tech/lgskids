"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { fechaLocal, horaLocal } from "@/ui/fecha-local";
import { AvisoProveedor } from "../AvisoProveedor";

interface Plantilla {
  id: string;
  slug: string;
  nombre: string;
  contenido: string;
  usaClave: boolean;
}
interface Salon {
  id: string;
  nombre: string;
  campania: string;
  campaniaInicio: string;
  ocupados: number;
  activo: boolean;
}
interface Destinatario {
  childPersonId: string;
  nombre: string;
  documento: string;
  apoderado: string | null;
  telefonoDe: "apoderado" | "niño" | null;
  whatsapp: string | null;
  problema: string | null;
  salon: string | null;
  vistaPrevia: string | null;
}
interface Envio {
  id: string;
  creadoEn: string;
  enviadaEn: string | null;
  estado: "PENDIENTE" | "ENVIADA" | "FALLIDA";
  intentos: number;
  error: string | null;
  destinatario: string;
  mensaje: string;
  plantilla: string | null;
  nino: string | null;
  childPersonId: string | null;
  enviadoPor: string | null;
}

const input: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  width: "100%",
};
const btn: CSSProperties = {
  padding: "0.45rem 0.9rem",
  borderRadius: "0.55rem",
  border: "1px solid #d8dce6",
  background: "white",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
};
const btnPrimario: CSSProperties = {
  ...btn,
  border: "none",
  background: "var(--lgs-verde)",
  color: "#1b2a10",
  fontWeight: 700,
};
const th: CSSProperties = {
  padding: "0.5rem 0.6rem",
  textAlign: "left",
  fontWeight: 600,
  color: "var(--texto-suave)",
  whiteSpace: "nowrap",
};
const td: CSSProperties = { padding: "0.55rem 0.6rem", verticalAlign: "top" };
const suave: CSSProperties = { color: "var(--texto-suave)", fontSize: "0.78rem" };

const ESTADO: Record<Envio["estado"], { texto: string; fondo: string; color: string }> = {
  PENDIENTE: { texto: "En cola", fondo: "#fff8e1", color: "#7a5200" },
  ENVIADA: { texto: "Enviado", fondo: "#e8f5e9", color: "#1b5e20" },
  FALLIDA: { texto: "Falló", fondo: "#ffebee", color: "#c62828" },
};

/**
 * GESTIÓN DE MENSAJES: elegir plantilla → destinatarios (un salón o una lista
 * de documentos) → revisar → enviar. Igual que en LGS, con dos diferencias: el
 * mensaje va al APODERADO de cada niño y queda un HISTORIAL.
 */
export default function GestionMensajesPage() {
  const [pestania, setPestania] = useState<"enviar" | "historial">("enviar");
  const [proveedor, setProveedor] = useState<string | null>(null);

  return (
    <main style={{ padding: "2rem", maxWidth: "76rem", margin: "0 auto" }}>
      <Link href="/panel/mensajes" style={{ fontSize: "0.9rem" }}>
        ← Mensajes
      </Link>
      <h1 style={{ fontSize: "1.6rem", margin: "0.4rem 0 0" }}>Gestión de mensajes</h1>
      <AvisoProveedor proveedor={proveedor} />

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: "0.25rem",
          marginTop: "1rem",
          borderBottom: "2px solid #e3e7f0",
        }}
      >
        {(
          [
            ["enviar", "Enviar"],
            ["historial", "Historial"],
          ] as const
        ).map(([id, texto]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestania === id}
            onClick={() => setPestania(id)}
            style={{
              padding: "0.6rem 1.1rem",
              border: "none",
              borderBottom: `3px solid ${pestania === id ? "var(--lgs-azul)" : "transparent"}`,
              marginBottom: "-2px",
              background: "none",
              color: pestania === id ? "var(--lgs-azul-oscuro)" : "var(--texto-suave)",
              fontWeight: pestania === id ? 700 : 600,
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            {texto}
          </button>
        ))}
      </div>

      {pestania === "enviar" ? (
        <Enviar onProveedor={setProveedor} onEnviado={() => setPestania("historial")} />
      ) : (
        <Historial onProveedor={setProveedor} />
      )}
    </main>
  );
}

function Enviar({
  onProveedor,
  onEnviado,
}: {
  onProveedor: (p: string) => void;
  onEnviado: () => void;
}) {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [plantillaId, setPlantillaId] = useState("");
  const [modo, setModo] = useState<"salon" | "documentos">("salon");
  const [classroomId, setClassroomId] = useState("");
  const [documentos, setDocumentos] = useState("");
  const [destinatarios, setDestinatarios] = useState<Destinatario[] | null>(null);
  const [noEncontrados, setNoEncontrados] = useState<string[]>([]);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    async function cargar() {
      const [rp, rs] = await Promise.all([
        apiFetch("/api/notifications/plantillas"),
        apiFetch("/api/scheduling/classrooms"),
      ]);
      if (rp.ok) {
        const d: { plantillas: Plantilla[]; proveedor: string } = await rp.json();
        setPlantillas(d.plantillas);
        onProveedor(d.proveedor);
      }
      if (rs.ok) {
        const d: { salones: Salon[] } = await rs.json();
        setSalones(d.salones.filter((s) => s.activo));
      }
    }
    void cargar();
  }, [onProveedor]);

  const plantilla = plantillas.find((p) => p.id === plantillaId) ?? null;

  async function buscar() {
    setError(null);
    setAviso(null);
    setDestinatarios(null);
    if (plantilla === null) return setError("Elige una plantilla.");
    if (plantilla.usaClave) {
      return setError(
        "Esta plantilla lleva la clave: se envía desde la ficha de cada niño, no en un envío masivo.",
      );
    }
    const docs = documentos
      .split(/[\n,;]+/)
      .map((d) => d.trim())
      .filter((d) => d !== "" && !/^(numero|número|documento|doc|id|cedula|cédula)$/i.test(d));
    if (modo === "salon" && classroomId === "") return setError("Elige un salón.");
    if (modo === "documentos" && docs.length === 0)
      return setError("Escribe al menos un documento.");
    setOcupado(true);
    try {
      const res = await apiFetch("/api/notifications/destinatarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantillaId,
          ...(modo === "salon" ? { classroomId } : { documentos: docs }),
        }),
      });
      const data: {
        destinatarios?: Destinatario[];
        noEncontrados?: string[];
        error?: { message: string };
      } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudieron buscar los destinatarios.");
        return;
      }
      const lista = data.destinatarios ?? [];
      setDestinatarios(lista);
      setNoEncontrados(data.noEncontrados ?? []);
      setElegidos(new Set(lista.filter((d) => d.whatsapp !== null).map((d) => d.childPersonId)));
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function leerCsv(archivo: File) {
    const texto = await archivo.text();
    // La primera columna de cada fila; el separador puede ser , o ; (Excel en español).
    const docs = texto
      .split(/\r?\n/)
      .map((l) => l.split(/[;,]/)[0]?.replace(/^"|"$/g, "").trim() ?? "")
      .filter((d) => d !== "");
    setDocumentos(docs.join("\n"));
  }

  async function enviar() {
    if (plantilla === null || elegidos.size === 0) return;
    if (
      !window.confirm(
        `¿Enviar "${plantilla.nombre}" a ${String(elegidos.size)} apoderado(s) por WhatsApp?`,
      )
    ) {
      return;
    }
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch("/api/notifications/envios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantillaId, childPersonIds: [...elegidos] }),
      });
      const data: {
        encolados?: number;
        omitidos?: { nombre: string; motivo: string }[];
        error?: { message: string };
      } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo enviar.");
        return;
      }
      const omitidos = data.omitidos ?? [];
      setAviso(
        `${String(data.encolados ?? 0)} mensaje(s) en camino.${
          omitidos.length > 0
            ? ` Sin enviar: ${omitidos.map((o) => `${o.nombre} (${o.motivo})`).join(", ")}.`
            : ""
        }`,
      );
      setDestinatarios(null);
      setTimeout(onEnviado, 1200);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  const porCampania = new Map<string, Salon[]>();
  for (const s of [...salones].sort((a, b) => b.campaniaInicio.localeCompare(a.campaniaInicio))) {
    porCampania.set(s.campania, [...(porCampania.get(s.campania) ?? []), s]);
  }
  const validos = destinatarios?.filter((d) => d.whatsapp !== null) ?? [];
  const muestra = destinatarios?.find((d) => elegidos.has(d.childPersonId)) ?? null;

  return (
    <section
      style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
          gap: "0.8rem",
        }}
      >
        <label>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>1 · Plantilla</span>
          <select
            value={plantillaId}
            onChange={(e) => {
              setPlantillaId(e.target.value);
              setDestinatarios(null);
            }}
            style={input}
          >
            <option value="">— elegir plantilla —</option>
            {plantillas.map((p) => (
              <option key={p.id} value={p.id} disabled={p.usaClave}>
                {p.nombre}
                {p.usaClave ? " (solo desde la ficha del niño)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>2 · Destinatarios</span>
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.45rem", fontSize: "0.88rem" }}>
            <label style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="radio" checked={modo === "salon"} onChange={() => setModo("salon")} />
              Un salón
            </label>
            <label style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              <input
                type="radio"
                checked={modo === "documentos"}
                onChange={() => setModo("documentos")}
              />
              Documentos (o CSV)
            </label>
          </div>
        </div>
      </div>

      {modo === "salon" ? (
        <label style={{ maxWidth: "32rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Salón</span>
          <select
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            style={input}
          >
            <option value="">— elegir salón —</option>
            {[...porCampania.entries()].map(([campania, lista]) => (
              <optgroup key={campania} label={campania}>
                {lista.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · {s.ocupados} inscrito(s)
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "40rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
            Documentos de los NIÑOS, uno por línea (máximo 300)
          </span>
          <textarea
            value={documentos}
            onChange={(e) => setDocumentos(e.target.value)}
            rows={5}
            placeholder={"1012345678\n121290"}
            style={{ ...input, fontFamily: "inherit" }}
          />
          <label style={{ fontSize: "0.82rem", color: "var(--texto-suave)" }}>
            o carga un CSV (se toma la primera columna):{" "}
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f !== undefined) void leerCsv(f);
              }}
            />
          </label>
        </div>
      )}

      <div>
        <button
          type="button"
          style={{ ...btn, background: "var(--lgs-azul)", color: "white", border: "none" }}
          disabled={ocupado}
          onClick={() => void buscar()}
        >
          {ocupado && destinatarios === null ? "Buscando…" : "Buscar destinatarios"}
        </button>
      </div>

      {error !== null && (
        <p role="alert" style={{ margin: 0, color: "#c62828" }}>
          {error}
        </p>
      )}
      {aviso !== null && (
        <p
          style={{
            margin: 0,
            color: "#1b5e20",
            background: "#e8f5e9",
            padding: "0.6rem 0.9rem",
            borderRadius: "0.6rem",
          }}
        >
          {aviso}
        </p>
      )}

      {destinatarios !== null && (
        <>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--texto-suave)" }}>
            {destinatarios.length} niño(s) · {validos.length} con WhatsApp válido ·{" "}
            <strong>{elegidos.size} elegido(s)</strong>
            {noEncontrados.length > 0 && ` · No encontrados: ${noEncontrados.join(", ")}`}
          </p>
          {destinatarios.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid #e3e7f0" }}>
                    <th style={th}>
                      <input
                        type="checkbox"
                        aria-label="Elegir todos"
                        checked={
                          validos.length > 0 && validos.every((d) => elegidos.has(d.childPersonId))
                        }
                        onChange={(e) =>
                          setElegidos(
                            e.target.checked
                              ? new Set(validos.map((d) => d.childPersonId))
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th style={th}>Niño</th>
                    <th style={th}>Apoderado</th>
                    <th style={th}>WhatsApp</th>
                    <th style={th}>Salón</th>
                  </tr>
                </thead>
                <tbody>
                  {destinatarios.map((d) => (
                    <tr key={d.childPersonId} style={{ borderBottom: "1px solid #edf0f6" }}>
                      <td style={td}>
                        <input
                          type="checkbox"
                          disabled={d.whatsapp === null}
                          checked={elegidos.has(d.childPersonId)}
                          onChange={(e) => {
                            const s = new Set(elegidos);
                            if (e.target.checked) s.add(d.childPersonId);
                            else s.delete(d.childPersonId);
                            setElegidos(s);
                          }}
                        />
                      </td>
                      <td style={td}>
                        <Link href={`/panel/personas/${d.childPersonId}`}>{d.nombre}</Link>
                        <div style={suave}>{d.documento}</div>
                      </td>
                      <td style={td}>{d.apoderado ?? "—"}</td>
                      <td style={td}>
                        {d.whatsapp !== null ? (
                          <>
                            +{d.whatsapp}
                            {d.telefonoDe === "niño" && (
                              <div style={suave}>
                                del registro del niño (sin apoderado con teléfono)
                              </div>
                            )}
                          </>
                        ) : (
                          <span style={{ color: "#c62828" }}>{d.problema}</span>
                        )}
                      </td>
                      <td style={td}>{d.salon ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {muestra?.vistaPrevia != null && (
            <div>
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                Vista previa (para {muestra.apoderado ?? muestra.nombre})
              </span>
              <div
                style={{
                  marginTop: "0.35rem",
                  whiteSpace: "pre-wrap",
                  background: "#e7f6e0",
                  borderRadius: "0.8rem",
                  padding: "0.8rem 1rem",
                  maxWidth: "34rem",
                  fontSize: "0.88rem",
                }}
              >
                {muestra.vistaPrevia}
              </div>
            </div>
          )}
          <div>
            <button
              type="button"
              style={{ ...btnPrimario, opacity: ocupado || elegidos.size === 0 ? 0.6 : 1 }}
              disabled={ocupado || elegidos.size === 0}
              onClick={() => void enviar()}
            >
              {ocupado ? "Enviando…" : `📲 Enviar a ${String(elegidos.size)}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Historial({ onProveedor }: { onProveedor: (p: string) => void }) {
  const [envios, setEnvios] = useState<Envio[] | null>(null);
  const [estado, setEstado] = useState("");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (estado !== "") params.set("estado", estado);
    if (q.trim() !== "") params.set("q", q.trim());
    const res = await apiFetch(`/api/notifications/envios?${params.toString()}`);
    const data: { envios?: Envio[]; proveedor?: string; error?: { message: string } } =
      await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "No se pudo cargar el historial.");
      return;
    }
    setEnvios(data.envios ?? []);
    if (data.proveedor !== undefined) onProveedor(data.proveedor);
  }, [estado, q, onProveedor]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  // Mientras haya mensajes en cola, se refresca solo.
  const hayEnCola = envios?.some((e) => e.estado === "PENDIENTE") === true;
  useEffect(() => {
    if (!hayEnCola) return;
    const t = setInterval(() => void cargar(), 3000);
    return () => clearInterval(t);
  }, [hayEnCola, cargar]);

  return (
    <section style={{ marginTop: "1.25rem" }}>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por niño, documento o teléfono"
          style={{ ...input, maxWidth: "22rem" }}
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          style={{ ...input, width: "auto" }}
        >
          <option value="">Todos los estados</option>
          <option value="ENVIADA">Enviados</option>
          <option value="PENDIENTE">En cola</option>
          <option value="FALLIDA">Fallidos</option>
        </select>
        <button type="button" style={btn} onClick={() => void cargar()}>
          ↻ Actualizar
        </button>
      </div>
      {error !== null && (
        <p role="alert" style={{ color: "#c62828" }}>
          {error}
        </p>
      )}
      {envios === null ? (
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      ) : envios.length === 0 ? (
        <p style={{ color: "var(--texto-suave)", marginTop: "1rem" }}>Todavía no hay envíos.</p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "0.8rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid #e3e7f0" }}>
                <th style={th}>Fecha</th>
                <th style={th}>Niño</th>
                <th style={th}>WhatsApp</th>
                <th style={th}>Plantilla</th>
                <th style={th}>Estado</th>
                <th style={th}>Envió</th>
              </tr>
            </thead>
            <tbody>
              {envios.map((e) => {
                const est = ESTADO[e.estado];
                return (
                  <Fragment key={e.id}>
                    <tr
                      onClick={() => setAbierto(abierto === e.id ? null : e.id)}
                      title="Ver el mensaje"
                      style={{ borderBottom: "1px solid #edf0f6", cursor: "pointer" }}
                    >
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {fechaLocal(e.creadoEn)}
                        <div style={suave}>{horaLocal(e.creadoEn)}</div>
                      </td>
                      <td style={td}>
                        {e.childPersonId !== null ? (
                          <Link
                            href={`/panel/personas/${e.childPersonId}`}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            {e.nino ?? "—"}
                          </Link>
                        ) : (
                          (e.nino ?? "—")
                        )}
                      </td>
                      <td style={td}>+{e.destinatario}</td>
                      <td style={td}>{e.plantilla ?? "—"}</td>
                      <td style={td}>
                        <span
                          style={{
                            padding: "0.15rem 0.55rem",
                            borderRadius: "999px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            background: est.fondo,
                            color: est.color,
                          }}
                        >
                          {est.texto}
                        </span>
                        {e.error !== null && (
                          <div style={{ ...suave, color: "#c62828", maxWidth: "18rem" }}>
                            {e.error}
                          </div>
                        )}
                      </td>
                      <td style={td}>{e.enviadoPor ?? "automático"}</td>
                    </tr>
                    {abierto === e.id && (
                      <tr>
                        <td colSpan={6} style={{ padding: "0 0.6rem 0.8rem" }}>
                          <div
                            style={{
                              whiteSpace: "pre-wrap",
                              background: "#e7f6e0",
                              borderRadius: "0.8rem",
                              padding: "0.7rem 0.9rem",
                              maxWidth: "34rem",
                            }}
                          >
                            {e.mensaje}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
