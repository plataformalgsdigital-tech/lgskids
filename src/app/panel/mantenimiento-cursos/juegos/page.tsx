"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Editor de ENLACES DE JUEGOS por unidad.
 *
 * Van atados a curso · nivel · unidad (1..4) porque lo que el niño toca es la
 * unidad en el mapa de la isla: ahí se le abre la lámina de esa unidad y, con
 * ella, sus juegos. No hay tope: se agregan las filas que hagan falta.
 */

interface Juego {
  nombre: string;
  enlace: string;
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
    setCargando(false);
  }, [curso, nivel, unidad]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  function cambiar(i: number, campo: keyof Juego, valor: string) {
    setJuegos((prev) => prev.map((j, k) => (k === i ? { ...j, [campo]: valor } : j)));
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
        body: JSON.stringify({ curso, nivel, unidad, juegos }),
      });
      const c: { juegos?: Juego[]; error?: { message?: string } } = await res.json();
      if (!res.ok) {
        setError(c.error?.message ?? "No se pudieron guardar los juegos.");
        return;
      }
      // El servidor descarta filas vacías: se refleja lo que quedó guardado.
      setJuegos(c.juegos ?? []);
      setAviso(
        `Guardado: ${String((c.juegos ?? []).length)} juego(s) en la Unidad ${String(unidad)}.`,
      );
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
        Los juegos de cada <strong>unidad</strong>. El niño los abre al tocar “Unidad N” en el mapa
        de su isla, junto con la lámina de esa unidad.
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
        ) : (
          <>
            {juegos.length === 0 && (
              <p style={{ color: "var(--texto-suave)", marginBottom: "0.8rem" }}>
                Esta unidad todavía no tiene juegos. Agrega el primero.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {juegos.map((j, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: "0.5rem" }}
                  className="juegos-fila"
                >
                  <input
                    value={j.nombre}
                    onChange={(e) => cambiar(i, "nombre", e.target.value)}
                    placeholder="Nombre del juego"
                    style={input}
                    aria-label={`Nombre del juego ${String(i + 1)}`}
                  />
                  <input
                    value={j.enlace}
                    onChange={(e) => cambiar(i, "enlace", e.target.value)}
                    placeholder="https://wordwall.net/..."
                    style={input}
                    aria-label={`Enlace del juego ${String(i + 1)}`}
                  />
                  <button
                    type="button"
                    onClick={() => setJuegos((prev) => prev.filter((_, k) => k !== i))}
                    aria-label={`Quitar el juego ${String(i + 1)}`}
                    style={{
                      border: "1.5px solid #e0e4ee",
                      background: "white",
                      borderRadius: "0.5rem",
                      padding: "0 0.7rem",
                      cursor: "pointer",
                      color: "#8a2020",
                      fontWeight: 700,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.9rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setJuegos((prev) => [...prev, { nombre: "", enlace: "" }])}
                style={{
                  padding: "0.55rem 1rem",
                  borderRadius: "0.6rem",
                  border: "1.5px solid var(--lgs-azul)",
                  background: "white",
                  color: "var(--lgs-azul-oscuro)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + Agregar juego
              </button>
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={ocupado}
                style={{
                  padding: "0.55rem 1.2rem",
                  borderRadius: "0.6rem",
                  border: "none",
                  background: "var(--lgs-azul)",
                  color: "white",
                  fontWeight: 700,
                  cursor: ocupado ? "wait" : "pointer",
                }}
              >
                {ocupado ? "Guardando…" : "💾 Guardar"}
              </button>
            </div>
          </>
        )}
      </section>

      <style>{`@media (max-width: 640px) { .juegos-fila { grid-template-columns: 1fr auto !important; } }`}</style>
    </main>
  );
}
