"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { ConOpcion } from "@/ui/ConOpcion";
import { SoloSi } from "@/ui/SoloSi";

/**
 * Voces del libro (2026-10-28): los audios de ElevenLabs de lo que lee el libro
 * interactivo de cada nivel, con la voz de quien lo dice, y las frases extra de
 * los personajes por página. "Generar" lee el libro cargado, registra lo que
 * falta y lo manda a ElevenLabs; lo ya generado no se vuelve a pagar.
 */

type Curso = "JUNIOR" | "YOUNGSTER";
type Personaje = "GUIA" | "SIMBA" | "ROOKY" | "DODO";
type EstadoVoz = "PENDIENTE" | "GENERADO" | "ERROR";

interface Voz {
  id: string;
  clave: string;
  personaje: Personaje;
  texto: string;
  origen: "LIBRO" | "INTERVENCION";
  estado: EstadoVoz;
  error: string | null;
}
interface Intervencion {
  id: string;
  pagina: number;
  personaje: Personaje;
  texto: string;
  orden: number;
  activo: boolean;
}
interface EstadoVoces {
  libro: { id: string; nombre: string } | null;
  configurado: boolean;
  modelo: string | null;
  generando: boolean;
  personajes: { personaje: Personaje; voiceId: string; voz: string; etiqueta: string }[];
  resumen: {
    total: number;
    generados: number;
    pendientes: number;
    errores: number;
    caracteresPorGenerar: number;
  };
  voces: Voz[];
  intervenciones: Intervencion[];
}

const CURSOS: Curso[] = ["JUNIOR", "YOUNGSTER"];
const NIVELES = [
  { codigo: "ROOKIE", nombre: "Rookie" },
  { codigo: "CHAMPION", nombre: "Champion" },
  { codigo: "ELITE", nombre: "Elite" },
  { codigo: "LEGENDARY", nombre: "Legendary" },
  { codigo: "ULTIMATE", nombre: "Ultimate Stage" },
];

const campo: CSSProperties = {
  padding: "0.45rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.88rem",
  fontFamily: "inherit",
};
const boton: CSSProperties = {
  padding: "0.4rem 0.85rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.82rem",
  cursor: "pointer",
};
const tarjeta: CSSProperties = {
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1rem 1.1rem",
  background: "white",
  marginTop: "1rem",
};
const celda: CSSProperties = {
  padding: "0.45rem 0.55rem",
  borderBottom: "1px solid #eef1f7",
  fontSize: "0.86rem",
  verticalAlign: "top",
};
const COLOR_ESTADO: Record<EstadoVoz, string> = {
  GENERADO: "#2e7d32",
  PENDIENTE: "#b57a00",
  ERROR: "#c62828",
};

async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
  return c.error?.message ?? porDefecto;
}

function VocesLibro() {
  const [curso, setCurso] = useState<Curso>("JUNIOR");
  const [nivel, setNivel] = useState("ROOKIE");
  const [estado, setEstado] = useState<EstadoVoces | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtro, setFiltro] = useState<"" | EstadoVoz>("");
  const [nueva, setNueva] = useState<{ pagina: string; personaje: Personaje; texto: string }>({
    pagina: "1",
    personaje: "ROOKY",
    texto: "",
  });

  const cargar = useCallback(async () => {
    const res = await apiFetch(
      `/api/catalog/material/voces?curso=${curso}&nivel=${encodeURIComponent(nivel)}`,
    );
    if (res.ok) setEstado((await res.json()) as EstadoVoces);
    else setMsg({ ok: false, texto: await mensajeDeError(res, "No se pudo leer el estado.") });
  }, [curso, nivel]);

  useEffect(() => {
    async function run() {
      await cargar();
    }
    void run();
  }, [cargar]);

  // Mientras genera, consulta el avance cada 3 s.
  useEffect(() => {
    if (estado?.generando !== true) return;
    const t = setInterval(() => void cargar(), 3000);
    return () => clearInterval(t);
  }, [estado?.generando, cargar]);

  async function accion(cuerpo: Record<string, unknown>, ok: string) {
    setOcupado(true);
    setMsg(null);
    try {
      const res = await apiFetch("/api/catalog/material/voces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        setMsg({ ok: false, texto: await mensajeDeError(res, "No se pudo completar.") });
        return;
      }
      const r = (await res.json()) as { nuevas?: number; total?: number };
      setMsg({
        ok: true,
        texto:
          r.total !== undefined
            ? `${ok} El libro dice ${String(r.total)} frases; ${String(r.nuevas ?? 0)} nuevas.`
            : ok,
      });
      // Generar sigue en el servidor: un momento y se ve "generando".
      setTimeout(() => void cargar(), 800);
    } finally {
      setOcupado(false);
    }
  }

  async function guardarIntervencion(i: Intervencion | null, cambios: Partial<Intervencion>) {
    const base = i ?? {
      pagina: Number(nueva.pagina),
      personaje: nueva.personaje,
      texto: nueva.texto,
      orden: 1,
      activo: true,
    };
    const res = await apiFetch(
      i === null
        ? "/api/catalog/material/intervenciones"
        : `/api/catalog/material/intervenciones/${i.id}`,
      {
        method: i === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curso,
          nivel,
          pagina: base.pagina,
          personaje: base.personaje,
          texto: base.texto,
          orden: base.orden,
          activo: base.activo,
          ...cambios,
        }),
      },
    );
    if (!res.ok) {
      setMsg({ ok: false, texto: await mensajeDeError(res, "No se pudo guardar la frase.") });
      return;
    }
    if (i === null) setNueva({ ...nueva, texto: "" });
    setMsg({
      ok: true,
      texto: "Frase guardada. Pulsa «Generar voces» para crear su audio.",
    });
    await cargar();
  }

  async function borrarIntervencion(i: Intervencion) {
    if (!window.confirm(`¿Borrar la frase de la página ${String(i.pagina)}?`)) return;
    const res = await apiFetch(`/api/catalog/material/intervenciones/${i.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setMsg({ ok: false, texto: await mensajeDeError(res, "No se pudo borrar.") });
      return;
    }
    await cargar();
  }

  const etiqueta = (p: Personaje) =>
    estado?.personajes.find((x) => x.personaje === p)?.etiqueta ?? p;
  const voces = (estado?.voces ?? []).filter((v) => filtro === "" || v.estado === filtro);

  return (
    <main style={{ padding: "2rem", maxWidth: "72rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.85rem" }}>
        ← Volver a Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.6rem", margin: "0.4rem 0 0" }}>🔊 Voces del libro</h1>
      <p style={{ color: "var(--texto-suave)", marginTop: "0.3rem", maxWidth: "52rem" }}>
        Lo que el libro interactivo lee en voz alta se genera UNA vez con ElevenLabs, con la voz de
        quien lo dice, y el niño lo escucha en cualquier dispositivo (antes solo sonaba en Windows).
        Lo que no tenga audio se dice con la voz del dispositivo.
      </p>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "1rem" }}>
        <select
          value={curso}
          onChange={(e) => setCurso(e.target.value as Curso)}
          style={campo}
          aria-label="Curso"
        >
          {CURSOS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={nivel}
          onChange={(e) => setNivel(e.target.value)}
          style={campo}
          aria-label="Nivel"
        >
          {NIVELES.map((n) => (
            <option key={n.codigo} value={n.codigo}>
              {n.nombre}
            </option>
          ))}
        </select>
      </div>

      {msg !== null && (
        <p role="status" style={{ color: msg.ok ? "#2e7d32" : "#c62828", fontWeight: 600 }}>
          {msg.texto}
        </p>
      )}

      {estado !== null && (
        <>
          <section style={tarjeta}>
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Voces de los personajes</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
              <tbody>
                {estado.personajes.map((p) => (
                  <tr key={p.personaje}>
                    <td style={{ ...celda, fontWeight: 700 }}>{p.etiqueta}</td>
                    <td style={celda}>{p.voz}</td>
                    <td style={{ ...celda, fontFamily: "monospace", fontSize: "0.78rem" }}>
                      {p.voiceId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: "0.8rem", color: "var(--texto-suave)", marginBottom: 0 }}>
              Modelo: {estado.modelo ?? "—"}.{" "}
              {!estado.configurado &&
                "⚠ ElevenLabs no está configurado (falta ELEVENLABS_API_KEY): no se puede generar."}
            </p>
          </section>

          <section style={tarjeta}>
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>
              Audios de {curso} · {NIVELES.find((n) => n.codigo === nivel)?.nombre}
            </h2>
            {estado.libro === null ? (
              <p style={{ color: "#b57a00" }}>
                Este nivel no tiene libro interactivo cargado (Material del alumno).
              </p>
            ) : (
              <>
                <p style={{ fontSize: "0.88rem", margin: "0.4rem 0" }}>
                  Libro: <b>{estado.libro.nombre}</b> · {estado.resumen.total} frases ·{" "}
                  <span style={{ color: COLOR_ESTADO.GENERADO }}>
                    {estado.resumen.generados} generadas
                  </span>{" "}
                  ·{" "}
                  <span style={{ color: COLOR_ESTADO.PENDIENTE }}>
                    {estado.resumen.pendientes} pendientes
                  </span>{" "}
                  ·{" "}
                  <span style={{ color: COLOR_ESTADO.ERROR }}>
                    {estado.resumen.errores} con error
                  </span>
                  {estado.resumen.caracteresPorGenerar > 0 &&
                    ` · por generar: ${estado.resumen.caracteresPorGenerar.toLocaleString("es")} caracteres (≈ créditos)`}
                </p>
                {estado.generando && (
                  <p style={{ color: "#1565c0", fontWeight: 700 }}>
                    ⏳ Generando… se actualiza solo.
                  </p>
                )}
                <SoloSi op="op.mant.voces_generar">
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={boton}
                      disabled={ocupado || estado.generando}
                      onClick={() =>
                        void accion({ accion: "preparar", curso, nivel }, "Lista actualizada.")
                      }
                    >
                      Revisar el libro (sin gastar)
                    </button>
                    <button
                      type="button"
                      style={{
                        ...boton,
                        background: "var(--lgs-purpura)",
                        color: "white",
                        border: "none",
                      }}
                      disabled={ocupado || estado.generando || !estado.configurado}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Se generarán con ElevenLabs las frases pendientes (gasta créditos). ¿Continuar?",
                          )
                        ) {
                          void accion({ accion: "generar", curso, nivel }, "Generación en marcha.");
                        }
                      }}
                    >
                      🔊 Generar voces
                    </button>
                  </div>
                </SoloSi>
              </>
            )}

            <div
              style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.8rem" }}
            >
              <span style={{ fontSize: "0.85rem" }}>Mostrar:</span>
              <select
                value={filtro}
                onChange={(e) => setFiltro(e.target.value as "" | EstadoVoz)}
                style={campo}
                aria-label="Filtrar por estado"
              >
                <option value="">Todas</option>
                <option value="GENERADO">Generadas</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="ERROR">Con error</option>
              </select>
            </div>
            <div
              style={{
                overflowX: "auto",
                maxHeight: "28rem",
                overflowY: "auto",
                marginTop: "0.5rem",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", background: "#f4f6fb" }}>
                    <th style={celda}>Quién</th>
                    <th style={celda}>Frase</th>
                    <th style={celda}>Estado</th>
                    <th style={celda}>Audio</th>
                  </tr>
                </thead>
                <tbody>
                  {voces.length === 0 ? (
                    <tr>
                      <td style={celda} colSpan={4}>
                        <span style={{ color: "var(--texto-suave)" }}>
                          Sin frases todavía. Pulsa «Revisar el libro».
                        </span>
                      </td>
                    </tr>
                  ) : (
                    voces.map((v) => (
                      <tr key={v.id}>
                        <td style={{ ...celda, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {etiqueta(v.personaje)}
                          {v.origen === "INTERVENCION" && (
                            <span style={{ display: "block", fontSize: "0.7rem", fontWeight: 400 }}>
                              intervención
                            </span>
                          )}
                        </td>
                        <td style={celda}>{v.texto}</td>
                        <td style={{ ...celda, color: COLOR_ESTADO[v.estado], fontWeight: 700 }}>
                          {v.estado === "GENERADO"
                            ? "Generada"
                            : v.estado === "PENDIENTE"
                              ? "Pendiente"
                              : "Error"}
                          {v.error !== null && (
                            <span
                              style={{
                                display: "block",
                                fontWeight: 400,
                                fontSize: "0.72rem",
                                maxWidth: "16rem",
                              }}
                            >
                              {v.error}
                            </span>
                          )}
                        </td>
                        <td style={{ ...celda, whiteSpace: "nowrap" }}>
                          {v.estado === "GENERADO" && (
                            <audio
                              controls
                              preload="none"
                              src={`/api/catalog/material/voces/${v.id}/escuchar`}
                              style={{ height: "2rem", width: "12rem" }}
                            />
                          )}
                          <SoloSi op="op.mant.voces_generar">
                            {v.estado !== "PENDIENTE" && (
                              <button
                                type="button"
                                style={{ ...boton, marginLeft: "0.3rem" }}
                                onClick={() =>
                                  void accion(
                                    { accion: "regenerar", id: v.id },
                                    "Quedó pendiente: pulsa «Generar voces».",
                                  )
                                }
                              >
                                ↻
                              </button>
                            )}
                          </SoloSi>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={tarjeta}>
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Frases de los personajes</h2>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--texto-suave)",
                margin: "0.3rem 0 0.6rem",
              }}
            >
              Al abrir esa página del libro, el personaje aparece bajo el título con su frase y la
              dice. La página es la que ve el niño («Página 5 / 28»). Tras agregar o cambiar una,
              pulsa «Generar voces».
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f4f6fb" }}>
                  <th style={celda}>Página</th>
                  <th style={celda}>Personaje</th>
                  <th style={celda}>Frase</th>
                  <th style={celda}>Activa</th>
                  <th style={celda} />
                </tr>
              </thead>
              <tbody>
                {estado.intervenciones.map((i) => (
                  <tr key={i.id} style={{ opacity: i.activo ? 1 : 0.5 }}>
                    <td style={celda}>{i.pagina}</td>
                    <td style={{ ...celda, fontWeight: 700 }}>{etiqueta(i.personaje)}</td>
                    <td style={celda}>{i.texto}</td>
                    <td style={celda}>
                      <SoloSi op="op.mant.voces_generar">
                        <input
                          type="checkbox"
                          checked={i.activo}
                          aria-label="Activa"
                          onChange={(e) =>
                            void guardarIntervencion(i, { activo: e.target.checked })
                          }
                        />
                      </SoloSi>
                    </td>
                    <td style={celda}>
                      <SoloSi op="op.mant.voces_generar">
                        <button
                          type="button"
                          style={boton}
                          onClick={() => {
                            const texto = window.prompt("Frase", i.texto);
                            if (texto !== null && texto.trim() !== "") {
                              void guardarIntervencion(i, { texto });
                            }
                          }}
                        >
                          ✏️
                        </button>{" "}
                        <button
                          type="button"
                          style={{ ...boton, color: "#c62828" }}
                          onClick={() => void borrarIntervencion(i)}
                        >
                          🗑
                        </button>
                      </SoloSi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SoloSi op="op.mant.voces_generar">
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginTop: "0.8rem",
                  alignItems: "center",
                }}
              >
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={nueva.pagina}
                  onChange={(e) => setNueva({ ...nueva, pagina: e.target.value })}
                  style={{ ...campo, width: "5rem" }}
                  aria-label="Página"
                />
                <select
                  value={nueva.personaje}
                  onChange={(e) => setNueva({ ...nueva, personaje: e.target.value as Personaje })}
                  style={campo}
                  aria-label="Personaje"
                >
                  {estado.personajes.map((p) => (
                    <option key={p.personaje} value={p.personaje}>
                      {p.etiqueta}
                    </option>
                  ))}
                </select>
                <input
                  value={nueva.texto}
                  maxLength={300}
                  placeholder="Great job! Let's sing together!"
                  onChange={(e) => setNueva({ ...nueva, texto: e.target.value })}
                  style={{ ...campo, flex: 1, minWidth: "16rem" }}
                  aria-label="Frase"
                />
                <button
                  type="button"
                  style={boton}
                  disabled={nueva.texto.trim() === ""}
                  onClick={() => void guardarIntervencion(null, {})}
                >
                  + Agregar
                </button>
              </div>
            </SoloSi>
          </section>
        </>
      )}
    </main>
  );
}

export default function VocesLibroPage() {
  return (
    <ConOpcion op="op.mant.voces" volver="/panel/mantenimiento-cursos">
      <VocesLibro />
    </ConOpcion>
  );
}
