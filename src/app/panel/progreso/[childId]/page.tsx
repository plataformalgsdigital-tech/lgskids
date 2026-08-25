"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Progreso {
  curso: { courseId: string; tipo: string; campania: string } | null;
  niveles: {
    levelId: string;
    codigo: string;
    nombre: string;
    orden: number;
    leccionesCompletadas: number;
    totalLecciones: number;
    levelUpAprobado: boolean;
    estado: "EN_CURSO" | "COMPLETADO" | "PENDIENTE";
    medalla: boolean;
  }[];
  diploma: boolean;
}

const COLOR_NIVEL: Record<string, string> = {
  ROOKIE: "var(--lgs-verde)",
  CHAMPION: "var(--lgs-cian)",
  ELITE: "var(--lgs-amarillo)",
  LEGENDARY: "var(--lgs-magenta)",
  ULTIMATE: "var(--lgs-purpura)",
};

export default function ProgresoPage() {
  const params = useParams<{ childId: string }>();
  const [progreso, setProgreso] = useState<Progreso | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      const res = await apiFetch(`/api/progression/children/${params.childId}`);
      if (res.ok && !cancelado) {
        setProgreso((await res.json()) as Progreso);
      }
    }
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [params.childId]);

  if (progreso === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando progreso…</p>
      </main>
    );
  }

  if (progreso.curso === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p style={{ color: "var(--texto-suave)" }}>
          Este niño no tiene matrícula activa — sin progresión que mostrar.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "56rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem" }}>
        Progreso · {progreso.curso.campania} ({progreso.curso.tipo})
      </h1>
      {progreso.diploma && (
        <p
          style={{
            marginTop: "0.75rem",
            padding: "0.8rem 1.1rem",
            background: "#fff8e1",
            border: "2px solid var(--lgs-amarillo)",
            borderRadius: "0.9rem",
            fontWeight: 700,
          }}
        >
          🎓 ¡DIPLOMA! Completó los 4 niveles del curso.
        </p>
      )}

      <div
        style={{
          marginTop: "1.25rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
          gap: "0.75rem",
        }}
      >
        {progreso.niveles.map((nivel) => (
          <div
            key={nivel.levelId}
            style={{
              border: "1px solid #edf0f6",
              borderTop: `5px solid ${COLOR_NIVEL[nivel.codigo] ?? "var(--lgs-azul)"}`,
              borderRadius: "0.8rem",
              padding: "1rem",
              opacity: nivel.estado === "PENDIENTE" ? 0.75 : 1,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>
                {nivel.orden}. {nivel.nombre}
              </strong>
              {nivel.medalla && <span style={{ fontSize: "1.4rem" }}>🏅</span>}
            </div>
            <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
              Lecciones: <strong>{nivel.leccionesCompletadas}</strong>/{nivel.totalLecciones}
            </p>
            <div
              style={{
                marginTop: "0.3rem",
                height: "0.5rem",
                borderRadius: "0.25rem",
                background: "#eef1f7",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(nivel.leccionesCompletadas / Math.max(nivel.totalLecciones, 1)) * 100}%`,
                  height: "100%",
                  background: COLOR_NIVEL[nivel.codigo] ?? "var(--lgs-azul)",
                }}
              />
            </div>
            <p style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
              Level Up: {nivel.levelUpAprobado ? "✅ aprobado" : "pendiente"}
            </p>
            <p
              style={{
                marginTop: "0.4rem",
                fontSize: "0.78rem",
                fontWeight: 700,
                color:
                  nivel.estado === "COMPLETADO"
                    ? "#1b5e20"
                    : nivel.estado === "EN_CURSO"
                      ? "#0d47a1"
                      : "var(--texto-suave)",
              }}
            >
              {nivel.estado === "COMPLETADO"
                ? "COMPLETADO"
                : nivel.estado === "EN_CURSO"
                  ? "En curso"
                  : "Pendiente"}
            </p>
          </div>
        ))}
      </div>

      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/panel/salones" style={{ fontSize: "0.9rem" }}>
          ← Volver a salones
        </Link>
      </p>
    </main>
  );
}
