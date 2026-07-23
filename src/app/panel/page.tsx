"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Me {
  user: { id: string; username: string; debeCambiarPassword: boolean } | null;
  roles: { roleCode: string; countryCode: string | null }[];
  permisos: { code: string; countryCode: string | null }[];
  paises: string[] | null;
}

/** Menú lateral generado según permisos (sección 10). */
const MENU: { permiso: string; etiqueta: string; color: string }[] = [
  { permiso: "panel.administracion", etiqueta: "Administración", color: "var(--lgs-azul)" },
  { permiso: "usuarios.gestionar", etiqueta: "Usuarios", color: "var(--lgs-cian)" },
  { permiso: "roles.asignar", etiqueta: "Roles y permisos", color: "var(--lgs-purpura)" },
  { permiso: "auditoria.ver", etiqueta: "Auditoría", color: "var(--lgs-verde)" },
  { permiso: "panel.guia", etiqueta: "Mis salones", color: "var(--lgs-amarillo)" },
  { permiso: "panel.apoderado", etiqueta: "Mis niños", color: "var(--lgs-magenta)" },
  { permiso: "panel.alumno", etiqueta: "Mis clases", color: "var(--lgs-verde)" },
];

export default function PanelPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) {
        // Intentar rotación silenciosa antes de mandar al login.
        const refresh = await fetch("/api/auth/refresh", { method: "POST" });
        if (!refresh.ok) {
          router.replace("/login");
          return;
        }
        const retry = await fetch("/api/auth/me");
        if (!retry.ok) {
          router.replace("/login");
          return;
        }
        if (!cancelado) {
          setMe((await retry.json()) as Me);
          setCargando(false);
        }
        return;
      }
      if (!res.ok) {
        router.replace("/login");
        return;
      }
      if (!cancelado) {
        setMe((await res.json()) as Me);
        setCargando(false);
      }
    }
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [router]);

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (cargando || me === null) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando tu panel…</p>
      </main>
    );
  }

  const permisos = new Set(me.permisos.map((p) => p.code));
  const opciones = MENU.filter((item) => permisos.has(item.permiso));

  return (
    <main style={{ minHeight: "100vh", display: "flex" }}>
      <aside
        style={{
          width: "15rem",
          background: "#f5f7fb",
          borderRight: "1px solid #e3e7f0",
          padding: "1.5rem 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <h1
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "1.3rem",
            marginBottom: "1rem",
          }}
        >
          <Image src="/logo.jpg" alt="" width={40} height={36} style={{ height: "auto" }} />
          <span>
            <span style={{ color: "var(--lgs-azul)" }}>LGS</span>{" "}
            <span style={{ color: "var(--lgs-magenta)" }}>Kids</span>
          </span>
        </h1>
        {opciones.map((item) => (
          <div
            key={item.permiso}
            style={{
              padding: "0.6rem 0.75rem",
              borderRadius: "0.6rem",
              borderLeft: `4px solid ${item.color}`,
              background: "white",
              fontWeight: 600,
              fontSize: "0.95rem",
            }}
          >
            {item.etiqueta}
          </div>
        ))}
        <button
          onClick={() => void salir()}
          style={{
            marginTop: "auto",
            padding: "0.6rem",
            borderRadius: "0.6rem",
            border: "1px solid #e3e7f0",
            background: "white",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          Cerrar sesión
        </button>
      </aside>

      <section style={{ flex: 1, padding: "2rem" }}>
        <h2 style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>
          ¡Hola, {me.user?.username}! 👋
        </h2>
        <p style={{ color: "var(--texto-suave)" }}>
          Roles:{" "}
          {me.roles
            .map((r) => r.roleCode + (r.countryCode ? ` (${r.countryCode})` : ""))
            .join(", ") || "sin roles"}
          {" · "}
          Alcance: {me.paises === null ? "todos los países" : me.paises.join(", ") || "—"}
        </p>
        <p style={{ marginTop: "2rem", color: "var(--texto-suave)" }}>
          Los módulos académicos (campañas, salones, sesiones) llegan en las próximas fases.
        </p>
      </section>
    </main>
  );
}
