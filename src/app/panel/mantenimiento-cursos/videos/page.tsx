"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

type Curso = "JUNIOR" | "YOUNGSTER";
type Estado = "PROCESANDO" | "BORRADOR" | "PUBLICADO" | "ERROR";

interface Video {
  id: string;
  pagina: number;
  orden: number;
  estado: Estado;
  nombreOriginal: string;
  bytesOriginal: number;
  bytesFinal: number | null;
  duracionSeg: number | null;
  ancho: number | null;
  alto: number | null;
  error: string | null;
  creadoEn: string;
  publicadoEn: string | null;
  ruta: string;
}
interface Limites {
  tamanoSubida: number;
  duracionMaximaSeg: number;
  paginaMin: number;
  paginaMax: number;
  ordenMax: number;
}

const CURSOS: Curso[] = ["JUNIOR", "YOUNGSTER"];
const NIVELES = [
  { codigo: "ROOKIE", nombre: "Rookie" },
  { codigo: "CHAMPION", nombre: "Champion" },
  { codigo: "ELITE", nombre: "Elite" },
  { codigo: "LEGENDARY", nombre: "Legendary" },
  { codigo: "ULTIMATE", nombre: "Ultimate Stage" },
];

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const minutos = (s: number) =>
  `${String(Math.floor(s / 60))}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const casilla = (v: { pagina: number; orden: number }) =>
  `Página ${String(v.pagina)} · video ${String(v.orden)}`;

const campo: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};
const boton: CSSProperties = {
  padding: "0.4rem 0.85rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.82rem",
  cursor: "pointer",
  color: "inherit",
};
const tarjeta: CSSProperties = {
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1rem 1.1rem",
  background: "white",
};

const ESTADO: Record<Estado, { texto: string; fondo: string; color: string }> = {
  PROCESANDO: { texto: "⏳ Comprimiendo…", fondo: "#eef3ff", color: "#1d4ed8" },
  BORRADOR: { texto: "👀 Por revisar", fondo: "#fff6e0", color: "#8a5a00" },
  PUBLICADO: { texto: "✅ Publicado", fondo: "#e8f6ec", color: "#1b5e20" },
  ERROR: { texto: "⚠️ Error", fondo: "#fdecec", color: "#c62828" },
};

export default function VideosLibroPage() {
  const [curso, setCurso] = useState<Curso>("JUNIOR");
  const [nivel, setNivel] = useState("ROOKIE");
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [limites, setLimites] = useState<Limites | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  // Formulario de subida.
  const [pagina, setPagina] = useState("");
  const [orden, setOrden] = useState(1);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previoLocal, setPrevioLocal] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null); // id en confirmación/borrado
  const [verPublicado, setVerPublicado] = useState<string | null>(null);
  const inputArchivo = useRef<HTMLInputElement | null>(null);
  const formulario = useRef<HTMLDivElement | null>(null);

  const cargar = useCallback(async () => {
    const q = new URLSearchParams({ curso, nivel });
    const res = await apiFetch(`/api/catalog/material/videos?${q.toString()}`);
    if (!res.ok) {
      setMsg({ ok: false, texto: "No se pudieron leer los videos." });
      return;
    }
    const data = (await res.json()) as { videos: Video[]; limites: Limites };
    setVideos(data.videos);
    setLimites(data.limites);
  }, [curso, nivel]);

  useEffect(() => {
    async function run() {
      setVideos(null);
      await cargar();
    }
    void run();
  }, [cargar]);

  // Mientras haya algo comprimiéndose, se consulta cada pocos segundos.
  const hayProcesando = videos?.some((v) => v.estado === "PROCESANDO") ?? false;
  useEffect(() => {
    if (!hayProcesando) return;
    const t = setInterval(() => void cargar(), 2500);
    return () => clearInterval(t);
  }, [hayProcesando, cargar]);

  // El previo local es un blob: se suelta al cambiar de archivo o salir.
  useEffect(() => {
    return () => {
      if (previoLocal !== null) URL.revokeObjectURL(previoLocal);
    };
  }, [previoLocal]);

  function elegirArchivo(f: File | null) {
    setArchivo(f);
    setPrevioLocal(f === null ? null : URL.createObjectURL(f));
    setMsg(null);
  }

  const numPagina = pagina.trim() === "" ? null : Number(pagina);
  const paginaOk =
    numPagina !== null &&
    Number.isInteger(numPagina) &&
    numPagina >= (limites?.paginaMin ?? 1) &&
    numPagina <= (limites?.paginaMax ?? 999);
  const publicadoEnCasilla =
    paginaOk && videos !== null
      ? (videos.find(
          (v) => v.estado === "PUBLICADO" && v.pagina === numPagina && v.orden === orden,
        ) ?? null)
      : null;

  async function subir() {
    if (archivo === null || !paginaOk || numPagina === null) return;
    if (limites !== null && archivo.size > limites.tamanoSubida) {
      setMsg({
        ok: false,
        texto: `“${archivo.name}” pesa ${mb(archivo.size)}; el máximo es ${mb(limites.tamanoSubida)}.`,
      });
      return;
    }
    setSubiendo(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("curso", curso);
      fd.append("nivel", nivel);
      fd.append("pagina", String(numPagina));
      fd.append("orden", String(orden));
      fd.append("archivo", archivo);
      const res = await apiFetch("/api/catalog/material/videos", { method: "POST", body: fd });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message: string } };
        setMsg({ ok: false, texto: d.error?.message ?? "No se pudo subir." });
        return;
      }
      setMsg({
        ok: true,
        texto: `✔ “${archivo.name}” subido. Se está comprimiendo; cuando termine, revisa el previo y confirma.`,
      });
      elegirArchivo(null);
      if (inputArchivo.current !== null) inputArchivo.current.value = "";
      await cargar();
    } catch {
      setMsg({ ok: false, texto: "Error de conexión durante la subida." });
    } finally {
      setSubiendo(false);
    }
  }

  async function confirmar(v: Video) {
    const viejo = videos?.find(
      (x) => x.estado === "PUBLICADO" && x.pagina === v.pagina && x.orden === v.orden,
    );
    const pregunta =
      viejo !== undefined
        ? `¿Publicar este video en la ${casilla(v).toLowerCase()}? Reemplaza al publicado (“${viejo.nombreOriginal}”), que se borra.`
        : `¿Publicar este video en la ${casilla(v).toLowerCase()}? Los niños lo verán en su libro.`;
    if (!window.confirm(pregunta)) return;
    await accion(v, `/api/catalog/material/videos/${v.id}/confirmar`, "POST", "✔ Publicado.");
  }

  async function borrar(v: Video) {
    const pregunta =
      v.estado === "PUBLICADO"
        ? `¿Borrar el video publicado de la ${casilla(v).toLowerCase()}? Los niños dejarán de verlo.`
        : `¿Descartar “${v.nombreOriginal}”?`;
    if (!window.confirm(pregunta)) return;
    await accion(v, `/api/catalog/material/videos/${v.id}`, "DELETE", "✔ Borrado.");
  }

  async function accion(v: Video, url: string, method: string, ok: string) {
    setOcupado(v.id);
    setMsg(null);
    try {
      const res = await apiFetch(url, { method });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message: string } };
        setMsg({ ok: false, texto: d.error?.message ?? "No se pudo completar." });
        return;
      }
      setMsg({ ok: true, texto: ok });
      await cargar();
    } finally {
      setOcupado(null);
    }
  }

  function reemplazar(v: Video) {
    setPagina(String(v.pagina));
    setOrden(v.orden);
    elegirArchivo(null);
    formulario.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    inputArchivo.current?.click();
  }

  const pendientes = videos?.filter((v) => v.estado !== "PUBLICADO") ?? [];
  const publicados = videos?.filter((v) => v.estado === "PUBLICADO") ?? [];
  const nombreNivel = NIVELES.find((n) => n.codigo === nivel)?.nombre ?? nivel;

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.9rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>Videos del libro</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Los videos del libro interactivo van aquí, <strong>no dentro del HTML</strong>. Al subirlos
        se comprimen solos (a 360p, lo que pesa una fracción); revisa el previo y{" "}
        <strong>confirma</strong> para que el niño lo vea. Un video sin confirmar no se publica.
      </p>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", marginTop: "0.3rem" }}>
        La <strong>página</strong> es la que se ve en el libro, arriba a la derecha (“Página 10 /
        28”). Diseño pide cada video por su casilla: el primer video de la página 10 es{" "}
        <code>videos/10-1.mp4</code>; el segundo, <code>videos/10-2.mp4</code>.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
        <div role="tablist" style={{ display: "flex", gap: "0.5rem" }}>
          {CURSOS.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={curso === c}
              onClick={() => setCurso(c)}
              style={{
                ...boton,
                fontSize: "0.9rem",
                padding: "0.5rem 1.2rem",
                background: curso === c ? "var(--lgs-azul)" : "white",
                color: curso === c ? "white" : "inherit",
                borderColor: curso === c ? "var(--lgs-azul)" : "#d8dce6",
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <select
          value={nivel}
          onChange={(e) => setNivel(e.target.value)}
          aria-label="Nivel"
          style={{ ...campo, minWidth: "12rem" }}
        >
          {NIVELES.map((n) => (
            <option key={n.codigo} value={n.codigo}>
              {n.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* —— Subir —— */}
      <div ref={formulario} style={{ ...tarjeta, marginTop: "1.25rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: 0 }}>
          Subir video · {curso} · {nombreNivel}
        </h2>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            marginTop: "0.8rem",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
              Página (la que se ve en el libro)
            </span>
            <input
              type="number"
              min={limites?.paginaMin ?? 1}
              max={limites?.paginaMax ?? 999}
              value={pagina}
              onChange={(e) => setPagina(e.target.value)}
              placeholder="p. ej. 10"
              style={{ ...campo, width: "8rem" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Video n° en la página</span>
            <select
              value={orden}
              onChange={(e) => setOrden(Number(e.target.value))}
              style={{ ...campo, width: "8rem" }}
            >
              {Array.from({ length: limites?.ordenMax ?? 9 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Video</span>
            <input
              ref={inputArchivo}
              type="file"
              accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi"
              onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
              style={campo}
            />
          </label>
        </div>

        {paginaOk && numPagina !== null && (
          <p style={{ fontSize: "0.85rem", marginTop: "0.7rem" }}>
            En el libro:{" "}
            <code>
              videos/{String(numPagina)}-{String(orden)}.mp4
            </code>
            {publicadoEnCasilla !== null && (
              <span style={{ color: "#8a5a00", fontWeight: 600 }}>
                {" "}
                · Esta casilla ya tiene un video publicado (“{publicadoEnCasilla.nombreOriginal}”).
                El nuevo lo reemplazará cuando lo confirmes.
              </span>
            )}
          </p>
        )}

        {previoLocal !== null && archivo !== null && (
          <div style={{ marginTop: "0.8rem" }}>
            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--texto-suave)" }}>
              PREVIO DEL ARCHIVO ELEGIDO · {mb(archivo.size)}
            </p>
            <video
              src={previoLocal}
              controls
              preload="metadata"
              style={{
                width: "100%",
                maxWidth: "26rem",
                borderRadius: "0.6rem",
                background: "#000",
              }}
            />
          </div>
        )}

        <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void subir()}
            disabled={subiendo || archivo === null || !paginaOk}
            style={{
              ...boton,
              border: "none",
              padding: "0.55rem 1.3rem",
              fontSize: "0.9rem",
              background:
                subiendo || archivo === null || !paginaOk ? "#c9ccd4" : "var(--lgs-verde)",
              color: "#1b2a10",
              cursor: subiendo || archivo === null || !paginaOk ? "not-allowed" : "pointer",
            }}
          >
            {subiendo ? "Subiendo…" : "Subir y comprimir"}
          </button>
          {limites !== null && (
            <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
              Máx. {mb(limites.tamanoSubida)} y {String(Math.round(limites.duracionMaximaSeg / 60))}{" "}
              min por video.
            </span>
          )}
        </div>
      </div>

      {msg !== null && (
        <p
          role="status"
          style={{ marginTop: "1rem", fontWeight: 600, color: msg.ok ? "#1b5e20" : "#c62828" }}
        >
          {msg.texto}
        </p>
      )}

      {videos === null && (
        <p style={{ marginTop: "1.25rem", color: "var(--texto-suave)" }}>Cargando…</p>
      )}

      {/* —— Por revisar, comprimiendo o con error —— */}
      {pendientes.length > 0 && (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>Por revisar</h2>
          <div style={{ display: "grid", gap: "0.8rem", marginTop: "0.6rem" }}>
            {pendientes.map((v) => {
              const e = ESTADO[v.estado];
              const reemplaza = videos?.find(
                (x) => x.estado === "PUBLICADO" && x.pagina === v.pagina && x.orden === v.orden,
              );
              return (
                <div key={v.id} style={tarjeta}>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.6rem",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>{casilla(v)}</strong>
                    <code style={{ fontSize: "0.8rem" }}>{v.ruta}</code>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        padding: "0.15rem 0.55rem",
                        borderRadius: "999px",
                        background: e.fondo,
                        color: e.color,
                      }}
                    >
                      {e.texto}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      color: "var(--texto-suave)",
                      marginTop: "0.3rem",
                    }}
                  >
                    {v.nombreOriginal} · {mb(v.bytesOriginal)}
                    {v.bytesFinal !== null && (
                      <>
                        {" "}
                        → <strong style={{ color: "#1b5e20" }}>{mb(v.bytesFinal)}</strong> (
                        {String(Math.round((1 - v.bytesFinal / v.bytesOriginal) * 100))} % menos)
                      </>
                    )}
                    {v.duracionSeg !== null && <> · {minutos(v.duracionSeg)}</>}
                    {v.alto !== null && v.ancho !== null && (
                      <>
                        {" "}
                        · {String(v.ancho)}×{String(v.alto)}
                      </>
                    )}
                  </div>
                  {v.estado === "ERROR" && v.error !== null && (
                    <p style={{ color: "#c62828", fontSize: "0.85rem", marginTop: "0.4rem" }}>
                      {v.error}
                    </p>
                  )}
                  {v.estado === "BORRADOR" && (
                    <>
                      <video
                        src={`/api/catalog/material/videos/${v.id}/ver`}
                        controls
                        preload="metadata"
                        style={{
                          width: "100%",
                          maxWidth: "26rem",
                          borderRadius: "0.6rem",
                          background: "#000",
                          marginTop: "0.6rem",
                        }}
                      />
                      {reemplaza !== undefined && (
                        <p style={{ fontSize: "0.82rem", color: "#8a5a00", marginTop: "0.4rem" }}>
                          Al confirmar reemplaza al publicado: “{reemplaza.nombreOriginal}”.
                        </p>
                      )}
                    </>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginTop: "0.7rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {v.estado === "BORRADOR" && (
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => void confirmar(v)}
                        style={{
                          ...boton,
                          border: "none",
                          background: "var(--lgs-verde)",
                          color: "#1b2a10",
                        }}
                      >
                        {reemplaza !== undefined
                          ? "Confirmar y reemplazar"
                          : "Confirmar y publicar"}
                      </button>
                    )}
                    {v.estado !== "PROCESANDO" && (
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => void borrar(v)}
                        style={{ ...boton, color: "#c62828" }}
                      >
                        Descartar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* —— Publicados —— */}
      {videos !== null && (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>
            Publicados en {curso} · {nombreNivel} ({String(publicados.length)})
          </h2>
          {publicados.length === 0 ? (
            <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", marginTop: "0.4rem" }}>
              Este nivel todavía no tiene videos publicados.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.6rem" }}>
              {publicados.map((v) => (
                <div key={v.id} style={tarjeta}>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.6rem",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>{casilla(v)}</strong>
                    <code style={{ fontSize: "0.8rem" }}>{v.ruta}</code>
                    <span style={{ fontSize: "0.82rem", color: "var(--texto-suave)" }}>
                      {v.nombreOriginal}
                      {v.bytesFinal !== null && <> · {mb(v.bytesFinal)}</>}
                      {v.duracionSeg !== null && <> · {minutos(v.duracionSeg)}</>}
                    </span>
                  </div>
                  {verPublicado === v.id && (
                    <video
                      src={`/api/catalog/material/videos/${v.id}/ver`}
                      controls
                      autoPlay
                      preload="metadata"
                      style={{
                        width: "100%",
                        maxWidth: "26rem",
                        borderRadius: "0.6rem",
                        background: "#000",
                        marginTop: "0.6rem",
                      }}
                    />
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginTop: "0.6rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setVerPublicado(verPublicado === v.id ? null : v.id)}
                      style={boton}
                    >
                      {verPublicado === v.id ? "Ocultar" : "Ver"}
                    </button>
                    <button type="button" onClick={() => reemplazar(v)} style={boton}>
                      Reemplazar
                    </button>
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => void borrar(v)}
                      style={{ ...boton, color: "#c62828" }}
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
