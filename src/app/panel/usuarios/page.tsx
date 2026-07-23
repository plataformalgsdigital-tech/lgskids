"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

interface Usuario {
  id: string;
  username: string;
  email: string | null;
  estado: string;
  ultimoLoginEn: string | null;
  persona: string | null;
  roles: { rol: string; pais: string | null }[];
}

interface Rol {
  code: string;
  nombre: string;
}

const PAISES = ["", "CL", "CO", "EC", "PE"];

const boton: CSSProperties = {
  padding: "0.4rem 0.9rem",
  borderRadius: "0.5rem",
  border: "1px solid #e3e7f0",
  background: "white",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [buscar, setBuscar] = useState("");
  const [asignando, setAsignando] = useState<string | null>(null); // userId
  const [rolElegido, setRolElegido] = useState("");
  const [paisElegido, setPaisElegido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async (q: string) => {
    const url =
      q === "" ? "/api/identity/users" : `/api/identity/users?buscar=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data: { usuarios: Usuario[] } = await res.json();
      setUsuarios(data.usuarios);
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargar("");
      const res = await fetch("/api/access/roles");
      if (res.ok) {
        const data: { roles: Rol[] } = await res.json();
        setRoles(data.roles);
      }
    }
    void inicial();
  }, [cargar]);

  async function asignar(userId: string) {
    if (rolElegido === "") return;
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await fetch("/api/access/user-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          roleCode: rolElegido,
          countryCode: paisElegido === "" ? null : paisElegido,
        }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo asignar el rol.");
        return;
      }
      setAviso("Rol asignado (queda auditado).");
      setAsignando(null);
      setRolElegido("");
      setPaisElegido("");
      await cargar(buscar);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem" }}>Usuarios, roles y permisos</h1>
      <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.5rem" }}>
        <input
          placeholder="Buscar por usuario, correo o nombre…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void cargar(buscar.trim());
          }}
          style={{
            flex: 1,
            padding: "0.5rem 0.7rem",
            borderRadius: "0.5rem",
            border: "1.5px solid #d8dce6",
            fontSize: "0.9rem",
          }}
        />
        <button style={boton} onClick={() => void cargar(buscar.trim())}>
          Buscar
        </button>
      </div>

      {aviso !== null && (
        <p
          style={{
            marginTop: "0.6rem",
            color: "#1b5e20",
            background: "#e8f5e9",
            padding: "0.5rem 0.8rem",
            borderRadius: "0.6rem",
          }}
        >
          {aviso}
        </p>
      )}
      {error !== null && (
        <p role="alert" style={{ marginTop: "0.6rem", color: "#c62828" }}>
          {error}
        </p>
      )}

      <section
        style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        {usuarios === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : (
          usuarios.map((u) => (
            <div
              key={u.id}
              style={{
                padding: "0.75rem 1rem",
                border: "1px solid #e3e7f0",
                borderRadius: "0.7rem",
                opacity: u.estado === "ACTIVO" ? 1 : 0.55,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <strong>{u.username}</strong>{" "}
                  <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                    {u.persona !== null && `· ${u.persona} `}
                    {u.email !== null && `· ${u.email} `}· {u.estado}
                    {u.ultimoLoginEn !== null &&
                      ` · último ingreso ${new Date(u.ultimoLoginEn).toLocaleString()}`}
                  </span>
                  <div
                    style={{
                      marginTop: "0.25rem",
                      display: "flex",
                      gap: "0.3rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {u.roles.length === 0 ? (
                      <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                        sin roles
                      </span>
                    ) : (
                      u.roles.map((r, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "0.15rem 0.55rem",
                            borderRadius: "0.9rem",
                            background: r.rol === "superadmin" ? "#fce4ec" : "#e3f2fd",
                            color: r.rol === "superadmin" ? "#880e4f" : "#0d47a1",
                          }}
                        >
                          {r.rol}
                          {r.pais !== null ? ` (${r.pais})` : " (global)"}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <button
                  style={boton}
                  onClick={() => {
                    setAsignando(asignando === u.id ? null : u.id);
                    setRolElegido("");
                    setPaisElegido("");
                  }}
                >
                  ➕ Asignar rol
                </button>
              </div>
              {asignando === u.id && (
                <div
                  style={{
                    marginTop: "0.6rem",
                    display: "flex",
                    gap: "0.4rem",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <select
                    value={rolElegido}
                    onChange={(e) => setRolElegido(e.target.value)}
                    style={{
                      padding: "0.4rem",
                      borderRadius: "0.5rem",
                      border: "1.5px solid #d8dce6",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="">— Rol —</option>
                    {roles.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                  <select
                    value={paisElegido}
                    onChange={(e) => setPaisElegido(e.target.value)}
                    style={{
                      padding: "0.4rem",
                      borderRadius: "0.5rem",
                      border: "1.5px solid #d8dce6",
                      fontSize: "0.85rem",
                    }}
                  >
                    {PAISES.map((p) => (
                      <option key={p} value={p}>
                        {p === "" ? "Global (todos los países)" : p}
                      </option>
                    ))}
                  </select>
                  <button
                    style={{ ...boton, borderColor: "var(--lgs-verde)" }}
                    disabled={ocupado || rolElegido === ""}
                    onClick={() => void asignar(u.id)}
                  >
                    Confirmar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
