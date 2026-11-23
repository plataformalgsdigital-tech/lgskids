"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { ConOpcion } from "@/ui/ConOpcion";
import { SoloSi } from "@/ui/SoloSi";
import { ICONO_TIPO, NOMBRE_TIPO, VisorMaterialGuia, type ItemGuia } from "@/ui/VisorMaterialGuia";

/**
 * Mantenimiento Académico › Material Guía. Se elige Curso → Nivel → Lección y, en dos
 * pestañas, se sube lo que el guía abre desde el panel de la sesión:
 *  - Material: presentaciones (PPT/PPTX) y PDF;
 *  - Recursos: imágenes, videos mp4 y enlaces.
 * Cada lección admite varios ítems, con título y orden.
 */

type Curso = "JUNIOR" | "YOUNGSTER";
type Tab = "MATERIAL" | "RECURSO";
const CURSOS: Curso[] = ["JUNIOR", "YOUNGSTER"];
const NIVELES = [
  ["ROOKIE", "Rookie"],
  ["CHAMPION", "Champion"],
  ["ELITE", "Elite"],
  ["LEGENDARY", "Legendary"],
  ["ULTIMATE", "Ultimate Stage"],
] as const;

interface Leccion {
  id: string;
  unidad: string | null;
  leccion: string;
  orden: number;
}
interface Limites {
  tamanoMaximo: number;
  aceptan: Record<Tab, string>;
}

const ACCEPT: Record<Tab, string> = {
  MATERIAL: ".pdf,.ppt,.pptx,.pps,.ppsx,.pptm,.ppsm",
  RECURSO: ".jpg,.jpeg,.png,.webp,.mp4,.m4v",
};
const TITULO_TAB: Record<Tab, string> = { MATERIAL: "📖 Material", RECURSO: "🔗 Recursos" };

const input: CSSProperties = {
  padding: "0.45rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.88rem",
};
const etiqueta: CSSProperties = { fontSize: "0.76rem", fontWeight: 600 };
const boton: CSSProperties = {
  padding: "0.35rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.8rem",
  cursor: "pointer",
};

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

async function mensaje(res: Response, porDefecto: string): Promise<string> {
  try {
    const d = (await res.json()) as { error?: { message?: string } };
    return d.error?.message ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

function MaterialGuiaPageContenido() {
  const [curso, setCurso] = useState<Curso>("JUNIOR");
  const [nivel, setNivel] = useState<string>("ROOKIE");
  const [lecciones, setLecciones] = useState<Leccion[] | null>(null);
  const [leccionId, setLeccionId] = useState("");
  const [tab, setTab] = useState<Tab>("MATERIAL");
  const [items, setItems] = useState<ItemGuia[] | null>(null);
  const [limites, setLimites] = useState<Limites | null>(null);
  const [viendo, setViendo] = useState<ItemGuia | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Formulario de subida.
  const [archivos, setArchivos] = useState<File[]>([]);
  const [titulo, setTitulo] = useState("");
  const [enlace, setEnlace] = useState("");
  const [claveInput, setClaveInput] = useState(0);

  // Lecciones del curso y nivel elegidos.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      setLecciones(null);
      setLeccionId("");
      const res = await apiFetch(`/api/catalog/curso?curso=${curso}&nivel=${nivel}`);
      if (!vigente) return;
      if (!res.ok) {
        setLecciones([]);
        return;
      }
      const d = (await res.json()) as { referencias: Leccion[] };
      const ordenadas = [...d.referencias].sort((a, b) => a.orden - b.orden);
      setLecciones(ordenadas);
      setLeccionId(ordenadas[0]?.id ?? "");
    })();
    return () => {
      vigente = false;
    };
  }, [curso, nivel]);

  const cargar = useCallback(async () => {
    if (leccionId === "") {
      setItems([]);
      return;
    }
    const res = await apiFetch(`/api/catalog/material-guia?cursoId=${leccionId}&tab=${tab}`);
    if (!res.ok) {
      setMsg({ ok: false, texto: await mensaje(res, "No se pudo leer el material.") });
      setItems([]);
      return;
    }
    const d = (await res.json()) as { items: ItemGuia[]; limites: Limites };
    setItems(d.items);
    setLimites(d.limites);
  }, [leccionId, tab]);

  useEffect(() => {
    async function run() {
      setViendo(null);
      await cargar();
    }
    void run();
  }, [cargar]);

  function limpiarFormulario() {
    setArchivos([]);
    setTitulo("");
    setEnlace("");
    setClaveInput((n) => n + 1);
  }

  async function subir() {
    if (leccionId === "") return;
    if (limites !== null) {
      const grande = archivos.find((a) => a.size > limites.tamanoMaximo);
      if (grande !== undefined) {
        setMsg({
          ok: false,
          texto: `“${grande.name}” pesa ${mb(grande.size)}; el máximo es ${mb(limites.tamanoMaximo)}.`,
        });
        return;
      }
    }
    setOcupado(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("cursoId", leccionId);
      fd.set("tab", tab);
      if (titulo.trim() !== "") fd.set("titulo", titulo.trim());
      if (enlace.trim() !== "") fd.set("enlace", enlace.trim());
      for (const a of archivos) fd.append("archivo", a);
      const res = await apiFetch("/api/catalog/material-guia", { method: "POST", body: fd });
      if (!res.ok) {
        setMsg({ ok: false, texto: await mensaje(res, "No se pudo subir.") });
        return;
      }
      const d = (await res.json()) as {
        creados: string[];
        errores: { nombre: string; mensaje: string }[];
      };
      const fallos = d.errores.map((e) => `${e.nombre}: ${e.mensaje}`).join(" · ");
      setMsg({
        ok: d.errores.length === 0,
        texto:
          `✔ ${String(d.creados.length)} ítem(s) guardado(s).` +
          (fallos === "" ? "" : ` No se pudo: ${fallos}`),
      });
      limpiarFormulario();
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(item: ItemGuia) {
    if (!window.confirm(`¿Quitar “${item.titulo}”? También se borra su archivo.`)) return;
    const res = await apiFetch(`/api/catalog/material-guia/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      setMsg({ ok: false, texto: await mensaje(res, "No se pudo quitar.") });
      return;
    }
    if (viendo?.id === item.id) setViendo(null);
    await cargar();
  }

  /** Mueve un ítem y renumera la lista (1..N): dos ítems nunca quedan con el mismo orden. */
  async function mover(i: number, delta: -1 | 1) {
    if (items === null) return;
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const nuevo = [...items];
    const [x] = nuevo.splice(i, 1);
    if (x === undefined) return;
    nuevo.splice(j, 0, x);
    for (const [k, it] of nuevo.entries()) {
      if (it.orden !== k + 1) {
        await apiFetch(`/api/catalog/material-guia/${it.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orden: k + 1 }),
        });
      }
    }
    await cargar();
  }

  async function renombrar(item: ItemGuia) {
    const nuevo = window.prompt("Título del ítem", item.titulo);
    if (nuevo === null || nuevo.trim() === "" || nuevo.trim() === item.titulo) return;
    const res = await apiFetch(`/api/catalog/material-guia/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: nuevo.trim() }),
    });
    if (!res.ok) setMsg({ ok: false, texto: await mensaje(res, "No se pudo renombrar.") });
    await cargar();
  }

  const leccionActual = lecciones?.find((l) => l.id === leccionId) ?? null;

  return (
    <main style={{ padding: "2rem", maxWidth: "62rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.9rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>Material Guía</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", maxWidth: "46rem" }}>
        Lo que el guía abre desde “Material” y “Recursos” en el panel de la sesión, por lección.
        Elige curso, nivel y lección, y sube presentaciones y PDF (Material) o imágenes, videos y
        enlaces (Recursos).
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={etiqueta}>Curso</span>
          <select
            value={curso}
            onChange={(e) => setCurso(e.target.value as Curso)}
            style={{ ...input, width: "10rem" }}
          >
            {CURSOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={etiqueta}>Nivel</span>
          <select
            value={nivel}
            onChange={(e) => setNivel(e.target.value)}
            style={{ ...input, width: "11rem" }}
          >
            {NIVELES.map(([codigo, nombre]) => (
              <option key={codigo} value={codigo}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label
          style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 16rem" }}
        >
          <span style={etiqueta}>Lección</span>
          <select
            value={leccionId}
            onChange={(e) => setLeccionId(e.target.value)}
            style={input}
            disabled={lecciones === null || lecciones.length === 0}
          >
            {lecciones === null && <option>Cargando…</option>}
            {lecciones?.length === 0 && <option>Este nivel no tiene lecciones cargadas</option>}
            {lecciones?.map((l) => (
              <option key={l.id} value={l.id}>
                {[l.unidad, l.leccion].filter((x) => x !== null && x !== "").join(" · ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div role="tablist" style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        {(["MATERIAL", "RECURSO"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            style={{
              ...boton,
              padding: "0.55rem 1.2rem",
              border: tab === t ? "2px solid var(--lgs-azul)" : "1.5px solid #d8dce6",
              background: tab === t ? "#eef5ff" : "white",
            }}
          >
            {TITULO_TAB[t]}
          </button>
        ))}
      </div>

      <section
        style={{
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "1rem",
          marginTop: "0.8rem",
        }}
      >
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.6rem" }}>
          {TITULO_TAB[tab]} de {leccionActual?.leccion ?? "la lección"}
        </h2>

        {leccionId === "" ? (
          <p style={{ color: "var(--texto-suave)" }}>Elige una lección.</p>
        ) : items === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : items.length === 0 ? (
          <p style={{ color: "var(--texto-suave)", fontSize: "0.88rem" }}>
            Todavía no hay nada en esta lección.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {items.map((it, i) => (
              <div
                key={it.id}
                style={{
                  display: "flex",
                  gap: "0.6rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                  padding: "0.45rem 0.6rem",
                  background: "#fafbfe",
                  borderRadius: "0.6rem",
                  border: viendo?.id === it.id ? "2px solid var(--lgs-azul)" : "1px solid #edf0f6",
                }}
              >
                <span style={{ fontWeight: 800, minWidth: "1.5rem" }}>{it.orden}</span>
                <span style={{ flex: "1 1 14rem", minWidth: 0 }}>
                  <strong>
                    {ICONO_TIPO[it.tipo]} {it.titulo}
                  </strong>
                  <span
                    style={{ display: "block", fontSize: "0.76rem", color: "var(--texto-suave)" }}
                  >
                    {NOMBRE_TIPO[it.tipo]}
                    {it.archivo !== null && ` · ${it.archivo.nombre} · ${mb(it.archivo.bytes)}`}
                    {it.enlace !== null && ` · ${it.enlace}`}
                  </span>
                </span>
                <button
                  type="button"
                  style={boton}
                  onClick={() => setViendo(viendo?.id === it.id ? null : it)}
                >
                  {viendo?.id === it.id ? "Ocultar" : "Ver"}
                </button>
                <SoloSi op="op.mant.material_guia_subir">
                  <button
                    type="button"
                    style={boton}
                    onClick={() => void mover(i, -1)}
                    disabled={i === 0}
                    aria-label="Subir"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    style={boton}
                    onClick={() => void mover(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label="Bajar"
                  >
                    ▼
                  </button>
                  <button type="button" style={boton} onClick={() => void renombrar(it)}>
                    ✏️
                  </button>
                  <button
                    type="button"
                    style={{ ...boton, color: "#c62828" }}
                    onClick={() => void quitar(it)}
                  >
                    Quitar
                  </button>
                </SoloSi>
              </div>
            ))}
          </div>
        )}

        {viendo !== null && (
          <div style={{ marginTop: "0.8rem" }}>
            <VisorMaterialGuia item={viendo} onCerrar={() => setViendo(null)} />
          </div>
        )}

        <SoloSi op="op.mant.material_guia_subir">
          <div
            style={{
              marginTop: "1rem",
              paddingTop: "0.8rem",
              borderTop: "1px dashed #d8dce6",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <strong style={{ fontSize: "0.9rem" }}>Agregar a esta lección</strong>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={etiqueta}>
                Archivos ({limites?.aceptan[tab] ?? ""}, hasta{" "}
                {limites === null ? "80 MB" : mb(limites.tamanoMaximo)} cada uno)
              </span>
              <input
                key={claveInput}
                type="file"
                multiple
                accept={ACCEPT[tab]}
                onChange={(e) => setArchivos(Array.from(e.target.files ?? []))}
                style={input}
              />
            </label>
            {tab === "RECURSO" && (
              <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <span style={etiqueta}>…o un enlace (YouTube, Vimeo, una página)</span>
                <input
                  value={enlace}
                  onChange={(e) => setEnlace(e.target.value)}
                  placeholder="https://…"
                  style={input}
                />
              </label>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={etiqueta}>
                Título (opcional; con varios archivos cada uno toma su nombre)
              </span>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} style={input} />
            </label>
            <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void subir()}
                disabled={
                  ocupado || (archivos.length === 0 && enlace.trim() === "") || leccionId === ""
                }
                style={{
                  ...boton,
                  background: "var(--lgs-verde)",
                  borderColor: "var(--lgs-verde)",
                  color: "#1b2a10",
                  padding: "0.5rem 1.3rem",
                }}
              >
                {ocupado ? "Subiendo…" : "Subir"}
              </button>
              {msg !== null && (
                <span
                  style={{
                    fontSize: "0.85rem",
                    color: msg.ok ? "#1b5e20" : "#c62828",
                    fontWeight: 600,
                  }}
                >
                  {msg.texto}
                </span>
              )}
            </div>
          </div>
        </SoloSi>
      </section>
    </main>
  );
}

/** La página es una opción de Roles: sin ella, "No tienes acceso". */
export default function MaterialGuiaPage() {
  return (
    <ConOpcion op="op.mant.material_guia" volver="/panel/mantenimiento-cursos">
      <MaterialGuiaPageContenido />
    </ConOpcion>
  );
}
