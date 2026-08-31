"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { apiFetch } from "@/ui/api-fetch";

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
  descripcion: string | null;
}

interface PermisosRol {
  rol: string;
  editable: boolean;
  catalogo: { code: string; nombre: string; asignado: boolean }[];
  secciones: { etiqueta: string; permiso: string; hijos: string[] }[];
}

interface Credenciales {
  username: string;
  passwordInicial: string;
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

const input: CSSProperties = {
  padding: "0.5rem 0.7rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

export default function UsuariosPage() {
  const [pestana, setPestana] = useState<"usuarios" | "roles">("usuarios");
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Asignar rol a usuario
  const [asignando, setAsignando] = useState<string | null>(null);
  const [rolElegido, setRolElegido] = useState("");
  const [paisElegido, setPaisElegido] = useState("");

  // Crear usuario
  const [mostrarNuevoUsuario, setMostrarNuevoUsuario] = useState(false);
  const [nuevoUsername, setNuevoUsername] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevoRol, setNuevoRol] = useState("");
  const [nuevoPais, setNuevoPais] = useState("");
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null);

  // Gestión de roles
  const [rolSeleccionado, setRolSeleccionado] = useState<string | null>(null);
  const [permisosRol, setPermisosRol] = useState<PermisosRol | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [mostrarNuevoRol, setMostrarNuevoRol] = useState(false);
  const [nuevoRolNombre, setNuevoRolNombre] = useState("");
  const [nuevoRolDescripcion, setNuevoRolDescripcion] = useState("");

  const cargarUsuarios = useCallback(async (q: string) => {
    const url =
      q === "" ? "/api/identity/users" : `/api/identity/users?buscar=${encodeURIComponent(q)}`;
    const res = await apiFetch(url);
    if (res.ok) {
      const data: { usuarios: Usuario[] } = await res.json();
      setUsuarios(data.usuarios);
    }
  }, []);

  const cargarRoles = useCallback(async () => {
    const res = await apiFetch("/api/access/roles");
    if (res.ok) {
      const data: { roles: Rol[] } = await res.json();
      setRoles(data.roles);
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargarUsuarios("");
      await cargarRoles();
    }
    void inicial();
  }, [cargarUsuarios, cargarRoles]);

  async function abrirRol(code: string) {
    setRolSeleccionado(code);
    setPermisosRol(null);
    const res = await apiFetch(`/api/access/roles/${code}/permissions`);
    if (res.ok) {
      const data = (await res.json()) as PermisosRol;
      setPermisosRol(data);
      setMarcados(new Set(data.catalogo.filter((p) => p.asignado).map((p) => p.code)));
    }
  }

  async function guardarPermisos() {
    if (rolSeleccionado === null) return;
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/access/roles/${rolSeleccionado}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permisos: [...marcados] }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudieron guardar los permisos.");
        return;
      }
      setAviso(`Permisos del rol '${rolSeleccionado}' actualizados (auditado).`);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function crearRolNuevo(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch("/api/access/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevoRolNombre, descripcion: nuevoRolDescripcion || null }),
      });
      const data: { code?: string; error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo crear el rol.");
        return;
      }
      setAviso(`Rol creado. Ahora marca sus permisos y guarda.`);
      setMostrarNuevoRol(false);
      setNuevoRolNombre("");
      setNuevoRolDescripcion("");
      await cargarRoles();
      if (data.code !== undefined) await abrirRol(data.code);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function crearUsuario(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch("/api/identity/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: nuevoUsername,
          email: nuevoEmail || null,
          roleCode: nuevoRol || null,
          countryCode: nuevoPais || null,
        }),
      });
      const data: {
        username?: string;
        passwordInicial?: string;
        error?: { message: string };
      } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo crear el usuario.");
        return;
      }
      setCredenciales({
        username: data.username ?? nuevoUsername,
        passwordInicial: data.passwordInicial ?? "",
      });
      setMostrarNuevoUsuario(false);
      setNuevoUsername("");
      setNuevoEmail("");
      setNuevoRol("");
      setNuevoPais("");
      await cargarUsuarios(buscar);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function asignar(userId: string) {
    if (rolElegido === "") return;
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch("/api/access/user-roles", {
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
      await cargarUsuarios(buscar);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
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

      {credenciales !== null && (
        <div
          style={{
            marginTop: "0.9rem",
            padding: "1rem 1.25rem",
            background: "#e8f5e9",
            border: "2px solid var(--lgs-verde)",
            borderRadius: "0.9rem",
          }}
        >
          <strong>✅ Usuario creado. Credenciales (se muestran UNA sola vez):</strong>
          <p style={{ marginTop: "0.4rem", fontFamily: "monospace", fontSize: "1.05rem" }}>
            Usuario: <strong>{credenciales.username}</strong> · Contraseña inicial:{" "}
            <strong>{credenciales.passwordInicial}</strong>
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
            Deberá cambiarla en su primer ingreso.
          </p>
          <button style={{ ...boton, marginTop: "0.4rem" }} onClick={() => setCredenciales(null)}>
            Entendido, cerrar
          </button>
        </div>
      )}
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

      {pestana === "usuarios" && (
        <section style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              placeholder="Buscar por usuario, correo o nombre…"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void cargarUsuarios(buscar.trim());
              }}
              style={{ ...input, flex: 1, minWidth: "14rem" }}
            />
            <button style={boton} onClick={() => void cargarUsuarios(buscar.trim())}>
              Buscar
            </button>
            <button
              style={{ ...boton, background: "var(--lgs-azul)", color: "white", border: "none" }}
              onClick={() => setMostrarNuevoUsuario((v) => !v)}
            >
              {mostrarNuevoUsuario ? "Cancelar" : "➕ Nuevo usuario"}
            </button>
          </div>

          {mostrarNuevoUsuario && (
            <form
              onSubmit={crearUsuario}
              style={{
                marginTop: "0.9rem",
                padding: "1rem",
                border: "1px solid #e3e7f0",
                borderRadius: "0.8rem",
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <input
                placeholder="usuario (ej. mcoordinadora)"
                required
                minLength={3}
                value={nuevoUsername}
                onChange={(e) => setNuevoUsername(e.target.value)}
                style={{ ...input, width: "13rem" }}
              />
              <input
                type="email"
                placeholder="correo (opcional)"
                value={nuevoEmail}
                onChange={(e) => setNuevoEmail(e.target.value)}
                style={{ ...input, width: "15rem" }}
              />
              <select value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} style={input}>
                <option value="">— Rol inicial (opcional) —</option>
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.nombre}
                  </option>
                ))}
              </select>
              <select
                value={nuevoPais}
                onChange={(e) => setNuevoPais(e.target.value)}
                style={input}
              >
                {PAISES.map((p) => (
                  <option key={p} value={p}>
                    {p === "" ? "Global" : p}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={ocupado}
                style={{ ...boton, borderColor: "var(--lgs-verde)" }}
              >
                Crear
              </button>
            </form>
          )}

          <div
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
                      }}
                    >
                      <select
                        value={rolElegido}
                        onChange={(e) => setRolElegido(e.target.value)}
                        style={input}
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
                        style={input}
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
          </div>
        </section>
      )}

      {pestana === "roles" && (
        <section style={{ marginTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div
            style={{ flex: "0 0 16rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}
          >
            <button
              style={{ ...boton, background: "var(--lgs-azul)", color: "white", border: "none" }}
              onClick={() => setMostrarNuevoRol((v) => !v)}
            >
              {mostrarNuevoRol ? "Cancelar" : "➕ Nuevo rol"}
            </button>
            {mostrarNuevoRol && (
              <form
                onSubmit={crearRolNuevo}
                style={{
                  padding: "0.8rem",
                  border: "1px solid #e3e7f0",
                  borderRadius: "0.7rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                <input
                  placeholder="Nombre (ej. Consulta)"
                  required
                  minLength={3}
                  value={nuevoRolNombre}
                  onChange={(e) => setNuevoRolNombre(e.target.value)}
                  style={input}
                />
                <input
                  placeholder="Descripción (opcional)"
                  value={nuevoRolDescripcion}
                  onChange={(e) => setNuevoRolDescripcion(e.target.value)}
                  style={input}
                />
                <button
                  type="submit"
                  disabled={ocupado}
                  style={{ ...boton, borderColor: "var(--lgs-verde)" }}
                >
                  Crear rol
                </button>
              </form>
            )}
            {roles.map((r) => (
              <button
                key={r.code}
                onClick={() => void abrirRol(r.code)}
                style={{
                  ...boton,
                  textAlign: "left",
                  background: rolSeleccionado === r.code ? "#e8f1fd" : "white",
                  borderColor: rolSeleccionado === r.code ? "var(--lgs-azul)" : "#e3e7f0",
                }}
              >
                <strong>{r.nombre}</strong>
                {r.descripcion !== null && (
                  <div style={{ fontSize: "0.72rem", color: "var(--texto-suave)" }}>
                    {r.descripcion}
                  </div>
                )}
              </button>
            ))}
          </div>

          <div style={{ flex: "1 1 24rem" }}>
            {permisosRol === null ? (
              <p style={{ color: "var(--texto-suave)" }}>
                {rolSeleccionado === null
                  ? "Selecciona un rol para ver y editar sus permisos."
                  : "Cargando permisos…"}
              </p>
            ) : (
              <div style={{ border: "1px solid #e3e7f0", borderRadius: "0.8rem", padding: "1rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <h2 style={{ fontSize: "1.05rem" }}>
                    Permisos del rol <strong>{permisosRol.rol}</strong>
                  </h2>
                  {permisosRol.editable ? (
                    <button
                      style={{
                        ...boton,
                        background: "var(--lgs-verde)",
                        color: "#1b2a10",
                        border: "none",
                      }}
                      disabled={ocupado}
                      onClick={() => void guardarPermisos()}
                    >
                      💾 Guardar permisos
                    </button>
                  ) : (
                    <span
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        color: "#880e4f",
                        background: "#fce4ec",
                        padding: "0.25rem 0.7rem",
                        borderRadius: "0.9rem",
                      }}
                    >
                      🔒 Llave maestra: siempre TODOS los permisos
                    </span>
                  )}
                </div>
                {(() => {
                  // Casilla reutilizable: el padre manda sobre la sección, los
                  // hijos sobre cada pantalla.
                  const casilla = (code: string, etiqueta: string, sangria: boolean) => {
                    const marcado = permisosRol.editable ? marcados.has(code) : true;
                    return (
                      <label
                        key={code}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          padding: sangria ? "0.35rem 0.6rem 0.35rem 2rem" : "0.5rem 0.6rem",
                          borderRadius: "0.45rem",
                          background: marcado ? "#e8f5e9" : "#fafbfe",
                          fontSize: "0.85rem",
                          fontWeight: sangria ? 400 : 700,
                          cursor: permisosRol.editable ? "pointer" : "default",
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={!permisosRol.editable}
                          checked={marcado}
                          onChange={(e) => {
                            setMarcados((prev) => {
                              const nuevo = new Set(prev);
                              if (e.target.checked) nuevo.add(code);
                              else nuevo.delete(code);
                              return nuevo;
                            });
                          }}
                        />
                        <span>
                          {etiqueta}
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.68rem",
                              color: "var(--texto-suave)",
                              fontWeight: 400,
                            }}
                          >
                            {code}
                          </span>
                        </span>
                      </label>
                    );
                  };

                  const nombreDe = (code: string) =>
                    permisosRol.catalogo.find((p) => p.code === code)?.nombre ?? code;
                  // Permisos que ya salen en el árbol: el resto va al final.
                  const enArbol = new Set(
                    permisosRol.secciones.flatMap((s) => [s.permiso, ...s.hijos]),
                  );
                  const sueltos = permisosRol.catalogo.filter((p) => !enArbol.has(p.code));

                  return (
                    <div
                      style={{
                        marginTop: "0.8rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.6rem",
                      }}
                    >
                      {permisosRol.secciones.map((s) => (
                        <div
                          key={s.permiso}
                          style={{
                            border: "1px solid #e3e7f0",
                            borderRadius: "0.6rem",
                            overflow: "hidden",
                          }}
                        >
                          {casilla(s.permiso, s.etiqueta, false)}
                          {s.hijos.length > 0 && (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                borderTop: "1px solid #e3e7f0",
                              }}
                            >
                              {[...new Set(s.hijos)].map((h) => casilla(h, nombreDe(h), true))}
                            </div>
                          )}
                        </div>
                      ))}

                      {sueltos.length > 0 && (
                        <div>
                          <p
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              letterSpacing: "0.06em",
                              color: "var(--texto-suave)",
                              margin: "0.4rem 0 0.4rem",
                            }}
                          >
                            OTROS PERMISOS (no salen en el menú)
                          </p>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
                              gap: "0.35rem",
                            }}
                          >
                            {sueltos.map((p) => casilla(p.code, p.nombre, false))}
                          </div>
                        </div>
                      )}

                      <p style={{ fontSize: "0.78rem", color: "var(--texto-suave)", margin: 0 }}>
                        Quitar la casilla de una sección apaga esa área entera del menú, aunque sus
                        pantallas sigan marcadas.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
