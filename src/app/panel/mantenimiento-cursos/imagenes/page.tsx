"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

type Curso = "JUNIOR" | "YOUNGSTER";
type Tipo = "banner" | "premio" | "unidad" | "insignia" | "mapa" | "vobo";

/**
 * Paradas de la isla: el Welcome (0) y las cuatro unidades.
 *
 * La 0 NO se llama "Unidad 0": en el mapa su cartel dice "Welcome" y el
 * cuadernillo le entrega su propia insignia.
 */
const PARADAS = [0, 1, 2, 3, 4];
const etiquetaParada = (p: number) => (p === 0 ? "Welcome" : `Unidad ${String(p)}`);

const CURSOS: Curso[] = ["JUNIOR", "YOUNGSTER"];

const TIPOS: {
  valor: Tipo;
  etiqueta: string;
  ayuda: string;
  cuadrada: boolean;
  /** Se muestra con SU proporción, sin recortar (lámina vertical). */
  libre?: boolean;
}[] = [
  {
    valor: "banner",
    etiqueta: "Banner del nivel (mapa de la isla)",
    ayuda: "16:9 · recomendado 1600×900. JPG/PNG/WebP.",
    cuadrada: false,
  },
  {
    valor: "premio",
    etiqueta: "Premio del nivel",
    ayuda:
      "PNG con fondo transparente, cuadrado ~512×512 (brújula, llave, corona, estrella, tesoro).",
    cuadrada: true,
  },
  {
    valor: "unidad",
    etiqueta: "Lámina de la parada",
    ayuda:
      "La que se abre al tocar la parada en el mapa de la isla (Welcome o “Unidad N”). Se muestra COMPLETA, sin recortar; cualquier proporción sirve (recomendado 1000×1300). JPG/PNG/WebP.",
    cuadrada: false,
    libre: true,
  },
  {
    valor: "insignia",
    etiqueta: "Insignia de la parada",
    ayuda:
      "La que se gana al cerrar esa parada (“Let’s chat about me”, “Let’s explore”…). PNG con fondo transparente, cuadrado ~512×512. Distinta del premio, que es uno por NIVEL.",
    cuadrada: true,
  },
  {
    valor: "mapa",
    etiqueta: "Mapa del curso completo",
    ayuda: "El mapa con TODAS las islas. 16:9 · recomendado 1920×1080.",
    cuadrada: false,
  },
  {
    valor: "vobo",
    etiqueta: "Sello VoBo (global)",
    ayuda: "PNG transparente cuadrado del personaje con el visto (marca de unidad vista).",
    cuadrada: true,
  },
];

// Niveles reales; "TODOS" solo aplica al banner (respaldo del curso).
const NIVELES_BANNER = ["TODOS", "ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"] as const;
const NIVELES_REALES = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"] as const;
const ETIQUETA_NIVEL: Record<string, string> = { TODOS: "Todo el curso (todos los niveles)" };

const input: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

export default function ImagenesCursoPage() {
  const [tipo, setTipo] = useState<Tipo>("banner");
  const [curso, setCurso] = useState<Curso>("JUNIOR");
  const [nivel, setNivel] = useState<string>("ROOKIE");
  const [unidad, setUnidad] = useState(1);
  const [actualUrl, setActualUrl] = useState<string | null>(null);
  const [previo, setPrevio] = useState<string | null>(null); // data URL del archivo elegido
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const def = TIPOS.find((t) => t.valor === tipo) ?? TIPOS[0]!;
  const usaCurso = tipo !== "vobo";
  const usaNivel =
    tipo === "banner" || tipo === "premio" || tipo === "unidad" || tipo === "insignia";
  const usaUnidad = tipo === "unidad" || tipo === "insignia";
  const nivelesDisp = tipo === "banner" ? NIVELES_BANNER : NIVELES_REALES;

  // La query de consulta/subida solo lleva los parámetros que aplican al tipo.
  const query = useCallback(() => {
    const p = new URLSearchParams({ tipo });
    if (usaCurso) p.set("curso", curso);
    if (usaNivel) p.set("nivel", nivel);
    if (usaUnidad) p.set("unidad", String(unidad));
    return p.toString();
  }, [tipo, usaCurso, usaNivel, usaUnidad, curso, nivel, unidad]);

  const cargarActual = useCallback(async () => {
    const res = await apiFetch(`/api/catalog/imagen-curso?${query()}`);
    if (res.ok) {
      const data: { url: string | null } = await res.json();
      setActualUrl(data.url !== null ? `${data.url}?t=${Date.now()}` : null);
    }
  }, [query]);

  // Cambiar de tipo: corrige el nivel si dejó de ser válido (premio no admite TODOS).
  function cambiarTipo(t: Tipo) {
    setTipo(t);
    if ((t === "premio" || t === "unidad" || t === "insignia") && nivel === "TODOS")
      setNivel("ROOKIE");
  }

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
      fd.append("tipo", tipo);
      if (usaCurso) fd.append("curso", curso);
      if (usaNivel) fd.append("nivel", nivel);
      if (usaUnidad) fd.append("unidad", String(unidad));
      fd.append("archivo", archivo);
      const res = await apiFetch("/api/catalog/imagen-curso", { method: "POST", body: fd });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setMsg(data.error?.message ?? "No se pudo subir.");
        return;
      }
      setMsg("✔ Imagen guardada.");
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
  // Tablero de ajedrez para PNGs transparentes (premio/vobo).
  const checker = "repeating-conic-gradient(#e9edf5 0% 25%, #ffffff 0% 50%) 50% / 18px 18px";

  return (
    <main style={{ padding: "2rem", maxWidth: "54rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.9rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>Imágenes de curso</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Arte curricular del panel del alumno: <strong>banners/mapas de nivel</strong>, las{" "}
        <strong>láminas</strong> e <strong>insignias</strong> de cada parada,{" "}
        <strong>premios</strong>, el <strong>mapa del curso</strong> y el{" "}
        <strong>sello VoBo</strong>.
      </p>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", marginTop: "0.3rem" }}>
        📐 {def.ayuda} Máx. 10 MB.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Tipo</span>
          <select
            value={tipo}
            onChange={(e) => cambiarTipo(e.target.value as Tipo)}
            style={{ ...input, width: "20rem" }}
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        {usaCurso && (
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Curso</span>
            <select
              value={curso}
              onChange={(e) => setCurso(e.target.value as Curso)}
              style={{ ...input, width: "12rem" }}
            >
              {CURSOS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        {usaNivel && (
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Nivel</span>
            <select
              value={nivel}
              onChange={(e) => setNivel(e.target.value)}
              style={{ ...input, width: "16rem" }}
            >
              {nivelesDisp.map((n) => (
                <option key={n} value={n}>
                  {ETIQUETA_NIVEL[n] ?? n}
                </option>
              ))}
            </select>
          </label>
        )}
        {usaUnidad && (
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Parada</span>
            <select
              value={unidad}
              onChange={(e) => setUnidad(Number(e.target.value))}
              style={{ ...input, width: "16rem" }}
            >
              {PARADAS.map((p) => (
                <option key={p} value={p}>
                  {etiquetaParada(p)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Previo (cómo se verá) */}
      <div style={{ marginTop: "1.25rem" }}>
        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--texto-suave)" }}>
          {previo !== null ? "PREVIO (a subir)" : "IMAGEN ACTUAL"}
        </p>
        <div
          style={{
            marginTop: "0.4rem",
            position: "relative",
            width: "100%",
            maxWidth: def.libre === true ? "20rem" : def.cuadrada ? "16rem" : "28rem",
            // Sin proporción fija: la caja se adapta a la imagen y así el previo
            // enseña exactamente lo que verá el niño.
            ...(def.libre === true ? {} : { aspectRatio: def.cuadrada ? "1 / 1" : "16 / 9" }),
            minHeight: def.libre === true ? "12rem" : undefined,
            borderRadius: "1rem",
            overflow: "hidden",
            border: "1px solid #e3e7f0",
            background:
              muestraUrl === null
                ? "linear-gradient(140deg, var(--lgs-azul) 0%, #1b2140 130%)"
                : def.cuadrada
                  ? checker
                  : "#0a0e1e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
          }}
        >
          {muestraUrl !== null ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={muestraUrl}
              alt="Previo"
              style={{
                ...(def.libre === true
                  ? { position: "relative", width: "100%", height: "auto", display: "block" }
                  : {
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: def.cuadrada ? "contain" : "cover",
                      padding: def.cuadrada ? "0.6rem" : 0,
                    }),
              }}
            />
          ) : (
            <div style={{ textAlign: "center", opacity: 0.9 }}>
              <div style={{ fontSize: "2.4rem", lineHeight: 1 }}>
                {tipo === "vobo"
                  ? "✅"
                  : tipo === "premio"
                    ? "🏆"
                    : tipo === "insignia"
                      ? "🎖️"
                      : tipo === "unidad"
                        ? "📄"
                        : "🗺️"}
              </div>
              <div style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>Sin imagen aún</div>
            </div>
          )}
        </div>
      </div>

      {/* Subir */}
      <div
        style={{
          marginTop: "1.25rem",
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onArchivo}
          style={input}
        />
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
        <p
          style={{
            marginTop: "0.75rem",
            fontWeight: 600,
            color: msg.startsWith("✔") ? "#1b5e20" : "#c62828",
          }}
        >
          {msg}
        </p>
      )}
    </main>
  );
}
