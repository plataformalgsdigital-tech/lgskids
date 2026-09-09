"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { cerrarSesion, useReinicioAlVolver } from "@/ui/sesion";

/**
 * Layout del panel: el sidebar (menú según permisos) persiste en TODAS las
 * páginas bajo /panel. La autorización real sigue siendo del servidor,
 * endpoint por endpoint — este menú es solo navegación.
 */

interface Me {
  user: { id: string; username: string } | null;
  permisos: { code: string }[];
}

// El orden y el permiso PADRE de cada sección los define el módulo access
// (SECCIONES_MENU), que es la única fuente de la jerarquía.
const SECCIONES = ["Tablero", "Académica", "Operación", "Administración", "Guía"] as const;

/** Permiso padre por sección: sin él, la sección no se dibuja. */
const PERMISO_SECCION: Record<(typeof SECCIONES)[number], string> = {
  Tablero: "panel.tablero",
  Académica: "seccion.academica",
  Operación: "seccion.operacion",
  Administración: "seccion.administracion",
  Guía: "seccion.guia",
};

const MENU: {
  seccion: (typeof SECCIONES)[number];
  /** Permiso de VISIBILIDAD del ítem: apagarlo lo oculta sin quitar capacidades. */
  permisoMenu?: string;
  permiso: string;
  etiqueta: string;
  color: string;
  href?: string;
  pronto?: boolean;
}[] = [
  // ── Tablero: pantalla de entrada, encima de todo ──────────
  {
    seccion: "Tablero",
    permiso: "panel.tablero",
    etiqueta: "Tablero",
    color: "var(--lgs-purpura)",
    href: "/panel/tablero",
  },
  // ── Académica (Campañas y Horarios viven dentro de Mantenimiento Académico) ──
  {
    seccion: "Académica",
    permiso: "salones.ver",
    etiqueta: "Calendario",
    color: "var(--lgs-verde)",
    href: "/panel/calendario",
    permisoMenu: "menu.calendario",
  },
  {
    seccion: "Académica",
    // La ACCIÓN es de coordinación (`salones.gestionar`); el guía solicita el
    // refuerzo desde el modal de la sesión, no desde aquí.
    permiso: "salones.gestionar",
    etiqueta: "Sesiones",
    color: "var(--lgs-azul)",
    href: "/panel/sesiones",
    permisoMenu: "menu.sesiones",
  },
  {
    seccion: "Académica",
    permiso: "catalogo.ver",
    etiqueta: "Mantenimiento Académico",
    color: "var(--lgs-purpura)",
    href: "/panel/mantenimiento-cursos",
    permisoMenu: "menu.mantenimiento",
  },
  // ── Operación ──────────────────────────────────────────────
  {
    seccion: "Operación",
    permiso: "personas.ver",
    etiqueta: "Kids",
    color: "var(--lgs-cian)",
    href: "/panel/personas",
    permisoMenu: "menu.kids",
  },
  {
    seccion: "Operación",
    permiso: "contratos.ver",
    etiqueta: "Contratos",
    color: "var(--lgs-magenta)",
    href: "/panel/contratos",
    permisoMenu: "menu.contratos",
  },
  {
    seccion: "Operación",
    permiso: "contratos.gestionar",
    etiqueta: "Reservas (LGS)",
    color: "var(--lgs-purpura)",
    href: "/panel/reservas",
    permisoMenu: "menu.reservas",
  },
  // ── Administración ─────────────────────────────────────────
  {
    seccion: "Administración",
    permiso: "usuarios.gestionar",
    etiqueta: "Usuarios y roles",
    color: "var(--lgs-cian)",
    href: "/panel/usuarios",
    permisoMenu: "menu.usuarios",
  },
  {
    seccion: "Administración",
    permiso: "usuarios.gestionar",
    permisoMenu: "menu.guias",
    etiqueta: "Guías",
    color: "var(--lgs-amarillo)",
    href: "/panel/guias",
  },
  {
    seccion: "Administración",
    permiso: "reportes.ver",
    etiqueta: "Reportes",
    color: "var(--lgs-purpura)",
    href: "/panel/reportes",
    permisoMenu: "menu.reportes",
  },
  {
    seccion: "Administración",
    permiso: "auditoria.ver",
    etiqueta: "Auditoría",
    color: "var(--lgs-verde)",
    href: "/panel/auditoria",
    permisoMenu: "menu.auditoria",
  },
  {
    seccion: "Administración",
    permiso: "catalogo.gestionar",
    etiqueta: "Aviso de login",
    color: "var(--lgs-amarillo)",
    href: "/panel/aviso-login",
    permisoMenu: "menu.aviso_login",
  },
  // ── Guía (restringido a sus salones/sesiones/niños) ────────
  {
    seccion: "Guía",
    permiso: "panel.guia",
    etiqueta: "Mis clases",
    color: "var(--lgs-verde)",
    href: "/panel/mis-clases",
    permisoMenu: "menu.mis_clases",
  },
  {
    seccion: "Guía",
    permiso: "panel.guia",
    etiqueta: "Mis salones",
    color: "var(--lgs-amarillo)",
    href: "/panel/mis-salones",
    permisoMenu: "menu.mis_salones",
  },
  {
    seccion: "Guía",
    permiso: "panel.guia",
    etiqueta: "Mis niños",
    color: "var(--lgs-magenta)",
    href: "/panel/mis-ninos",
    permisoMenu: "menu.mis_ninos",
  },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  // Si el navegador restaura esta pantalla desde la caché de retroceso,
  // se recarga para volver a comprobar la sesión.
  useReinicioAlVolver();
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
    await cerrarSesion();
  }

  if (me === null) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      </main>
    );
  }

  const permisos = new Set(me.permisos.map((p) => p.code));
  // Dos condiciones: el permiso FUNCIONAL (si no, la pantalla daría 403) y el
  // de VISIBILIDAD del menú. Así se puede ocultar un ítem sin quitar acceso.
  const opciones = MENU.filter(
    (item) =>
      permisos.has(item.permiso) &&
      (item.permisoMenu === undefined || permisos.has(item.permisoMenu)),
  );

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
        {SECCIONES.map((seccion) => {
          // Sin el permiso PADRE la sección no aparece, aunque el rol conserve
          // permisos de sus ítems.
          if (!permisos.has(PERMISO_SECCION[seccion])) return null;
          const items = opciones.filter((o) => o.seccion === seccion);
          if (items.length === 0) return null;
          return (
            <div key={seccion} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {seccion !== "Tablero" && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--texto-suave)",
                    padding: "0.5rem 0.25rem 0.1rem",
                  }}
                >
                  {seccion}
                </span>
              )}
              {items.map((item) => {
                const activo = item.href !== undefined && pathname.startsWith(item.href);
                const estilo = {
                  padding: "0.55rem 0.75rem",
                  borderRadius: "0.6rem",
                  borderLeft: `4px solid ${item.color}`,
                  background: activo ? "#e8f1fd" : "white",
                  fontWeight: 600,
                  fontSize: "0.92rem",
                  color: "inherit",
                  display: "block",
                } as const;
                return item.href !== undefined ? (
                  <Link key={item.etiqueta} href={item.href} style={estilo}>
                    {item.etiqueta}
                  </Link>
                ) : (
                  <div
                    key={item.etiqueta}
                    style={{ ...estilo, opacity: 0.55 }}
                    title="Disponible próximamente"
                  >
                    {item.etiqueta}{" "}
                    <span style={{ fontSize: "0.68rem", color: "var(--texto-suave)" }}>
                      (pronto)
                    </span>
                  </div>
                );
              })}
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
