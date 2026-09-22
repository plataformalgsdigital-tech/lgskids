"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { Aviso, boton, input } from "./comunes";

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

/** Pestaña "Roles y permisos": crear roles y marcar sus permisos. */
export function RolesPermisos() {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [rolSeleccionado, setRolSeleccionado] = useState<string | null>(null);
  const [permisosRol, setPermisosRol] = useState<PermisosRol | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [mostrarNuevoRol, setMostrarNuevoRol] = useState(false);
  const [nuevoRolNombre, setNuevoRolNombre] = useState("");
  const [nuevoRolDescripcion, setNuevoRolDescripcion] = useState("");

  const cargarRoles = useCallback(async () => {
    const res = await apiFetch("/api/access/roles");
    if (res.ok) {
      const data: { roles: Rol[] } = await res.json();
      setRoles(data.roles);
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargarRoles();
    }
    void inicial();
  }, [cargarRoles]);

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

  return (
    <section style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
      {aviso !== null && <Aviso tipo="ok">{aviso}</Aviso>}
      {error !== null && <Aviso tipo="error">{error}</Aviso>}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 16rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
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
      </div>
    </section>
  );
}
