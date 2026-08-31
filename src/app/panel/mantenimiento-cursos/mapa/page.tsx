"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

type Curso = "JUNIOR" | "YOUNGSTER";
type Scope = "ISLA" | "MAPA";
type Punto = { x: number; y: number };

const CURSOS: Curso[] = ["JUNIOR", "YOUNGSTER"];
const NIVELES = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"] as const;
const N_UNIDADES = 4;

const input: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export default function EditorMapaPage() {
  const [curso, setCurso] = useState<Curso>("JUNIOR");
  const [scope, setScope] = useState<Scope>("ISLA");
  const [nivel, setNivel] = useState<string>("ROOKIE");
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [unidades, setUnidades] = useState<(Punto | null)[]>(Array(N_UNIDADES).fill(null));
  const [especial, setEspecial] = useState<Punto | null>(null); // premio (ISLA) o centro (MAPA)
  const [tool, setTool] = useState<string>("u0"); // u0..u3 | esp
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const etiquetaEsp = scope === "MAPA" ? "Centro de la isla" : "Premio";

  const cargar = useCallback(async () => {
    // Imagen: ISLA → banner del nivel; MAPA → mapa del curso.
    const qImg =
      scope === "MAPA" ? `tipo=mapa&curso=${curso}` : `tipo=banner&curso=${curso}&nivel=${nivel}`;
    const [imgRes, hsRes] = await Promise.all([
      apiFetch(`/api/catalog/imagen-curso?${qImg}`),
      apiFetch(`/api/catalog/hotspots?scope=${scope}&curso=${curso}&nivel=${nivel}`),
    ]);
    let url: string | null = null;
    if (imgRes.ok) url = ((await imgRes.json()) as { url: string | null }).url;
    const us: (Punto | null)[] = Array(N_UNIDADES).fill(null);
    let esp: Punto | null = null;
    if (hsRes.ok) {
      const d = (await hsRes.json()) as {
        unidades?: Punto[];
        premio?: Punto | null;
        centro?: Punto | null;
      };
      (d.unidades ?? []).slice(0, N_UNIDADES).forEach((p, i) => (us[i] = p));
      esp = scope === "MAPA" ? (d.centro ?? null) : (d.premio ?? null);
    }
    setImgUrl(url);
    setUnidades(us);
    setEspecial(esp);
    setMsg(null);
  }, [curso, scope, nivel]);

  useEffect(() => {
    async function run() {
      await cargar();
    }
    void run();
  }, [cargar]);

  function colocar(e: React.MouseEvent<HTMLImageElement>) {
    const el = imgRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const x = r1(((e.clientX - rect.left) / rect.width) * 100);
    const y = r1(((e.clientY - rect.top) / rect.height) * 100);
    const p = { x, y };
    if (tool === "esp") {
      setEspecial(p);
    } else {
      const i = Number(tool.slice(1));
      setUnidades((prev) => prev.map((v, k) => (k === i ? p : v)));
    }
    // Avanza al siguiente punto para marcar rápido
    setTool((t) => {
      if (t === "esp") return "esp";
      const i = Number(t.slice(1));
      return i < N_UNIDADES - 1 ? `u${i + 1}` : "esp";
    });
  }

  async function guardar() {
    setOcupado(true);
    setMsg(null);
    try {
      const data =
        scope === "MAPA"
          ? { unidades: unidades.filter((p): p is Punto => p !== null), centro: especial }
          : { unidades: unidades.filter((p): p is Punto => p !== null), premio: especial };
      const res = await apiFetch("/api/catalog/hotspots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, curso, nivel, data }),
      });
      if (!res.ok) {
        const e = (await res.json()) as { error?: { message: string } };
        setMsg(e.error?.message ?? "No se pudo guardar.");
        return;
      }
      setMsg("✔ Posiciones guardadas.");
    } catch {
      setMsg("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  function limpiar() {
    setUnidades(Array(N_UNIDADES).fill(null));
    setEspecial(null);
    setTool("u0");
  }

  const marcadores: { punto: Punto | null; label: string; tool: string; color: string }[] = [
    ...unidades.map((p, i) => ({
      punto: p,
      label: String(i + 1),
      tool: `u${i}`,
      color: "#2450c8",
    })),
    { punto: especial, label: scope === "MAPA" ? "◎" : "★", tool: "esp", color: "#d1495b" },
  ];

  const toolBtn = (t: string): CSSProperties => ({
    padding: "0.4rem 0.8rem",
    borderRadius: "0.5rem",
    border: tool === t ? "2px solid var(--lgs-purpura)" : "1.5px solid #d8dce6",
    background: tool === t ? "#f3eefc" : "white",
    fontWeight: 700,
    fontSize: "0.85rem",
    cursor: "pointer",
  });

  return (
    <main style={{ padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.9rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>Editor de mapa (hotspots)</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Marca dónde va cada <strong>unidad (1–4)</strong> y el{" "}
        <strong>{etiquetaEsp.toLowerCase()}</strong> sobre la imagen. Elige un punto y haz{" "}
        <strong>clic sobre la imagen</strong>; se guarda como coordenada %. Lo usa la pantalla{" "}
        <strong>Avance</strong> del alumno.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Curso</span>
          <select
            value={curso}
            onChange={(e) => setCurso(e.target.value as Curso)}
            style={{ ...input, width: "11rem" }}
          >
            {CURSOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Imagen</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            style={{ ...input, width: "17rem" }}
          >
            <option value="ISLA">Isla del nivel (banner)</option>
            <option value="MAPA">Mapa del curso completo</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Nivel</span>
          <select
            value={nivel}
            onChange={(e) => setNivel(e.target.value)}
            style={{ ...input, width: "11rem" }}
          >
            {NIVELES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Paleta de puntos */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)", fontWeight: 700 }}>
          Marcar:
        </span>
        {[0, 1, 2, 3].map((i) => (
          <button key={i} type="button" style={toolBtn(`u${i}`)} onClick={() => setTool(`u${i}`)}>
            Unidad {i + 1} {unidades[i] !== null && "✓"}
          </button>
        ))}
        <button type="button" style={toolBtn("esp")} onClick={() => setTool("esp")}>
          {etiquetaEsp} {especial !== null && "✓"}
        </button>
      </div>

      {/* Lienzo */}
      <div style={{ marginTop: "1rem" }}>
        {imgUrl === null ? (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              border: "1px dashed #d8dce6",
              borderRadius: "1rem",
              color: "var(--texto-suave)",
            }}
          >
            {scope === "MAPA"
              ? "No hay imagen de “Mapa del curso completo” para este curso."
              : `No hay banner para ${curso} · ${nivel}.`}{" "}
            Súbela en <Link href="/panel/mantenimiento-cursos/imagenes">Imágenes de curso</Link>.
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              display: "inline-block",
              maxWidth: "100%",
              border: "1px solid #e3e7f0",
              borderRadius: "0.8rem",
              overflow: "hidden",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imgUrl}
              alt="Imagen a marcar"
              onClick={colocar}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                cursor: "crosshair",
                maxHeight: "70vh",
                objectFit: "contain",
              }}
            />
            {marcadores.map((m) =>
              m.punto === null ? null : (
                <div
                  key={m.tool}
                  style={{
                    position: "absolute",
                    left: `${m.punto.x}%`,
                    top: `${m.punto.y}%`,
                    transform: "translate(-50%,-50%)",
                    width: "1.8rem",
                    height: "1.8rem",
                    borderRadius: "50%",
                    background: m.color,
                    color: "white",
                    border: tool === m.tool ? "3px solid #fff" : "2px solid #fff",
                    boxShadow:
                      tool === m.tool
                        ? "0 0 0 2px var(--lgs-purpura)"
                        : "0 2px 6px rgba(0,0,0,0.35)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: "0.85rem",
                    pointerEvents: "none",
                  }}
                >
                  {m.label}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div
        style={{
          marginTop: "1rem",
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={ocupado || imgUrl === null}
          style={{
            padding: "0.55rem 1.4rem",
            borderRadius: "0.6rem",
            border: "none",
            background: ocupado || imgUrl === null ? "#9e9e9e" : "var(--lgs-verde)",
            color: "#1b2a10",
            fontWeight: 800,
            cursor: ocupado || imgUrl === null ? "not-allowed" : "pointer",
          }}
        >
          {ocupado ? "Guardando…" : "Guardar posiciones"}
        </button>
        <button
          type="button"
          onClick={limpiar}
          style={{
            padding: "0.55rem 1.1rem",
            borderRadius: "0.6rem",
            border: "1.5px solid #d8dce6",
            background: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Limpiar
        </button>
        {msg !== null && (
          <span style={{ fontWeight: 600, color: msg.startsWith("✔") ? "#1b5e20" : "#c62828" }}>
            {msg}
          </span>
        )}
      </div>
    </main>
  );
}
