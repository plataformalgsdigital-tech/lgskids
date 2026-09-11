"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Colocar los JUEGOS de una unidad sobre su lámina.
 *
 * Los juegos NO se crean aquí: son las **actividades de las lecciones**, que se
 * cargan en Gestión de Contenido o por CSV. Esta pantalla solo decide DÓNDE va
 * cada una sobre la lámina; el nombre y el enlace no se tocan.
 *
 * Solo caen en el mapa las lecciones de "Unidad 1".."Unidad 4". La "Unidad 0"
 * es la bienvenida, y repasos y evaluaciones no tienen casilla.
 */

interface Juego {
  cursoRefId: string;
  indice: number;
  leccion: string;
  nombre: string;
  enlace: string;
  x?: number;
  y?: number;
}

const CURSOS = ["JUNIOR", "YOUNGSTER"];
const NIVELES = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"];
const UNIDADES = [1, 2, 3, 4];

const input: CSSProperties = {
  padding: "0.5rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.88rem",
  fontFamily: "inherit",
  background: "white",
};
const rotulo: CSSProperties = { fontSize: "0.78rem", fontWeight: 600 };

export default function JuegosUnidadPage() {
  const [curso, setCurso] = useState("JUNIOR");
  const [nivel, setNivel] = useState("ROOKIE");
  const [unidad, setUnidad] = useState(1);

  const [juegos, setJuegos] = useState<Juego[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lamina, setLamina] = useState<string | null>(null);
  /** Juego que se está ubicando: el siguiente clic sobre la lámina lo fija. */
  const [ubicando, setUbicando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const res = await apiFetch(
      `/api/catalog/unidad-juegos?curso=${curso}&nivel=${nivel}&unidad=${String(unidad)}`,
    );
    if (!res.ok) {
      setError("No se pudieron cargar los juegos.");
      setCargando(false);
      return;
    }
    setError(null);
    setAviso(null);
    setJuegos(((await res.json()) as { juegos: Juego[] }).juegos);
    setUbicando(null);

    const img = await apiFetch(
      `/api/catalog/imagen-curso?tipo=unidad&curso=${curso}&nivel=${nivel}&unidad=${String(unidad)}`,
    );
    setLamina(img.ok ? (((await img.json()) as { url: string | null }).url ?? null) : null);
    setCargando(false);
  }, [curso, nivel, unidad]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  /** Clic sobre la lámina: fija la posición del juego que se está ubicando. */
  function colocar(e: React.MouseEvent<HTMLDivElement>) {
    if (ubicando === null) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setJuegos((prev) =>
      prev.map((j, k) =>
        k === ubicando ? { ...j, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } : j,
      ),
    );
    setUbicando(null);
    setAviso(null);
  }

  function quitarPosicion(i: number) {
    setJuegos((prev) =>
      prev.map((j, k) => {
        if (k !== i) return j;
        const resto = { ...j };
        delete resto.x;
        delete resto.y;
        return resto;
      }),
    );
    setAviso(null);
  }

  async function guardar() {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch("/api/catalog/unidad-juegos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posiciones: juegos.map((j) => ({
            cursoRefId: j.cursoRefId,
            indice: j.indice,
            ...(j.x !== undefined && j.y !== undefined ? { x: j.x, y: j.y } : {}),
          })),
        }),
      });
      const c: { actualizadas?: number; error?: { message?: string } } = await res.json();
      if (!res.ok) {
        setError(c.error?.message ?? "No se pudieron guardar las posiciones.");
        return;
      }
      const sobre = juegos.filter((j) => j.x !== undefined).length;
      setAviso(`Guardado: ${String(sobre)} de ${String(juegos.length)} sobre la lámina.`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "56rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.85rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.6rem", margin: "0.5rem 0 0" }}>Enlaces de juegos</h1>
      <p style={{ color: "var(--texto-suave)", marginTop: "0.25rem" }}>
        Coloca sobre la lámina las <strong>actividades</strong> de las lecciones de esta unidad. Los
        juegos se crean en{" "}
        <Link href="/panel/mantenimiento-cursos/gestion-contenido">Gestión de Contenido</Link>; aquí
        solo se decide dónde va cada uno. El niño toca el cartel y se le abre.
      </p>

      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", marginTop: "1.2rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={rotulo}>Curso</span>
          <select value={curso} onChange={(e) => setCurso(e.target.value)} style={input}>
            {CURSOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={rotulo}>Nivel</span>
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} style={input}>
            {NIVELES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={rotulo}>Unidad</span>
          <select value={unidad} onChange={(e) => setUnidad(Number(e.target.value))} style={input}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                Unidad {u}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, marginTop: "1rem" }}>
          {error}
        </p>
      )}
      {aviso !== null && (
        <p style={{ color: "#1b5e20", fontWeight: 600, marginTop: "1rem" }}>{aviso}</p>
      )}

      <section
        style={{
          marginTop: "1.2rem",
          background: "white",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "1rem",
        }}
      >
        {cargando ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : juegos.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>
            Las lecciones de <strong>Unidad {unidad}</strong> todavía no tienen actividades.
            Cárgalas en{" "}
            <Link href="/panel/mantenimiento-cursos/gestion-contenido">Gestión de Contenido</Link> y
            vuelve aquí a colocarlas.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {juegos.map((j, i) => (
              <div
                key={`${j.cursoRefId}-${String(j.indice)}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.5rem 0.6rem",
                  borderRadius: "0.6rem",
                  background: ubicando === i ? "#eef2ff" : "#f7f9fd",
                }}
              >
                <button
                  type="button"
                  onClick={() => setUbicando(ubicando === i ? null : i)}
                  aria-label={`Ubicar ${j.nombre} sobre la lámina`}
                  title={
                    j.x === undefined
                      ? "Ubicar sobre la lámina"
                      : `En ${String(j.x)}%, ${String(j.y ?? 0)}% · clic para mover`
                  }
                  style={{
                    border: "1.5px solid " + (ubicando === i ? "var(--lgs-azul)" : "#e0e4ee"),
                    background: "white",
                    borderRadius: "0.5rem",
                    padding: "0.25rem 0.6rem",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {j.x === undefined ? "📍" : "✅"}
                </button>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: "0.9rem" }}>{j.nombre}</strong>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.74rem",
                      color: "var(--texto-suave)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {j.leccion} · {j.enlace}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {juegos.length > 0 && (
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={ocupado}
            style={{
              marginTop: "0.9rem",
              padding: "0.55rem 1.2rem",
              borderRadius: "0.6rem",
              border: "none",
              background: "var(--lgs-azul)",
              color: "white",
              fontWeight: 700,
              cursor: ocupado ? "wait" : "pointer",
            }}
          >
            {ocupado ? "Guardando…" : "💾 Guardar posiciones"}
          </button>
        )}
      </section>

      {/*
        Lienzo: la lámina con los juegos colocados. Se pinta con `height: auto`
        —igual que en el panel del niño— para que los % caigan donde él los verá.
      */}
      <section
        style={{
          marginTop: "1.2rem",
          background: "white",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "1rem",
        }}
      >
        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--texto-suave)" }}>
          LÁMINA DE LA UNIDAD
        </p>
        {lamina === null ? (
          <p style={{ color: "var(--texto-suave)", marginTop: "0.5rem" }}>
            Esta unidad todavía no tiene lámina. Súbela en{" "}
            <Link href="/panel/mantenimiento-cursos/imagenes">Imágenes de curso</Link> para poder
            colocar los juegos sobre sus carteles.
          </p>
        ) : (
          <>
            <p
              style={{
                fontSize: "0.82rem",
                color: "var(--texto-suave)",
                margin: "0.3rem 0 0.6rem",
              }}
            >
              {ubicando === null
                ? "Toca 📍 en un juego y luego haz clic sobre su cartel. Para quitarlo de la lámina, toca su marcador."
                : `Haz clic sobre el cartel de "${juegos[ubicando]?.nombre ?? ""}".`}
            </p>
            <div
              onClick={colocar}
              style={{
                position: "relative",
                maxWidth: "26rem",
                borderRadius: "0.8rem",
                overflow: "hidden",
                border: "1px solid #e3e7f0",
                cursor: ubicando === null ? "default" : "crosshair",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lamina}
                alt="Lámina de la unidad"
                style={{ display: "block", width: "100%", height: "auto" }}
              />
              {juegos.map((j, i) =>
                j.x === undefined || j.y === undefined ? null : (
                  <button
                    key={`${j.cursoRefId}-${String(j.indice)}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (ubicando === null) quitarPosicion(i);
                    }}
                    title={
                      ubicando === null
                        ? `${j.nombre} · clic para quitarlo de la lámina`
                        : undefined
                    }
                    style={{
                      position: "absolute",
                      left: `${String(j.x)}%`,
                      top: `${String(j.y)}%`,
                      transform: "translate(-50%,-50%)",
                      width: "2rem",
                      height: "2rem",
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "0.95rem",
                      background: ubicando === i ? "var(--lgs-azul)" : "rgba(255,255,255,.92)",
                      border: "2px solid var(--lgs-verde)",
                      boxShadow: "0 2px 8px rgba(0,0,0,.4)",
                      fontFamily: "inherit",
                      cursor: ubicando === null ? "pointer" : "crosshair",
                      pointerEvents: ubicando === null ? "auto" : "none",
                    }}
                  >
                    🎮
                  </button>
                ),
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
