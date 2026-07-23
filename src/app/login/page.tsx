"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data: { user?: { debeCambiarPassword: boolean }; error?: { message: string } } =
        await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo iniciar sesión.");
        return;
      }
      if (data.user?.debeCambiarPassword === true) {
        router.push("/panel/cambiar-password");
        return;
      }
      // Los ALUMNOS van a su panel propio; el resto al panel de gestión.
      const me = await fetch("/api/auth/me");
      if (me.ok) {
        const perfil: { permisos: { code: string }[] } = await me.json();
        const codes = new Set(perfil.permisos.map((p) => p.code));
        const esAlumno =
          codes.has("panel.alumno") &&
          !codes.has("panel.administracion") &&
          !codes.has("panel.guia");
        router.push(esAlumno ? "/mi-panel" : "/panel");
      } else {
        router.push("/panel");
      }
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, var(--lgs-azul) 0%, var(--lgs-purpura) 100%)",
        padding: "1rem",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          background: "var(--fondo)",
          borderRadius: "1.25rem",
          padding: "2.5rem 2rem",
          width: "100%",
          maxWidth: "22rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <Image
          src="/logo.jpg"
          alt="LGS Kids"
          width={160}
          height={142}
          priority
          style={{ alignSelf: "center", height: "auto" }}
        />
        <p style={{ textAlign: "center", color: "var(--texto-suave)", fontSize: "0.95rem" }}>
          Ingresa con tu usuario
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Usuario</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
            style={{
              padding: "0.65rem 0.75rem",
              borderRadius: "0.6rem",
              border: "1.5px solid #d8dce6",
              fontSize: "1rem",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{
              padding: "0.65rem 0.75rem",
              borderRadius: "0.6rem",
              border: "1.5px solid #d8dce6",
              fontSize: "1rem",
            }}
          />
        </label>

        {error !== null && (
          <p role="alert" style={{ color: "#c62828", fontSize: "0.9rem", textAlign: "center" }}>
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
            background: cargando ? "#9e9e9e" : "var(--lgs-azul)",
            color: "white",
            fontSize: "1.05rem",
            fontWeight: 700,
            cursor: cargando ? "wait" : "pointer",
          }}
        >
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
