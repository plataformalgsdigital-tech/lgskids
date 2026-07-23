"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Layout del panel: el sidebar (menú según permisos) persiste en TODAS las
 * páginas bajo /panel. La autorización real sigue siendo del servidor,
 * endpoint por endpoint — este menú es solo navegación.
 */

interface Me {
  user: { id: string; username: string } | null;
  permisos: { code: string }[];
}

const MENU: { permiso: string; etiqueta: string; color: string; href?: string }[] = [
  { permiso: "panel.administracion", etiqueta: "Administración", color: "var(--lgs-azul)" },
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
  { permiso: "usuarios.gestionar", etiqueta: "Usuarios", color: "var(--lgs-cian)" },
  { permiso: "roles.asignar", etiqueta: "Roles y permisos", color: "var(--lgs-purpura)" },
  { permiso: "auditoria.ver", etiqueta: "Auditoría", color: "var(--lgs-verde)" },
  { permiso: "panel.guia", etiqueta: "Mis salones", color: "var(--lgs-amarillo)" },
  { permiso: "panel.apoderado", etiqueta: "Mis niños", color: "var(--lgs-magenta)" },
  { permiso: "panel.alumno", etiqueta: "Mis clases", color: "var(--lgs-verde)" },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

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
            <div key={item.permiso} style={estilo} title="Disponible en próximas fases">
              {item.etiqueta}
            </div>
          );
        })}
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
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
