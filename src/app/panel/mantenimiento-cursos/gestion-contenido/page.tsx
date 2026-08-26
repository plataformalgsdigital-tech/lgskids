"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

type Curso = "JUNIOR" | "YOUNGSTER";
const CURSOS: Curso[] = ["JUNIOR", "YOUNGSTER"];
const NIVELES = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"] as const;

type TipoPregunta = "opcion_multiple" | "verdadero_falso" | "respuesta_escrita";
const NOMBRE_TIPO: Record<TipoPregunta, string> = {
  opcion_multiple: "Opción múltiple",
  verdadero_falso: "Verdadero / Falso",
  respuesta_escrita: "Respuesta escrita",
};

interface Pregunta {
  tipo: TipoPregunta;
  enunciado: string;
  opciones: string[];
  correcta: number;
  respuesta?: string;
}
interface Cuestionario {
  titulo: string;
  minutos: number;
  preguntas: Pregunta[];
}
interface LinkItem {
  nombre: string;
  link: string;
}
interface Fila {
  id: string;
  curso: Curso;
  nivel: string;
  unidad: string | null;
  leccion: string;
  orden: number;
  contenido: string | null;
  video: string | null;
  actividades: LinkItem[];
  quiz: unknown;
}

const input: CSSProperties = {
  padding: "0.45rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.88rem",
  width: "100%",
  boxSizing: "border-box",
};
const label: CSSProperties = { fontSize: "0.76rem", fontWeight: 600 };
const btn: CSSProperties = {
  padding: "0.35rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid #e3e7f0",
  background: "white",
  fontWeight: 600,
  fontSize: "0.8rem",
  cursor: "pointer",
};

function normalizarQuiz(quiz: unknown): Cuestionario[] {
  if (quiz !== null && typeof quiz === "object" && !Array.isArray(quiz)) {
    const c = (quiz as { cuestionarios?: unknown }).cuestionarios;
    if (Array.isArray(c)) return c as Cuestionario[];
  }
  if (Array.isArray(quiz) && quiz.length > 0) {
    return [{ titulo: "Cuestionario 1", minutos: 15, preguntas: quiz as Pregunta[] }];
  }
  return [];
}

function nuevaPregunta(): Pregunta {
  return { tipo: "opcion_multiple", enunciado: "", opciones: ["", ""], correcta: 0 };
}

/** Editor de una pregunta según su tipo. */
function PreguntaEditor(props: { p: Pregunta; onChange: (p: Pregunta) => void; onRemove: () => void }) {
  const { p, onChange, onRemove } = props;
  function setTipo(tipo: TipoPregunta) {
    if (tipo === "verdadero_falso") onChange({ ...p, tipo, opciones: ["Verdadero", "Falso"], correcta: 0 });
    else if (tipo === "respuesta_escrita") onChange({ ...p, tipo, opciones: [], correcta: 0 });
    else onChange({ ...p, tipo, opciones: p.opciones.length >= 2 ? p.opciones : ["", ""] });
  }
  return (
    <div style={{ border: "1px solid #edf0f6", borderRadius: "0.6rem", padding: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
        <select value={p.tipo} onChange={(e) => setTipo(e.target.value as TipoPregunta)} style={{ ...input, width: "12rem" }}>
          {(Object.keys(NOMBRE_TIPO) as TipoPregunta[]).map((t) => (
            <option key={t} value={t}>
              {NOMBRE_TIPO[t]}
            </option>
          ))}
        </select>
        <button type="button" onClick={onRemove} style={{ ...btn, color: "#c62828", marginLeft: "auto" }}>
          Eliminar
        </button>
      </div>
      <textarea
        placeholder="Enunciado"
        value={p.enunciado}
        onChange={(e) => onChange({ ...p, enunciado: e.target.value })}
        rows={2}
        style={{ ...input, resize: "vertical", fontFamily: "inherit" }}
      />
      {p.tipo === "respuesta_escrita" ? (
        <input
          placeholder="Respuesta esperada (opcional)"
          value={p.respuesta ?? ""}
          onChange={(e) => onChange({ ...p, respuesta: e.target.value })}
          style={input}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span style={label}>Opciones (marca la correcta)</span>
          {p.opciones.map((op, k) => (
            <div key={k} style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              <input
                type="radio"
                checked={p.correcta === k}
                onChange={() => onChange({ ...p, correcta: k })}
                title="Correcta"
              />
              <input
                value={op}
                onChange={(e) => onChange({ ...p, opciones: p.opciones.map((o, m) => (m === k ? e.target.value : o)) })}
                readOnly={p.tipo === "verdadero_falso"}
                placeholder={`Opción ${k + 1}`}
                style={input}
              />
              {p.tipo === "opcion_multiple" && p.opciones.length > 2 && (
                <button type="button" onClick={() => onChange({ ...p, opciones: p.opciones.filter((_, m) => m !== k) })} style={{ ...btn, padding: "0.25rem 0.5rem" }}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {p.tipo === "opcion_multiple" && p.opciones.length < 6 && (
            <button type="button" onClick={() => onChange({ ...p, opciones: [...p.opciones, ""] })} style={{ ...btn, alignSelf: "flex-start" }}>
              + opción
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Editor de un cuestionario (título + minutos + preguntas). */
function CuestionarioEditor(props: { c: Cuestionario; idx: number; onChange: (c: Cuestionario) => void; onRemove: () => void }) {
  const { c, idx, onChange, onRemove } = props;
  return (
    <div style={{ border: "1.5px solid #e0d4f0", borderRadius: "0.7rem", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ color: "var(--lgs-purpura)" }}>Cuestionario {idx + 1}</strong>
        <input value={c.titulo} onChange={(e) => onChange({ ...c, titulo: e.target.value })} placeholder="Título" style={{ ...input, flex: 1, minWidth: "10rem" }} />
        <input type="number" min={1} max={180} value={c.minutos} onChange={(e) => onChange({ ...c, minutos: Number(e.target.value) || 0 })} style={{ ...input, width: "5rem" }} title="Minutos" />
        <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>min</span>
        <button type="button" onClick={onRemove} style={{ ...btn, color: "#c62828" }}>
          Eliminar cuestionario
        </button>
      </div>
      {c.preguntas.map((p, i) => (
        <PreguntaEditor
          key={i}
          p={p}
          onChange={(np) => onChange({ ...c, preguntas: c.preguntas.map((x, j) => (j === i ? np : x)) })}
          onRemove={() => onChange({ ...c, preguntas: c.preguntas.filter((_, j) => j !== i) })}
        />
      ))}
      <button type="button" onClick={() => onChange({ ...c, preguntas: [...c.preguntas, nuevaPregunta()] })} style={{ ...btn, alignSelf: "flex-start" }}>
        + pregunta
      </button>
    </div>
  );
}

/** Tarjeta editable de una lección (contenido + WordWall + evaluación). */
function LeccionCard(props: { row: Fila; onSaved: () => void }) {
  const { row, onSaved } = props;
  const [leccion, setLeccion] = useState(row.leccion);
  const [unidad, setUnidad] = useState(row.unidad ?? "");
  const [orden, setOrden] = useState(String(row.orden));
  const [contenido, setContenido] = useState(row.contenido ?? "");
  const [video, setVideo] = useState(row.video ?? "");
  const [actividades, setActividades] = useState<LinkItem[]>(row.actividades ?? []);
  const [cuestionarios, setCuestionarios] = useState<Cuestionario[]>(() => normalizarQuiz(row.quiz));
  const [verPreview, setVerPreview] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    setOcupado(true);
    setMsg(null);
    try {
      const res = await apiFetch(`/api/catalog/curso/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curso: row.curso,
          nivel: row.nivel,
          unidad: unidad || null,
          leccion,
          orden: Number(orden) || 0,
          contenido: contenido || null,
          video: video || null,
          actividades,
          quiz: cuestionarios.length > 0 ? { cuestionarios } : null,
        }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setMsg(data.error?.message ?? "No se pudo guardar.");
        return;
      }
      setMsg("✔ Guardada.");
      onSaved();
    } catch {
      setMsg("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e3e7f0", borderRadius: "0.9rem", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.15rem", flex: "2 1 12rem" }}>
          <span style={label}>Lección (título)</span>
          <input value={leccion} onChange={(e) => setLeccion(e.target.value)} style={input} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.15rem", flex: "1 1 8rem" }}>
          <span style={label}>Unidad</span>
          <input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="Unidad 1" style={input} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.15rem", width: "5rem" }}>
          <span style={label}>Orden</span>
          <input type="number" min={0} value={orden} onChange={(e) => setOrden(e.target.value)} style={input} />
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        <span style={{ ...label, display: "flex", justifyContent: "space-between" }}>
          Contenido / temario
          <button type="button" onClick={() => setVerPreview((v) => !v)} style={{ ...btn, padding: "0.15rem 0.5rem" }}>
            {verPreview ? "Editar" : "Vista previa"}
          </button>
        </span>
        {verPreview ? (
          <div style={{ ...input, minHeight: "5rem", whiteSpace: "pre-wrap", background: "#f9fafc" }}>{contenido || "—"}</div>
        ) : (
          <textarea value={contenido} onChange={(e) => setContenido(e.target.value)} rows={4} style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
        )}
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        <span style={label}>Video (URL o key)</span>
        <input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="videos/…mp4" style={input} />
      </label>

      {/* Actividades WordWall de la lección */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        <span style={label}>Actividades WordWall (de la lección)</span>
        {actividades.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: "0.35rem" }}>
            <input placeholder="Nombre visible" value={a.nombre} onChange={(e) => setActividades(actividades.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} style={{ ...input, flex: "1 1 8rem" }} />
            <input placeholder="https://wordwall.net/…" value={a.link} onChange={(e) => setActividades(actividades.map((x, j) => (j === i ? { ...x, link: e.target.value } : x)))} style={{ ...input, flex: "2 1 12rem" }} />
            <button type="button" onClick={() => setActividades(actividades.filter((_, j) => j !== i))} style={{ ...btn, color: "#c62828" }}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setActividades([...actividades, { nombre: "", link: "" }])} style={{ ...btn, alignSelf: "flex-start" }}>
          + agregar actividad
        </button>
      </div>

      {/* Evaluación (varios cuestionarios) */}
      <div style={{ border: "1px dashed #d8cef0", borderRadius: "0.7rem", padding: "0.7rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <strong>Evaluación</strong>
          <span style={{ fontSize: "0.76rem", color: "var(--texto-suave)" }}>
            varios cuestionarios · se presentan en orden · se autocalifican
          </span>
        </div>
        {cuestionarios.map((c, i) => (
          <CuestionarioEditor
            key={i}
            c={c}
            idx={i}
            onChange={(nc) => setCuestionarios(cuestionarios.map((x, j) => (j === i ? nc : x)))}
            onRemove={() => setCuestionarios(cuestionarios.filter((_, j) => j !== i))}
          />
        ))}
        <button
          type="button"
          onClick={() => setCuestionarios([...cuestionarios, { titulo: `Cuestionario ${cuestionarios.length + 1}`, minutos: 15, preguntas: [nuevaPregunta()] }])}
          style={{ ...btn, alignSelf: "flex-start", borderColor: "var(--lgs-purpura)", color: "var(--lgs-purpura)" }}
        >
          + cuestionario
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={ocupado || leccion.trim() === ""}
          style={{ ...btn, background: "var(--lgs-verde)", borderColor: "var(--lgs-verde)", color: "#1b2a10", padding: "0.5rem 1.3rem", fontSize: "0.88rem" }}
        >
          {ocupado ? "Guardando…" : "Guardar lección"}
        </button>
        {msg !== null && <span style={{ fontSize: "0.85rem", color: msg.startsWith("✔") ? "#1b5e20" : "#c62828" }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function GestionContenidoPage() {
  const [fCurso, setFCurso] = useState<Curso>("JUNIOR");
  const [fNivel, setFNivel] = useState<string>("ROOKIE");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [creando, setCreando] = useState(false);
  const [nuevaLeccion, setNuevaLeccion] = useState("");
  const [nuevaUnidad, setNuevaUnidad] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/catalog/curso?curso=${fCurso}&nivel=${fNivel}`);
    if (res.ok) {
      const data: { referencias: Fila[] } = await res.json();
      setFilas(data.referencias);
    }
  }, [fCurso, fNivel]);

  useEffect(() => {
    async function run() {
      await cargar();
    }
    void run();
  }, [cargar]);

  async function agregar() {
    if (nuevaLeccion.trim() === "") return;
    setCreando(true);
    setError(null);
    try {
      const res = await apiFetch("/api/catalog/curso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curso: fCurso,
          nivel: fNivel,
          unidad: nuevaUnidad || null,
          leccion: nuevaLeccion,
          orden: (filas?.length ?? 0) + 1,
        }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo crear.");
        return;
      }
      setNuevaLeccion("");
      setNuevaUnidad("");
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setCreando(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "62rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.9rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>Gestión de Contenido</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Edita el temario de cada lección y su evaluación (varios cuestionarios). Elige curso y nivel.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={label}>Curso</span>
          <select value={fCurso} onChange={(e) => setFCurso(e.target.value as Curso)} style={{ ...input, width: "12rem" }}>
            {CURSOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={label}>Nivel</span>
          <select value={fNivel} onChange={(e) => setFNivel(e.target.value)} style={{ ...input, width: "12rem" }}>
            {NIVELES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Agregar lección */}
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "2 1 12rem" }}>
          <span style={label}>Nueva lección</span>
          <input value={nuevaLeccion} onChange={(e) => setNuevaLeccion(e.target.value)} placeholder="Lección 1" style={input} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 8rem" }}>
          <span style={label}>Unidad</span>
          <input value={nuevaUnidad} onChange={(e) => setNuevaUnidad(e.target.value)} placeholder="Unidad 1" style={input} />
        </label>
        <button type="button" onClick={() => void agregar()} disabled={creando || nuevaLeccion.trim() === ""} style={{ ...btn, background: "var(--lgs-azul)", borderColor: "var(--lgs-azul)", color: "white", padding: "0.5rem 1.2rem" }}>
          {creando ? "Agregando…" : "+ Agregar lección"}
        </button>
      </div>
      {error !== null && <p role="alert" style={{ color: "#c62828" }}>{error}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.25rem" }}>
        {filas === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : filas.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>
            {fCurso} · {fNivel}: sin lecciones. Agrega la primera arriba.
          </p>
        ) : (
          filas.map((f) => <LeccionCard key={f.id} row={f} onSaved={() => void cargar()} />)
        )}
      </div>
    </main>
  );
}
