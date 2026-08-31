"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

type Curso = "JUNIOR" | "YOUNGSTER";
const CURSOS: Curso[] = ["JUNIOR", "YOUNGSTER"];
const NIVELES = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"] as const;

interface Item {
  nombre: string;
  url?: string;
  link?: string;
}
interface Pregunta {
  tipo: string;
  enunciado: string;
  opciones: string[];
  correcta: number;
  explicacion?: string;
}
interface Fila {
  id: string;
  curso: Curso;
  nivel: string;
  unidad: string | null;
  quiz: Pregunta[] | null;
  leccion: string;
  orden: number;
  contenido: string | null;
  video: string | null;
  clubes: Item[];
  materialUsuario: Item[];
  materialGuia: Item[];
  actividades: Item[];
  recursos: Item[];
}

interface FormState {
  id: string | null;
  curso: Curso;
  nivel: string;
  unidad: string;
  leccion: string;
  orden: string;
  contenido: string;
  video: string;
  materialGuia: Item[];
  materialUsuario: Item[];
  actividades: Item[];
  recursos: Item[];
  clubes: Item[];
  quiz: Pregunta[];
}

const vacio = (): FormState => ({
  id: null,
  curso: "JUNIOR",
  nivel: "ROOKIE",
  unidad: "",
  leccion: "",
  orden: "0",
  contenido: "",
  video: "",
  materialGuia: [],
  materialUsuario: [],
  actividades: [],
  recursos: [],
  clubes: [],
  quiz: [],
});

const input: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  width: "100%",
  boxSizing: "border-box",
};
const label: CSSProperties = { fontSize: "0.78rem", fontWeight: 600 };
const btn: CSSProperties = {
  padding: "0.4rem 0.8rem",
  borderRadius: "0.5rem",
  border: "1px solid #e3e7f0",
  background: "white",
  fontWeight: 600,
  fontSize: "0.82rem",
  cursor: "pointer",
};

/** Editor de una lista [{nombre, <valor>}] (material/actividades/recursos). */
function ListaEditor(props: {
  titulo: string;
  claveValor: "url" | "link";
  items: Item[];
  onChange: (items: Item[]) => void;
}) {
  const { titulo, claveValor, items, onChange } = props;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <span style={label}>{titulo}</span>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: "0.35rem" }}>
          <input
            placeholder="Nombre"
            value={it.nombre}
            onChange={(e) =>
              onChange(items.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))
            }
            style={{ ...input, flex: "1 1 8rem" }}
          />
          <input
            placeholder={claveValor === "url" ? "URL / key" : "Enlace"}
            value={it[claveValor] ?? ""}
            onChange={(e) =>
              onChange(items.map((x, j) => (j === i ? { ...x, [claveValor]: e.target.value } : x)))
            }
            style={{ ...input, flex: "2 1 12rem" }}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            style={{ ...btn, color: "#c62828" }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { nombre: "", [claveValor]: "" }])}
        style={{ ...btn, alignSelf: "flex-start" }}
      >
        + agregar
      </button>
    </div>
  );
}

/** Editor de preguntas del quiz. */
function QuizEditor(props: { preguntas: Pregunta[]; onChange: (p: Pregunta[]) => void }) {
  const { preguntas, onChange } = props;
  function patch(i: number, p: Partial<Pregunta>) {
    onChange(preguntas.map((q, j) => (j === i ? { ...q, ...p } : q)));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <span style={label}>Quiz (preguntas)</span>
      {preguntas.map((q, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #edf0f6",
            borderRadius: "0.6rem",
            padding: "0.6rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <input
              placeholder={`Pregunta ${i + 1}`}
              value={q.enunciado}
              onChange={(e) => patch(i, { enunciado: e.target.value })}
              style={{ ...input, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => onChange(preguntas.filter((_, j) => j !== i))}
              style={{ ...btn, color: "#c62828" }}
            >
              ✕
            </button>
          </div>
          {q.opciones.map((op, k) => (
            <div key={k} style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              <input
                type="radio"
                name={`correcta-${i}`}
                checked={q.correcta === k}
                onChange={() => patch(i, { correcta: k })}
                title="Correcta"
              />
              <input
                placeholder={`Opción ${k + 1}`}
                value={op}
                onChange={(e) =>
                  patch(i, { opciones: q.opciones.map((o, m) => (m === k ? e.target.value : o)) })
                }
                style={{ ...input, flex: 1 }}
              />
              {q.opciones.length > 2 && (
                <button
                  type="button"
                  onClick={() => patch(i, { opciones: q.opciones.filter((_, m) => m !== k) })}
                  style={{ ...btn, padding: "0.3rem 0.5rem" }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {q.opciones.length < 6 && (
            <button
              type="button"
              onClick={() => patch(i, { opciones: [...q.opciones, ""] })}
              style={{ ...btn, alignSelf: "flex-start" }}
            >
              + opción
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...preguntas,
            { tipo: "opcion_multiple", enunciado: "", opciones: ["", ""], correcta: 0 },
          ])
        }
        style={{ ...btn, alignSelf: "flex-start" }}
      >
        + pregunta
      </button>
    </div>
  );
}

export default function ReferenciaCursosPage() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [fCurso, setFCurso] = useState<string>("");
  const [fNivel, setFNivel] = useState<string>("");
  const [form, setForm] = useState<FormState>(vacio());
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fCurso) qs.set("curso", fCurso);
    if (fNivel) qs.set("nivel", fNivel);
    const res = await apiFetch(`/api/catalog/curso?${qs.toString()}`);
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

  function editar(f: Fila) {
    setForm({
      id: f.id,
      curso: f.curso,
      nivel: f.nivel,
      unidad: f.unidad ?? "",
      leccion: f.leccion,
      orden: String(f.orden),
      contenido: f.contenido ?? "",
      video: f.video ?? "",
      materialGuia: f.materialGuia ?? [],
      materialUsuario: f.materialUsuario ?? [],
      actividades: f.actividades ?? [],
      recursos: f.recursos ?? [],
      clubes: f.clubes ?? [],
      quiz: f.quiz ?? [],
    });
    setError(null);
    setAviso(null);
  }

  async function guardar() {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const body = {
        curso: form.curso,
        nivel: form.nivel,
        unidad: form.unidad || null,
        leccion: form.leccion,
        orden: Number(form.orden) || 0,
        contenido: form.contenido || null,
        video: form.video || null,
        materialGuia: form.materialGuia,
        materialUsuario: form.materialUsuario,
        actividades: form.actividades,
        recursos: form.recursos,
        clubes: form.clubes,
        quiz: form.quiz.length > 0 ? form.quiz : null,
      };
      const res = await apiFetch(
        form.id !== null ? `/api/catalog/curso/${form.id}` : "/api/catalog/curso",
        {
          method: form.id !== null ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo guardar.");
        return;
      }
      setAviso("Guardado.");
      setForm(vacio());
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar(f: Fila) {
    if (!window.confirm(`¿Eliminar "${f.leccion}" (${f.curso} · ${f.nivel})?`)) return;
    const res = await apiFetch(`/api/catalog/curso/${f.id}`, { method: "DELETE" });
    if (res.ok) {
      if (form.id === f.id) setForm(vacio());
      await cargar();
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "70rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.9rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>Referencia de cursos</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Material, video, actividades, recursos y quiz por curso · nivel · unidad · lección. Es la
        referencia compartida por todas las campañas.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(16rem, 22rem) 1fr",
          gap: "1.5rem",
          marginTop: "1rem",
        }}
      >
        {/* Lista */}
        <section>
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.6rem" }}>
            <select value={fCurso} onChange={(e) => setFCurso(e.target.value)} style={input}>
              <option value="">Todos los cursos</option>
              {CURSOS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={fNivel} onChange={(e) => setFNivel(e.target.value)} style={input}>
              <option value="">Todos los niveles</option>
              {NIVELES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setForm(vacio())}
            style={{
              ...btn,
              width: "100%",
              marginBottom: "0.6rem",
              borderColor: "var(--lgs-azul)",
              color: "var(--lgs-azul-oscuro)",
            }}
          >
            + Nueva lección
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {filas === null ? (
              <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>Cargando…</p>
            ) : filas.length === 0 ? (
              <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>
                Sin lecciones. Crea la primera.
              </p>
            ) : (
              filas.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.4rem",
                    padding: "0.5rem 0.6rem",
                    border: "1px solid #e3e7f0",
                    borderRadius: "0.6rem",
                    background: form.id === f.id ? "#e8f1fd" : "white",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => editar(f)}
                    style={{
                      background: "none",
                      border: "none",
                      textAlign: "left",
                      cursor: "pointer",
                      flex: 1,
                    }}
                  >
                    <strong style={{ fontSize: "0.85rem" }}>{f.leccion}</strong>
                    <div style={{ fontSize: "0.72rem", color: "var(--texto-suave)" }}>
                      {f.curso} · {f.nivel}
                      {f.unidad ? ` · ${f.unidad}` : ""}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void eliminar(f)}
                    style={{ background: "none", border: "none", cursor: "pointer" }}
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Formulario */}
        <section
          style={{
            border: "1px solid #e3e7f0",
            borderRadius: "0.9rem",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <strong style={{ fontSize: "1.05rem" }}>
            {form.id !== null ? "Editar lección" : "Nueva lección"}
          </strong>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
              gap: "0.6rem",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={label}>Curso</span>
              <select
                value={form.curso}
                onChange={(e) => setForm({ ...form, curso: e.target.value as Curso })}
                style={input}
              >
                {CURSOS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={label}>Nivel</span>
              <select
                value={form.nivel}
                onChange={(e) => setForm({ ...form, nivel: e.target.value })}
                style={input}
              >
                {NIVELES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={label}>Unidad</span>
              <input
                value={form.unidad}
                onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                placeholder="Unidad 1"
                style={input}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={label}>Lección</span>
              <input
                value={form.leccion}
                onChange={(e) => setForm({ ...form, leccion: e.target.value })}
                placeholder="Lección 1"
                style={input}
              />
            </label>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", maxWidth: "6rem" }}
            >
              <span style={label}>Orden</span>
              <input
                type="number"
                min={0}
                value={form.orden}
                onChange={(e) => setForm({ ...form, orden: e.target.value })}
                style={input}
              />
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={label}>Temario / contenido (markdown)</span>
            <textarea
              value={form.contenido}
              onChange={(e) => setForm({ ...form, contenido: e.target.value })}
              rows={4}
              style={{ ...input, resize: "vertical", fontFamily: "inherit" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={label}>Video (URL o key de storage)</span>
            <input
              value={form.video}
              onChange={(e) => setForm({ ...form, video: e.target.value })}
              placeholder="videos/…mp4"
              style={input}
            />
          </label>

          <ListaEditor
            titulo="Material del guía"
            claveValor="url"
            items={form.materialGuia}
            onChange={(items) => setForm({ ...form, materialGuia: items })}
          />
          <ListaEditor
            titulo="Material del alumno (libros)"
            claveValor="url"
            items={form.materialUsuario}
            onChange={(items) => setForm({ ...form, materialUsuario: items })}
          />
          <ListaEditor
            titulo="Actividades"
            claveValor="link"
            items={form.actividades}
            onChange={(items) => setForm({ ...form, actividades: items })}
          />
          <ListaEditor
            titulo="Recursos"
            claveValor="link"
            items={form.recursos}
            onChange={(items) => setForm({ ...form, recursos: items })}
          />
          <ListaEditor
            titulo="Clubes"
            claveValor="link"
            items={form.clubes}
            onChange={(items) => setForm({ ...form, clubes: items })}
          />
          <QuizEditor preguntas={form.quiz} onChange={(q) => setForm({ ...form, quiz: q })} />

          {aviso !== null && <p style={{ color: "#1b5e20", margin: 0 }}>{aviso}</p>}
          {error !== null && (
            <p role="alert" style={{ color: "#c62828", margin: 0 }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={ocupado || form.leccion.trim() === ""}
              style={{
                ...btn,
                background: "var(--lgs-verde)",
                color: "#1b2a10",
                borderColor: "var(--lgs-verde)",
                padding: "0.55rem 1.4rem",
                fontSize: "0.9rem",
              }}
            >
              {ocupado ? "Guardando…" : form.id !== null ? "Guardar cambios" : "Crear lección"}
            </button>
            {form.id !== null && (
              <button
                type="button"
                onClick={() => setForm(vacio())}
                style={{ ...btn, padding: "0.55rem 1.2rem" }}
              >
                Cancelar
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
