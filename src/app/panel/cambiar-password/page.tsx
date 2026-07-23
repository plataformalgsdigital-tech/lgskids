"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function CambiarPasswordPage() {
  const router = useRouter();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (nueva !== confirmar) {
      setError("La confirmación no coincide con la contraseña nueva.");
      return;
    }
    setCargando(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passwordActual: actual, passwordNueva: nueva }),
      });
      const data: { error?: { message: string; details?: string[] } } = await res.json();
      if (!res.ok) {
        const detalles = data.error?.details?.join(" ") ?? "";
        setError(
          `${data.error?.message ?? "No se pudo cambiar la contraseña."} ${detalles}`.trim(),
        );
        return;
      }
      // Sesiones revocadas: volver a entrar con la contraseña nueva.
      router.replace("/login");
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setCargando(false);
    }
  }

  const inputStyle = {
    padding: "0.65rem 0.75rem",
    borderRadius: "0.6rem",
    border: "1.5px solid #d8dce6",
    fontSize: "1rem",
  } as const;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1rem" }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: "24rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          border: "1px solid #e3e7f0",
          borderRadius: "1rem",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.4rem" }}>Cambia tu contraseña</h1>
        <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
          Mínimo 10 caracteres, con letras y números. Al guardarla se cerrarán todas tus sesiones.
        </p>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Contraseña actual</span>
          <input
            type="password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            autoComplete="current-password"
            required
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Contraseña nueva</span>
          <input
            type="password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            autoComplete="new-password"
            required
            minLength={10}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Confirmar contraseña nueva</span>
          <input
            type="password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            autoComplete="new-password"
            required
            minLength={10}
            style={inputStyle}
          />
        </label>
        {error !== null && (
          <p role="alert" style={{ color: "#c62828", fontSize: "0.9rem" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={cargando}
          style={{
            padding: "0.75rem",
            borderRadius: "0.75rem",
            border: "none",
            background: cargando ? "#9e9e9e" : "var(--lgs-verde)",
            color: "#1b2a10",
            fontWeight: 700,
            fontSize: "1rem",
            cursor: cargando ? "wait" : "pointer",
          }}
        >
          {cargando ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </main>
  );
}
