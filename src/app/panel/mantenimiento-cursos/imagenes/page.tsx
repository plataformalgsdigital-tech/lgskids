"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

type Curso = "JUNIOR" | "YOUNGSTER";
const CURSOS: Curso[] = ["JUNIOR", "YOUNGSTER"];
// "TODOS" = imagen para TODO el curso (respaldo de los niveles sin imagen propia).
const NIVELES = [
  { valor: "TODOS", etiqueta: "Todo el curso (todos los niveles)" },
  { valor: "ROOKIE", etiqueta: "ROOKIE" },
  { valor: "CHAMPION", etiqueta: "CHAMPION" },
  { valor: "ELITE", etiqueta: "ELITE" },
  { valor: "LEGENDARY", etiqueta: "LEGENDARY" },
  { valor: "ULTIMATE", etiqueta: "ULTIMATE" },
] as const;

const input: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

export default function ImagenesCursoPage() {
  const [curso, setCurso] = useState<Curso>("JUNIOR");
  const [nivel, setNivel] = useState<string>("ROOKIE");
  const [actualUrl, setActualUrl] = useState<string | null>(null);
  const [previo, setPrevio] = useState<string | null>(null); // data URL del archivo elegido
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cargarActual = useCallback(async () => {
    const res = await apiFetch(`/api/catalog/imagen-curso?curso=${curso}&nivel=${nivel}`);
    if (res.ok) {
      const data: { url: string | null } = await res.json();
      // cache-buster para ver la última tras subir
      setActualUrl(data.url !== null ? `${data.url}?t=${Date.now()}` : null);
    }
  }, [curso, nivel]);

  useEffect(() => {
    async function run() {
      setPrevio(null);
      setArchivo(null);
      setMsg(null);
      await cargarActual();
    }
    void run();
  }, [cargarActual]);

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setArchivo(f);
    setMsg(null);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setPrevio(String(reader.result ?? ""));
      reader.readAsDataURL(f);
    } else {
      setPrevio(null);
    }
  }

  async function subir() {
    if (archivo === null) return;
    setOcupado(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("curso", curso);
      fd.append("nivel", nivel);
      fd.append("archivo", archivo);
      const res = await apiFetch("/api/catalog/imagen-curso", { method: "POST", body: fd });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setMsg(data.error?.message ?? "No se pudo subir.");
        return;
      }
      setMsg("✔ Imagen guardada. Así se verá en el panel del alumno.");
      setArchivo(null);
      setPrevio(null);
      await cargarActual();
    } catch {
      setMsg("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  const muestraUrl = previo ?? actualUrl;

  return (
    <main style={{ padding: "2rem", maxWidth: "54rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.9rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>Imágenes de curso</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Una imagen de portada por <strong>curso y nivel</strong> (o una para <strong>todo el curso</strong>,
        que cubre los niveles sin imagen propia). Se muestra como banner en el panel del alumno.
      </p>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", marginTop: "0.3rem" }}>
        📐 Genera la imagen en <strong>16:9</strong> para que no se recorte — recomendado{" "}
        <strong>1600×900 px</strong> (o 1920×1080). JPG/PNG/WebP, máx. 10 MB.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Curso</span>
          <select value={curso} onChange={(e) => setCurso(e.target.value as Curso)} style={{ ...input, width: "12rem" }}>
            {CURSOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Nivel</span>
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} style={{ ...input, width: "16rem" }}>
            {NIVELES.map((n) => (
              <option key={n.valor} value={n.valor}>
                {n.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Previo (cómo se verá) */}
      <div style={{ marginTop: "1.25rem" }}>
        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--texto-suave)" }}>
          {previo !== null ? "PREVIO (a subir)" : "IMAGEN ACTUAL"}
        </p>
        {/* El previo usa la MISMA proporción que el banner del panel del alumno (16:9). */}
        <div
          style={{
            marginTop: "0.4rem",
            position: "relative",
            width: "100%",
            maxWidth: "28rem",
            aspectRatio: "16 / 9",
            borderRadius: "1rem",
            overflow: "hidden",
            border: "1px solid #e3e7f0",
            background: muestraUrl !== null ? "#0a0e1e" : "linear-gradient(140deg, var(--lgs-azul) 0%, #1b2140 130%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
          }}
        >
          {muestraUrl !== null ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={muestraUrl} alt="Previo del curso" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            </>
          ) : (
            <div style={{ textAlign: "center", opacity: 0.9 }}>
              <div style={{ fontSize: "2.4rem", lineHeight: 1 }}>{curso === "YOUNGSTER" ? "🚀" : "🧩"}</div>
              <div style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>Sin imagen aún</div>
            </div>
          )}
        </div>
        {muestraUrl === null && (
          <p style={{ fontSize: "0.82rem", color: "var(--texto-suave)", marginTop: "0.4rem" }}>
            {nivel === "TODOS"
              ? `Sin imagen para todo el curso ${curso}. Se usa la de cada nivel o el color por defecto.`
              : `Sin imagen para ${curso} · ${nivel}. Se usa la imagen de "todo el curso" o el color por defecto.`}
          </p>
        )}
      </div>

      {/* Subir */}
      <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onArchivo} style={input} />
        <button
          type="button"
          onClick={() => void subir()}
          disabled={ocupado || archivo === null}
          style={{
            padding: "0.55rem 1.4rem",
            borderRadius: "0.6rem",
            border: "none",
            background: ocupado || archivo === null ? "#9e9e9e" : "var(--lgs-verde)",
            color: "#1b2a10",
            fontWeight: 800,
            cursor: ocupado || archivo === null ? "not-allowed" : "pointer",
          }}
        >
          {ocupado ? "Subiendo…" : "Guardar imagen"}
        </button>
      </div>
      {msg !== null && (
        <p style={{ marginTop: "0.75rem", fontWeight: 600, color: msg.startsWith("✔") ? "#1b5e20" : "#c62828" }}>{msg}</p>
      )}
    </main>
  );
}
