"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

/**
 * Layout del panel: el sidebar (menú según permisos) persiste en TODAS las
 * páginas bajo /panel. La autorización real sigue siendo del servidor,
 * endpoint por endpoint — este menú es solo navegación.
 */

interface Me {
  user: { id: string; username: string } | null;
  permisos: { code: string }[];
}

const MENU: {
  permiso: string;
  etiqueta: string;
  color: string;
  href?: string;
  pronto?: boolean;
}[] = [
  {
    permiso: "catalogo.ver",
    etiqueta: "Campañas",
    color: "var(--lgs-azul)",
    href: "/panel/campanias",
  },
  {
    permiso: "personas.ver",
    etiqueta: "Personas",
    color: "var(--lgs-cian)",
    href: "/panel/personas",
  },
  {
    permiso: "contratos.ver",
    etiqueta: "Contratos",
    color: "var(--lgs-magenta)",
    href: "/panel/contratos",
  },
  {
    permiso: "contratos.gestionar",
    etiqueta: "Reservas (LGS)",
    color: "var(--lgs-purpura)",
    href: "/panel/reservas",
  },
  {
    permiso: "salones.ver",
    etiqueta: "Salones",
    color: "var(--lgs-verde)",
    href: "/panel/salones",
  },
  {
    permiso: "salones.ver",
    etiqueta: "Horarios",
    color: "var(--lgs-amarillo)",
    href: "/panel/horarios",
  },
  {
    permiso: "usuarios.gestionar",
    etiqueta: "Usuarios y roles",
    color: "var(--lgs-cian)",
    href: "/panel/usuarios",
  },
  {
    permiso: "reportes.ver",
    etiqueta: "Reportes",
    color: "var(--lgs-purpura)",
    href: "/panel/reportes",
  },
  {
    permiso: "auditoria.ver",
    etiqueta: "Auditoría",
    color: "var(--lgs-verde)",
    href: "/panel/auditoria",
  },
  // Paneles por tipo de usuario: se construyen junto con la operación real.
  { permiso: "panel.guia", etiqueta: "Mis salones", color: "var(--lgs-amarillo)", pronto: true },
  {
    permiso: "panel.apoderado",
    etiqueta: "Mis niños",
    color: "var(--lgs-magenta)",
    pronto: true,
  },
  { permiso: "panel.alumno", etiqueta: "Mis clases", color: "var(--lgs-verde)", pronto: true },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [busqueda, setBusqueda] = useState("");

  function buscar(event: FormEvent) {
    event.preventDefault();
    const q = busqueda.trim();
    if (q.length >= 2) {
      router.push(`/panel/buscar?q=${encodeURIComponent(q)}`);
    }
  }

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      let res = await fetch("/api/auth/me");
      if (res.status === 401) {
        const refresh = await fetch("/api/auth/refresh", { method: "POST" });
        if (!refresh.ok) {
          router.replace("/login");
          return;
        }
        res = await fetch("/api/auth/me");
      }
      if (!res.ok) {
        router.replace("/login");
        return;
      }
      if (!cancelado) {
        setMe((await res.json()) as Me);
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

  if (me === null) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      </main>
    );
  }

  const permisos = new Set(me.permisos.map((p) => p.code));
  const opciones = MENU.filter((item) => permisos.has(item.permiso));

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <aside
        style={{
          width: "15rem",
          flexShrink: 0,
          background: "#f5f7fb",
          borderRight: "1px solid #e3e7f0",
          padding: "1.5rem 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <Link
          href="/panel"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "1.3rem",
            fontWeight: 700,
            marginBottom: "1rem",
            color: "inherit",
          }}
        >
          <Image src="/logo.jpg" alt="" width={40} height={36} style={{ height: "auto" }} />
          <span>
            <span style={{ color: "var(--lgs-azul)" }}>LGS</span>{" "}
            <span style={{ color: "var(--lgs-magenta)" }}>Kids</span>
          </span>
        </Link>
        {opciones.map((item) => {
          const activo = item.href !== undefined && pathname.startsWith(item.href);
          const estilo = {
            padding: "0.6rem 0.75rem",
            borderRadius: "0.6rem",
            borderLeft: `4px solid ${item.color}`,
            background: activo ? "#e8f1fd" : "white",
            fontWeight: 600,
            fontSize: "0.95rem",
            color: "inherit",
            display: "block",
          } as const;
          return item.href !== undefined ? (
            <Link key={item.permiso} href={item.href} style={estilo}>
              {item.etiqueta}
            </Link>
          ) : (
            <div
              key={item.permiso}
              style={{ ...estilo, opacity: 0.55 }}
              title="Disponible próximamente"
            >
              {item.etiqueta}{" "}
              <span style={{ fontSize: "0.68rem", color: "var(--texto-suave)" }}>(pronto)</span>
            </div>
          );
        })}
        <div
          style={{
            marginTop: "auto",
            borderTop: "1px solid #e3e7f0",
            paddingTop: "0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <span
              aria-hidden
              style={{
                width: "2.2rem",
                height: "2.2rem",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                fontSize: "1rem",
                color: "white",
                background: "linear-gradient(135deg, var(--lgs-azul) 0%, var(--lgs-magenta) 100%)",
                flexShrink: 0,
              }}
            >
              {(me.user?.username ?? "?").charAt(0).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {me.user?.username}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--texto-suave)" }}>sesión activa</div>
            </div>
          </div>
          <button
            onClick={() => void salir()}
            style={{
              padding: "0.55rem",
              borderRadius: "0.6rem",
              border: "1px solid #e3e7f0",
              background: "white",
              cursor: "pointer",
              fontSize: "0.88rem",
              fontWeight: 600,
            }}
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {(permisos.has("personas.ver") || permisos.has("contratos.ver")) && (
          <header
            style={{
              padding: "0.75rem 2rem",
              borderBottom: "1px solid #e3e7f0",
              background: "#fafbfe",
            }}
          >
            <form onSubmit={buscar} style={{ display: "flex", gap: "0.5rem", maxWidth: "34rem" }}>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="🔍 Buscar por N° de contrato, documento, nombre, apellido o usuario…"
                style={{
                  flex: 1,
                  padding: "0.55rem 0.8rem",
                  borderRadius: "0.6rem",
                  border: "1.5px solid #d8dce6",
                  fontSize: "0.9rem",
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "0.55rem 1.1rem",
                  borderRadius: "0.6rem",
                  border: "none",
                  background: "var(--lgs-azul)",
                  color: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Buscar
              </button>
            </form>
          </header>
        )}
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
