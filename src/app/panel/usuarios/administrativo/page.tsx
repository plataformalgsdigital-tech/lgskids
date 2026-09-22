"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/ui/api-fetch";
import {
  Aviso,
  CajaCredenciales,
  Campo,
  Encabezado,
  PAISES,
  VolverGestion,
  botonPrimario,
  input,
  mensajeDeError,
  rejilla,
  tarjeta,
} from "../comunes";

interface Rol {
  code: string;
  nombre: string;
  descripcion: string | null;
}

/** Estos tienen su propia puerta de alta, que además llena su ficha. */
const CON_ALTA_PROPIA = new Set(["alumno", "guia", "apoderado"]);

const VACIO = {
  roleCode: "",
  countryCode: "",
  nombres: "",
  apellidos: "",
  email: "",
  telefono: "",
  docNumero: "",
};

export default function AltaAdministrativoPage() {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [datos, setDatos] = useState(VACIO);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [creado, setCreado] = useState<{ username: string; passwordInicial: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const [resRoles, resMe] = await Promise.all([
        apiFetch("/api/access/roles"),
        apiFetch("/api/auth/me"),
      ]);
      if (!resRoles.ok || !vigente) return;
      const { roles: todos } = (await resRoles.json()) as { roles: Rol[] };
      const me = resMe.ok
        ? ((await resMe.json()) as { roles: { roleCode: string }[] })
        : { roles: [] };
      // La llave maestra solo la da otro superadmin: si no lo eres, ni se ofrece.
      const soySuper = me.roles.some((r) => r.roleCode === "superadmin");
      if (vigente) {
        setRoles(
          todos.filter(
            (r) => !CON_ALTA_PROPIA.has(r.code) && (r.code !== "superadmin" || soySuper),
          ),
        );
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  const cambiar = (campo: keyof typeof VACIO) => (valor: string) =>
    setDatos((d) => ({ ...d, [campo]: valor }));

  async function crear(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch("/api/identity/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleCode: datos.roleCode,
          countryCode: datos.countryCode || null,
          nombres: datos.nombres,
          apellidos: datos.apellidos,
          email: datos.email,
          telefono: datos.telefono || null,
          docNumero: datos.docNumero || null,
        }),
      });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo crear el usuario."));
        return;
      }
      setCreado((await res.json()) as { username: string; passwordInicial: string });
      setDatos(VACIO);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "56rem", margin: "0 auto" }}>
      <VolverGestion />
      <Encabezado
        tipo="administrativo"
        titulo="Nuevo administrativo"
        descripcion="Selecciona un rol de la matriz de permisos y captura los datos. La clave se genera sola."
      />

      {creado !== null && (
        <div style={{ marginBottom: "1rem" }}>
          <CajaCredenciales
            titulo="✅ Administrativo creado"
            username={creado.username}
            clave={creado.passwordInicial}
            onCerrar={() => setCreado(null)}
          />
        </div>
      )}

      <form onSubmit={crear} style={tarjeta}>
        <div style={rejilla}>
          <Campo etiqueta="Rol" obligatorio>
            <select
              required
              value={datos.roleCode}
              onChange={(e) => cambiar("roleCode")(e.target.value)}
              style={input}
            >
              <option value="">— Seleccione —</option>
              {roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Plataforma" ayuda="Países que verá. Global = todos.">
            <select
              value={datos.countryCode}
              onChange={(e) => cambiar("countryCode")(e.target.value)}
              style={input}
            >
              <option value="">— Global (todos los países) —</option>
              {PAISES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Nombre" obligatorio>
            <input
              required
              autoComplete="off"
              value={datos.nombres}
              onChange={(e) => cambiar("nombres")(e.target.value)}
              style={input}
            />
          </Campo>
          <Campo etiqueta="Apellido" obligatorio>
            <input
              required
              autoComplete="off"
              value={datos.apellidos}
              onChange={(e) => cambiar("apellidos")(e.target.value)}
              style={input}
            />
          </Campo>
          <Campo etiqueta="Correo" obligatorio>
            <input
              type="email"
              required
              autoComplete="off"
              placeholder="correo@dominio.com"
              value={datos.email}
              onChange={(e) => cambiar("email")(e.target.value)}
              style={input}
            />
          </Campo>
          <Campo etiqueta="Celular">
            <input
              autoComplete="off"
              value={datos.telefono}
              onChange={(e) => cambiar("telefono")(e.target.value)}
              style={input}
            />
          </Campo>
          <Campo etiqueta="Número de identificación">
            <input
              autoComplete="off"
              value={datos.docNumero}
              onChange={(e) => cambiar("docNumero")(e.target.value)}
              style={input}
            />
          </Campo>
        </div>

        {error !== null && (
          <div style={{ marginTop: "1rem" }}>
            <Aviso tipo="error">{error}</Aviso>
          </div>
        )}

        <div
          style={{
            marginTop: "1.2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
            El usuario (inicial + apellido + 4 dígitos) y la clave se generan solos y se muestran al
            crear.
          </span>
          <button type="submit" disabled={ocupado} style={botonPrimario("#1e88e5", ocupado)}>
            {ocupado ? "Creando…" : "✓ Crear administrativo"}
          </button>
        </div>
      </form>
    </main>
  );
}
