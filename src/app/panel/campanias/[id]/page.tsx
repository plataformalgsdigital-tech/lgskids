"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Detalle {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  estado: "EN_MATRICULA" | "ACTIVA" | "CERRADA";
  courses: {
    id: string;
    tipo: "JUNIOR" | "YOUNGSTER";
    inicio: string;
    finalCurso: string;
    niveles: {
      id: string;
      codigo: string;
      nombre: string;
      orden: number;
      lecciones: { id: string; orden: number; titulo: string }[];
      cuestionarios: { id: string; tipo: string; titulo: string; leccionOrden: number | null }[];
    }[];
  }[];
}

const COLOR_NIVEL: Record<string, string> = {
  ROOKIE: "var(--lgs-verde)",
  CHAMPION: "var(--lgs-cian)",
  ELITE: "var(--lgs-amarillo)",
  LEGENDARY: "var(--lgs-magenta)",
};

const NOMBRE_TIPO: Record<string, string> = {
  JUNIOR: "Junior (6–9 años)",
  YOUNGSTER: "Youngster (10–13 años)",
};

export default function DetalleCampaniaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch(`/api/catalog/campaigns/${params.id}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data: { campania?: Detalle; error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo cargar la campaña.");
        return;
      }
      setDetalle(data.campania ?? null);
    }
    void cargar();
  }, [params.id, router]);

  if (error !== null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p role="alert" style={{ color: "#c62828" }}>
          {error}
        </p>
        <Link href="/panel/campanias">← Volver a campañas</Link>
      </main>
    );
  }

  if (detalle === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando campaña…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <Link href="/panel/campanias" style={{ fontSize: "0.9rem" }}>
        ← Volver a campañas
      </Link>
      <h1 style={{ fontSize: "1.6rem", marginTop: "0.5rem" }}>{detalle.nombre}</h1>
      <p style={{ color: "var(--texto-suave)" }}>
        {detalle.inicio} → {detalle.fin} (fin nominal — el fin real lo definirá la última sesión)
      </p>

      {detalle.courses.map((curso) => (
        <section
          key={curso.id}
          style={{
            marginTop: "1.5rem",
            border: "1px solid #e3e7f0",
            borderRadius: "0.9rem",
            padding: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: "1.2rem", color: "var(--lgs-azul-oscuro)" }}>
            {NOMBRE_TIPO[curso.tipo] ?? curso.tipo}
          </h2>
          <div
            style={{
              marginTop: "0.9rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
              gap: "0.75rem",
            }}
          >
            {curso.niveles.map((nivel) => (
              <div
                key={nivel.id}
                style={{
                  border: "1px solid #edf0f6",
                  borderTop: `4px solid ${COLOR_NIVEL[nivel.codigo] ?? "var(--lgs-azul)"}`,
                  borderRadius: "0.7rem",
                  padding: "0.9rem",
                }}
              >
                <strong>
                  {nivel.orden}. {nivel.nombre}
                </strong>
                <ul style={{ margin: "0.5rem 0 0 1rem", fontSize: "0.85rem" }}>
                  {nivel.lecciones.map((leccion) => (
                    <li key={leccion.id}>
                      {leccion.titulo}
                      <span style={{ color: "var(--texto-suave)" }}> · práctica</span>
                    </li>
                  ))}
                </ul>
                <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", fontWeight: 700 }}>
                  🏅 Level Up
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
