"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Campania {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  estado: "EN_MATRICULA" | "ACTIVA" | "CERRADA";
  cursos: number;
}

const ESTILO_ESTADO: Record<Campania["estado"], { texto: string; color: string; fondo: string }> = {
  EN_MATRICULA: { texto: "En matrícula", color: "#0d47a1", fondo: "#e3f2fd" },
  ACTIVA: { texto: "Activa", color: "#1b5e20", fondo: "#e8f5e9" },
  CERRADA: { texto: "Cerrada", color: "#5a6172", fondo: "#eceff1" },
};

export default function CampaniasPage() {
  const router = useRouter();
  const [campanias, setCampanias] = useState<Campania[] | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [inicio, setInicio] = useState("");
  const [semanas, setSemanas] = useState("12");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await apiFetch("/api/catalog/campaigns");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (res.ok) {
      const data: { campanias: Campania[] } = await res.json();
      setCampanias(data.campanias);
    }
  }, [router]);

  useEffect(() => {
    async function inicial() {
      await cargar();
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const me: { permisos: { code: string }[] } = await res.json();
        setPuedeGestionar(me.permisos.some((p) => p.code === "catalogo.gestionar"));
      }
    }
    void inicial();
  }, [cargar]);

  async function crear(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCreando(true);
    try {
      const res = await apiFetch("/api/catalog/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, inicio, duracionSemanas: Number(semanas) }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo crear la campaña.");
        return;
      }
      setMostrarForm(false);
      setNombre("");
      setInicio("");
      setSemanas("12");
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setCreando(false);
    }
  }

  const inputStyle = {
    padding: "0.55rem 0.7rem",
    borderRadius: "0.5rem",
    border: "1.5px solid #d8dce6",
    fontSize: "0.95rem",
  } as const;

  return (
    <main style={{ padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.6rem" }}>Campañas</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {puedeGestionar && (
            <button
              onClick={() => setMostrarForm((v) => !v)}
              style={{
                padding: "0.55rem 1.2rem",
                borderRadius: "0.6rem",
                border: "none",
                background: "var(--lgs-azul)",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {mostrarForm ? "Cancelar" : "+ Nueva campaña"}
            </button>
          )}
        </div>
      </div>

      {mostrarForm && (
        <form
          onSubmit={crear}
          style={{
            marginTop: "1rem",
            padding: "1.25rem",
            border: "1px solid #e3e7f0",
            borderRadius: "0.9rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <label
            style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "2 1 12rem" }}
          >
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              minLength={3}
              maxLength={80}
              placeholder="Campaña Agosto 2026"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Inicio</span>
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Duración (semanas)</span>
            <input
              type="number"
              min={1}
              max={52}
              value={semanas}
              onChange={(e) => setSemanas(e.target.value)}
              required
              style={{ ...inputStyle, width: "8rem" }}
            />
          </label>
          <button
            type="submit"
            disabled={creando}
            style={{
              padding: "0.6rem 1.4rem",
              borderRadius: "0.6rem",
              border: "none",
              background: creando ? "#9e9e9e" : "var(--lgs-verde)",
              color: "#1b2a10",
              fontWeight: 700,
              cursor: creando ? "wait" : "pointer",
            }}
          >
            {creando ? "Creando…" : "Crear campaña"}
          </button>
          <p style={{ width: "100%", fontSize: "0.8rem", color: "var(--texto-suave)" }}>
            Se generarán automáticamente los cursos Junior y Youngster, cada uno con sus 4 niveles
            (Rookie → Champion → Elite → Legendary), 4 lecciones por nivel con cuestionario de
            práctica y su Level Up.
          </p>
          {error !== null && (
            <p role="alert" style={{ width: "100%", color: "#c62828", fontSize: "0.9rem" }}>
              {error}
            </p>
          )}
        </form>
      )}

      <section
        style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}
      >
        {campanias === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando campañas…</p>
        ) : campanias.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>
            Aún no hay campañas. {puedeGestionar ? "Crea la primera con “+ Nueva campaña”." : ""}
          </p>
        ) : (
          campanias.map((c) => {
            const estado = ESTILO_ESTADO[c.estado];
            return (
              <Link
                key={c.id}
                href={`/panel/campanias/${c.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.9rem 1.1rem",
                  border: "1px solid #e3e7f0",
                  borderRadius: "0.8rem",
                  color: "inherit",
                }}
              >
                <div>
                  <strong style={{ fontSize: "1.05rem" }}>{c.nombre}</strong>
                  <div style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
                    {c.inicio} → {c.fin} · {c.cursos} cursos
                  </div>
                </div>
                <span
                  style={{
                    padding: "0.25rem 0.7rem",
                    borderRadius: "1rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: estado.color,
                    background: estado.fondo,
                  }}
                >
                  {estado.texto}
                </span>
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
