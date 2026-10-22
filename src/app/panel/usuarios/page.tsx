"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { RolesPermisos } from "./RolesPermisos";
import { Aviso, CajaCredenciales, TIPOS, boton, mensajeDeError, tarjeta } from "./comunes";
import { SoloSi } from "@/ui/SoloSi";
import { usePermisos } from "@/ui/permisos";

interface Solicitud {
  id: string;
  usuarioIngresado: string;
  userId: string | null;
  nombre: string | null;
  contacto: string | null;
  creadaEn: string;
  estado: "PENDIENTE" | "ATENDIDA" | "DESCARTADA";
  enlaceEnviadoA: string | null;
  enlaceProblema: string | null;
  resueltaPorEnlace: boolean;
  atendidaEn: string | null;
  atendidaPor: string | null;
}

/** Qué pasó con el enlace de WhatsApp de una solicitud, en una frase. */
function textoEnlace(s: Solicitud): { texto: string; color: string } | null {
  if (s.resueltaPorEnlace) return { texto: "✅ Eligió su clave con el enlace", color: "#1b5e20" };
  if (s.enlaceEnviadoA !== null) {
    return { texto: `📲 Enlace enviado por WhatsApp a ${s.enlaceEnviadoA}`, color: "#0d47a1" };
  }
  if (s.enlaceProblema !== null) return { texto: `⚠ ${s.enlaceProblema}`, color: "#b26a00" };
  return null;
}

const ESTADO_SOLICITUD: Record<Solicitud["estado"], { texto: string; color: string }> = {
  PENDIENTE: { texto: "Pendiente", color: "#b26a00" },
  ATENDIDA: { texto: "Atendida", color: "#1b5e20" },
  DESCARTADA: { texto: "Descartada", color: "#6b7280" },
};

/** Las tres puertas de alta, una por tipo de usuario (como en MOSAICO). */
const PUERTAS = [
  {
    tipo: "estudiante",
    href: "/panel/usuarios/estudiante",
    op: "op.usuarios.estudiante",
    descripcion:
      "Desde un contrato en KIDS. La cuenta nace al aprobarlo (rol alumno) y se reactiva al aprobar su renovación.",
  },
  {
    tipo: "administrativo",
    href: "/panel/usuarios/administrativo",
    op: "op.usuarios.administrativo",
    descripcion:
      "Selecciona un rol de la matriz de permisos y captura sus datos. Usuario y clave se generan solos.",
  },
  {
    tipo: "guia",
    href: "/panel/usuarios/guia",
    op: "op.usuarios.guia",
    descripcion:
      "Crea la cuenta y su ficha: foto, documento y sala de Zoom. O envíale el enlace para que la complete él.",
  },
] as const;

export default function UsuariosPage() {
  const [elegida, setPestana] = useState<"usuarios" | "roles">("usuarios");
  // Pestañas, tarjetas y acciones: cada una con su opción (Roles › Usuarios y roles).
  const { puede, listo } = usePermisos();
  const pestanas = (["usuarios", "roles"] as const).filter((p) =>
    puede(p === "usuarios" ? "op.usuarios.tab_usuarios" : "op.usuarios.tab_roles"),
  );
  const pestana = pestanas.includes(elegida) ? elegida : pestanas[0];
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [credenciales, setCredenciales] = useState<{ username: string; clave: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /** El registro completo (60 días), solo cuando se pide verlo. */
  const [registro, setRegistro] = useState<Solicitud[] | null>(null);

  const cargarSolicitudes = useCallback(async () => {
    const res = await apiFetch("/api/identity/solicitudes-clave");
    if (res.ok) {
      const data: { solicitudes: Solicitud[] } = await res.json();
      setSolicitudes(data.solicitudes);
    }
  }, []);

  async function alternarRegistro() {
    if (registro !== null) {
      setRegistro(null);
      return;
    }
    const res = await apiFetch("/api/identity/solicitudes-clave?historial=1");
    if (res.ok) {
      const data: { solicitudes: Solicitud[] } = await res.json();
      setRegistro(data.solicitudes);
    } else {
      setError("No se pudo cargar el registro de solicitudes.");
    }
  }

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
        {pestanas.includes("usuarios") && (
          <button
            style={pestanaEstilo(pestana === "usuarios")}
            onClick={() => setPestana("usuarios")}
          >
            👤 Usuarios
          </button>
        )}
        {pestanas.includes("roles") && (
          <button style={pestanaEstilo(pestana === "roles")} onClick={() => setPestana("roles")}>
            🛡️ Roles y permisos
          </button>
        )}
      </div>
      {listo && pestana === undefined && (
        <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>
          🔒 Tu rol no tiene habilitada ninguna pestaña de Usuarios y roles.
        </p>
      )}

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
            <SoloSi op="op.usuarios.consultar">
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
            </SoloSi>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))",
              gap: "1rem",
            }}
          >
            {PUERTAS.filter((p) => puede(p.op)).map((p) => {
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
              <strong>🔔 Solicitudes de clave pendientes ({solicitudes.length})</strong>
              <p style={{ margin: "0.2rem 0 0.6rem", fontSize: "0.8rem", color: "#6b5a1e" }}>
                Pidieron “olvidé mi clave” en el login. A quien tiene WhatsApp registrado le llega
                solo un enlace para elegir clave (se cierra sola al usarlo). Si no le llegó,
                restablece y entrega la clave nueva: al entrar se le pedirá cambiarla.
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
                      {textoEnlace(s) !== null && (
                        <span
                          style={{
                            display: "block",
                            fontSize: "0.78rem",
                            color: textoEnlace(s)?.color,
                          }}
                        >
                          {textoEnlace(s)?.texto}
                        </span>
                      )}
                    </span>
                    <span style={{ display: "flex", gap: "0.4rem" }}>
                      {s.userId !== null && (
                        <SoloSi op="op.usuarios.clave">
                          <button
                            style={{ ...boton, borderColor: "var(--lgs-verde)" }}
                            disabled={ocupado}
                            onClick={() => void restablecer(s.userId ?? "", s.usuarioIngresado)}
                          >
                            🔑 Restablecer
                          </button>
                        </SoloSi>
                      )}
                      <SoloSi op="op.usuarios.clave">
                        <button style={boton} onClick={() => void descartar(s.id)}>
                          Descartar
                        </button>
                      </SoloSi>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <SoloSi op="op.usuarios.clave">
            <div>
              <button type="button" style={boton} onClick={() => void alternarRegistro()}>
                {registro === null
                  ? "📋 Ver registro de solicitudes de clave (60 días)"
                  : "Ocultar registro de solicitudes"}
              </button>
              {registro !== null && (
                <div style={{ overflowX: "auto", marginTop: "0.6rem" }}>
                  {registro.length === 0 ? (
                    <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>
                      No hubo solicitudes en los últimos 60 días.
                    </p>
                  ) : (
                    <table
                      style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "1.5px solid #e3e7f0", textAlign: "left" }}>
                          {[
                            "Fecha",
                            "Usuario",
                            "Nombre",
                            "Estado",
                            "Enlace por WhatsApp",
                            "Atendida",
                          ].map((t) => (
                            <th key={t} style={{ padding: "0.4rem 0.5rem", whiteSpace: "nowrap" }}>
                              {t}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {registro.map((s) => {
                          const enlace = textoEnlace(s);
                          return (
                            <tr key={s.id} style={{ borderBottom: "1px solid #edf0f6" }}>
                              <td style={{ padding: "0.4rem 0.5rem", whiteSpace: "nowrap" }}>
                                {new Date(s.creadaEn).toLocaleString("es")}
                              </td>
                              <td style={{ padding: "0.4rem 0.5rem" }}>{s.usuarioIngresado}</td>
                              <td style={{ padding: "0.4rem 0.5rem" }}>
                                {s.nombre ?? (s.userId === null ? "— no existe —" : "—")}
                              </td>
                              <td
                                style={{
                                  padding: "0.4rem 0.5rem",
                                  fontWeight: 700,
                                  color: ESTADO_SOLICITUD[s.estado].color,
                                }}
                              >
                                {ESTADO_SOLICITUD[s.estado].texto}
                              </td>
                              <td style={{ padding: "0.4rem 0.5rem", color: enlace?.color }}>
                                {enlace?.texto ?? "—"}
                              </td>
                              <td style={{ padding: "0.4rem 0.5rem" }}>
                                {s.atendidaEn !== null
                                  ? `${new Date(s.atendidaEn).toLocaleString("es")} · ${
                                      s.resueltaPorEnlace ? "por el enlace" : (s.atendidaPor ?? "—")
                                    }`
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </SoloSi>
        </section>
      )}
    </main>
  );
}
