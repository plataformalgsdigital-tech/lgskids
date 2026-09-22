"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { RolesPermisos } from "./RolesPermisos";
import { Aviso, CajaCredenciales, TIPOS, boton, mensajeDeError, tarjeta } from "./comunes";

interface Solicitud {
  id: string;
  usuarioIngresado: string;
  userId: string | null;
  nombre: string | null;
  contacto: string | null;
  creadaEn: string;
}

/** Las tres puertas de alta, una por tipo de usuario (como en MOSAICO). */
const PUERTAS = [
  {
    tipo: "estudiante",
    href: "/panel/usuarios/estudiante",
    descripcion:
      "Desde un contrato en KIDS. La cuenta nace al aprobarlo (rol alumno) y se reactiva al aprobar su renovación.",
  },
  {
    tipo: "administrativo",
    href: "/panel/usuarios/administrativo",
    descripcion:
      "Selecciona un rol de la matriz de permisos y captura sus datos. Usuario y clave se generan solos.",
  },
  {
    tipo: "guia",
    href: "/panel/usuarios/guia",
    descripcion:
      "Crea la cuenta y su ficha: foto, documento y sala de Zoom. O envíale el enlace para que la complete él.",
  },
] as const;

export default function UsuariosPage() {
  const [pestana, setPestana] = useState<"usuarios" | "roles">("usuarios");
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [credenciales, setCredenciales] = useState<{ username: string; clave: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargarSolicitudes = useCallback(async () => {
    const res = await apiFetch("/api/identity/solicitudes-clave");
    if (res.ok) {
      const data: { solicitudes: Solicitud[] } = await res.json();
      setSolicitudes(data.solicitudes);
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargarSolicitudes();
    }
    void inicial();
  }, [cargarSolicitudes]);

  async function restablecer(userId: string, username: string) {
    if (
      !window.confirm(
        `¿Restablecer la clave de ${username}? Se genera una nueva, se cierran sus sesiones y deberá cambiarla al entrar.`,
      )
    ) {
      return;
    }
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/identity/users/${userId}/restablecer-clave`, {
        method: "POST",
      });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo restablecer la clave."));
        return;
      }
      const data: { username: string; clave: string } = await res.json();
      setCredenciales(data);
      await cargarSolicitudes();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function descartar(id: string) {
    if (!window.confirm("¿Descartar la solicitud sin restablecer la clave?")) return;
    const res = await apiFetch(`/api/identity/solicitudes-clave/${id}/descartar`, {
      method: "POST",
    });
    if (!res.ok) {
      setError("No se pudo descartar la solicitud.");
      return;
    }
    await cargarSolicitudes();
  }

  const pestanaEstilo = (activa: boolean): CSSProperties => ({
    padding: "0.55rem 1.3rem",
    borderRadius: "0.7rem 0.7rem 0 0",
    border: "1px solid #e3e7f0",
    borderBottom: activa ? "2px solid white" : "1px solid #e3e7f0",
    background: activa ? "white" : "#f5f7fb",
    fontWeight: 700,
    fontSize: "0.95rem",
    cursor: "pointer",
  });

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem" }}>Usuarios, roles y permisos</h1>

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.4rem" }}>
        <button
          style={pestanaEstilo(pestana === "usuarios")}
          onClick={() => setPestana("usuarios")}
        >
          👤 Usuarios
        </button>
        <button style={pestanaEstilo(pestana === "roles")} onClick={() => setPestana("roles")}>
          🛡️ Roles y permisos
        </button>
      </div>

      {pestana === "roles" && <RolesPermisos />}

      {pestana === "usuarios" && (
        <section
          style={{ marginTop: "1.2rem", display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          {credenciales !== null && (
            <CajaCredenciales
              titulo="🔑 Clave restablecida"
              username={credenciales.username}
              clave={credenciales.clave}
              onCerrar={() => setCredenciales(null)}
            />
          )}
          {error !== null && <Aviso tipo="error">{error}</Aviso>}

          <div style={tarjeta}>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <span
                aria-hidden
                style={{
                  width: "3.2rem",
                  height: "3.2rem",
                  borderRadius: "50%",
                  background: "#e8eaf6",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "1.5rem",
                  flexShrink: 0,
                }}
              >
                👥
              </span>
              <div>
                <h2 style={{ fontSize: "1.35rem", margin: 0 }}>Gestión de usuarios</h2>
                <p
                  style={{ margin: "0.2rem 0 0", color: "var(--texto-suave)", fontSize: "0.9rem" }}
                >
                  Crea, consulta, edita e inactiva cuentas de acceso: estudiante, administrativo o
                  guía.
                </p>
              </div>
            </div>
            <Link
              href="/panel/usuarios/consultar"
              style={{
                display: "inline-block",
                marginTop: "0.9rem",
                color: "#3f51b5",
                fontWeight: 600,
                fontSize: "0.95rem",
              }}
            >
              📋 Consultar / editar / inactivar usuarios por tipo (clave, exportar CSV)
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))",
              gap: "1rem",
            }}
          >
            {PUERTAS.map((p) => {
              const t = TIPOS[p.tipo];
              return (
                <Link
                  key={p.tipo}
                  href={p.href}
                  className="lgs-puerta-usuario"
                  style={{ ...tarjeta, color: "inherit", display: "block" }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: "2.9rem",
                      height: "2.9rem",
                      borderRadius: "50%",
                      background: t.fondo,
                      display: "grid",
                      placeItems: "center",
                      fontSize: "1.35rem",
                    }}
                  >
                    {t.icono}
                  </span>
                  <h3 style={{ fontSize: "1.12rem", margin: "0.9rem 0 0.35rem" }}>{t.titulo}</h3>
                  <p style={{ margin: 0, color: "var(--texto-suave)", fontSize: "0.9rem" }}>
                    {p.descripcion}
                  </p>
                </Link>
              );
            })}
          </div>

          {solicitudes.length > 0 && (
            <div
              style={{
                padding: "0.9rem 1rem",
                border: "2px solid #f3c969",
                background: "#fff8e6",
                borderRadius: "0.9rem",
              }}
            >
              <strong>🔔 Solicitudes de clave ({solicitudes.length})</strong>
              <p style={{ margin: "0.2rem 0 0.6rem", fontSize: "0.8rem", color: "#6b5a1e" }}>
                Pidieron “olvidé mi clave” en el login. Restablece y entrega la clave nueva (por
                ejemplo por WhatsApp): al entrar se les pedirá cambiarla.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {solicitudes.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                      background: "white",
                      padding: "0.5rem 0.7rem",
                      borderRadius: "0.6rem",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem" }}>
                      <strong>{s.usuarioIngresado}</strong>
                      {s.nombre !== null && ` · ${s.nombre}`}
                      {s.userId === null && (
                        <span style={{ color: "#c62828" }}> · ese usuario no existe</span>
                      )}
                      {s.contacto !== null && ` · contacto: ${s.contacto}`}
                      <span style={{ color: "var(--texto-suave)" }}>
                        {" "}
                        · {new Date(s.creadaEn).toLocaleString("es")}
                      </span>
                    </span>
                    <span style={{ display: "flex", gap: "0.4rem" }}>
                      {s.userId !== null && (
                        <button
                          style={{ ...boton, borderColor: "var(--lgs-verde)" }}
                          disabled={ocupado}
                          onClick={() => void restablecer(s.userId ?? "", s.usuarioIngresado)}
                        >
                          🔑 Restablecer
                        </button>
                      )}
                      <button style={boton} onClick={() => void descartar(s.id)}>
                        Descartar
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
