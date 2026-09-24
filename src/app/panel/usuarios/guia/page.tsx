"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch } from "@/ui/api-fetch";
import {
  Aviso,
  CajaCredenciales,
  Campo,
  Encabezado,
  PAISES,
  VolverGestion,
  boton,
  botonPrimario,
  input,
  mensajeDeError,
  rejilla,
  tarjeta,
} from "../comunes";

const VACIO = {
  nombres: "",
  apellidos: "",
  email: "",
  docNumero: "",
  zoomUrl: "",
  telefono: "",
  pais: "",
  fechaNacimiento: "",
  domicilio: "",
};

const FOTO_TIPOS = "image/jpeg,image/png,image/webp";

interface Creado {
  username: string;
  passwordInicial: string;
  enlace: string | null;
  enlaceExpira: string | null;
}

/** El enlace ABIERTO: una URL fija con la que cada guía crea su cuenta. */
interface RegistroAbierto {
  activo: boolean;
  codigo: string;
  enlace: string;
}

export default function AltaGuiaPage() {
  const [datos, setDatos] = useState(VACIO);
  const [foto, setFoto] = useState<File | null>(null);
  const previo = useMemo(() => (foto === null ? null : URL.createObjectURL(foto)), [foto]);
  // Con enlace, el guía completa su propia ficha (foto y Zoom incluidos) en
  // /nuevo-guia; aquí basta nombre, apellido y correo.
  const [conEnlace, setConEnlace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [creado, setCreado] = useState<Creado | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [abierto, setAbierto] = useState<RegistroAbierto | null>(null);
  const [guardandoAbierto, setGuardandoAbierto] = useState(false);
  const [copiadoAbierto, setCopiadoAbierto] = useState(false);

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch("/api/scheduling/guias/registro-abierto");
      if (res.ok) setAbierto((await res.json()) as RegistroAbierto);
    }
    void cargar();
  }, []);

  /** Prende/apaga el enlace abierto o cambia su clave. */
  async function guardarAbierto(cambios: Partial<RegistroAbierto>) {
    if (abierto === null) return;
    const siguiente = { ...abierto, ...cambios };
    setGuardandoAbierto(true);
    setError(null);
    try {
      const res = await apiFetch("/api/scheduling/guias/registro-abierto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: siguiente.activo, codigo: siguiente.codigo }),
      });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo guardar el enlace abierto."));
        return;
      }
      setAbierto((await res.json()) as RegistroAbierto);
    } finally {
      setGuardandoAbierto(false);
    }
  }

  // La URL del previo es del navegador: se suelta al cambiar de foto o salir.
  useEffect(() => {
    if (previo === null) return;
    return () => URL.revokeObjectURL(previo);
  }, [previo]);

  const cambiar = (campo: keyof typeof VACIO) => (valor: string) =>
    setDatos((d) => ({ ...d, [campo]: valor }));

  async function crear(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!conEnlace && foto === null) {
      setError("La foto de perfil es obligatoria (o marca que el guía complete su ficha).");
      return;
    }
    const form = new FormData();
    for (const [k, v] of Object.entries(datos)) form.append(k, v);
    form.append("enviarEnlace", conEnlace ? "si" : "no");
    if (foto !== null) form.append("foto", foto);

    setOcupado(true);
    try {
      const res = await apiFetch("/api/scheduling/guias/alta", { method: "POST", body: form });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo crear el guía."));
        return;
      }
      setCreado((await res.json()) as Creado);
      setCopiado(false);
      setDatos(VACIO);
      setFoto(null);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function copiarEnlace(enlace: string) {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "56rem", margin: "0 auto" }}>
      <VolverGestion />
      <Encabezado
        tipo="guia"
        titulo="Nuevo guía"
        descripcion="Crea la cuenta del guía y su ficha. Requiere foto de perfil, salvo que la complete él por enlace."
      />

      {creado !== null && (
        <div style={{ marginBottom: "1rem" }}>
          <CajaCredenciales
            titulo="✅ Guía creado"
            username={creado.username}
            clave={creado.passwordInicial}
            onCerrar={() => setCreado(null)}
          >
            {creado.enlace !== null && (
              <div
                style={{
                  marginTop: "0.7rem",
                  padding: "0.7rem 0.8rem",
                  background: "white",
                  borderRadius: "0.6rem",
                  border: "1px solid #c8e6c9",
                }}
              >
                <strong style={{ fontSize: "0.88rem" }}>
                  Enlace para que complete su ficha (un solo uso
                  {creado.enlaceExpira !== null &&
                    `, vence el ${new Date(creado.enlaceExpira).toLocaleDateString("es")}`}
                  ):
                </strong>
                <div
                  style={{
                    marginTop: "0.35rem",
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <code style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                    {creado.enlace}
                  </code>
                  <button
                    type="button"
                    style={boton}
                    onClick={() => void copiarEnlace(creado.enlace ?? "")}
                  >
                    {copiado ? "✓ Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            )}
          </CajaCredenciales>
        </div>
      )}

      {abierto !== null && (
        <section style={{ ...tarjeta, marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 800, marginBottom: "0.2rem" }}>
            🔗 Enlace abierto de registro
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)", marginBottom: "0.8rem" }}>
            Una sola URL para repartir: quien la abra crea su propia cuenta de guía. Déjala prendida
            solo mientras estés reclutando, y dicta la clave por otro medio (WhatsApp, teléfono), no
            junto al enlace.
          </p>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontWeight: 700,
              fontSize: "0.9rem",
            }}
          >
            <input
              type="checkbox"
              checked={abierto.activo}
              disabled={guardandoAbierto}
              onChange={(e) => void guardarAbierto({ activo: e.target.checked })}
            />
            {abierto.activo ? "Abierto: cualquiera con el enlace puede registrarse" : "Cerrado"}
          </label>

          <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.82rem", fontWeight: 700 }}>
              Clave compartida (déjala vacía para no pedir ninguna)
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input
                value={abierto.codigo}
                onChange={(e) => setAbierto({ ...abierto, codigo: e.target.value })}
                placeholder="mínimo 6 caracteres"
                style={{ ...input, maxWidth: "16rem" }}
              />
              <button
                type="button"
                style={boton}
                disabled={guardandoAbierto}
                onClick={() => void guardarAbierto({})}
              >
                Guardar clave
              </button>
            </div>
          </div>

          {abierto.activo && (
            <div
              style={{
                marginTop: "0.8rem",
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <code style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>{abierto.enlace}</code>
              <button
                type="button"
                style={boton}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(abierto.enlace)
                    .then(() => setCopiadoAbierto(true))
                    .catch(() => setCopiadoAbierto(false));
                }}
              >
                {copiadoAbierto ? "✓ Copiado" : "Copiar enlace"}
              </button>
            </div>
          )}
        </section>
      )}

      <form onSubmit={crear} style={tarjeta}>
        <label
          style={{
            display: "flex",
            gap: "0.55rem",
            alignItems: "flex-start",
            padding: "0.7rem 0.85rem",
            borderRadius: "0.7rem",
            background: conEnlace ? "#e0f5ec" : "#f7f8fb",
            border: "1px solid #e3e7f0",
            marginBottom: "1.2rem",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          <input
            type="checkbox"
            checked={conEnlace}
            onChange={(e) => setConEnlace(e.target.checked)}
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            <strong>Que el guía complete su ficha por enlace</strong>
            <span style={{ display: "block", color: "var(--texto-suave)", fontSize: "0.82rem" }}>
              Basta nombre, apellido y correo: se crea la cuenta y te damos un enlace de un solo uso
              para que él cargue su foto, documento, contacto y sala de Zoom.
            </span>
          </span>
        </label>

        {!conEnlace && (
          <div
            style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.3rem" }}
          >
            <span
              aria-hidden
              style={{
                width: "5.5rem",
                height: "5.5rem",
                borderRadius: "50%",
                border: "2px dashed #cfd5e3",
                background: previo !== null ? `center / cover no-repeat url(${previo})` : "#fafbfe",
                display: "grid",
                placeItems: "center",
                fontSize: "1.8rem",
                color: "#b0b8c9",
                flexShrink: 0,
              }}
            >
              {previo === null && "👤"}
            </span>
            <div>
              <label
                style={{
                  ...boton,
                  display: "inline-block",
                  background: "#e0f5ec",
                  borderColor: "#a8dcc4",
                  color: "#1b6b47",
                }}
              >
                {foto === null ? "Subir foto *" : "Cambiar foto"}
                <input
                  type="file"
                  accept={FOTO_TIPOS}
                  style={{ display: "none" }}
                  onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                />
              </label>
              <p
                style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--texto-suave)" }}
              >
                Obligatoria (JPG, PNG o WebP).
              </p>
            </div>
          </div>
        )}

        <div style={rejilla}>
          <Campo etiqueta="Primer nombre" obligatorio>
            <input
              required
              autoComplete="off"
              value={datos.nombres}
              onChange={(e) => cambiar("nombres")(e.target.value)}
              style={input}
            />
          </Campo>
          <Campo etiqueta="Primer apellido" obligatorio>
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
          {!conEnlace && (
            <>
              <Campo etiqueta="Número de identificación" obligatorio>
                <input
                  required
                  autoComplete="off"
                  value={datos.docNumero}
                  onChange={(e) => cambiar("docNumero")(e.target.value)}
                  style={input}
                />
              </Campo>
              <Campo etiqueta="Link de Zoom" ayuda="Su sala personal: https://zoom.us/j/NÚMERO">
                <input
                  autoComplete="off"
                  value={datos.zoomUrl}
                  onChange={(e) => cambiar("zoomUrl")(e.target.value)}
                  style={input}
                />
              </Campo>
              <Campo etiqueta="Teléfono">
                <input
                  autoComplete="off"
                  value={datos.telefono}
                  onChange={(e) => cambiar("telefono")(e.target.value)}
                  style={input}
                />
              </Campo>
              <Campo etiqueta="País">
                <select
                  value={datos.pais}
                  onChange={(e) => cambiar("pais")(e.target.value)}
                  style={input}
                >
                  <option value="">— Seleccione —</option>
                  {PAISES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Fecha de nacimiento">
                <input
                  type="date"
                  value={datos.fechaNacimiento}
                  onChange={(e) => cambiar("fechaNacimiento")(e.target.value)}
                  style={input}
                />
              </Campo>
              <Campo etiqueta="Domicilio" ancho>
                <input
                  autoComplete="off"
                  value={datos.domicilio}
                  onChange={(e) => cambiar("domicilio")(e.target.value)}
                  style={input}
                />
              </Campo>
            </>
          )}
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
            La clave se genera automáticamente y se muestra al crear. El guía queda con alcance en
            todos los países.
          </span>
          <button type="submit" disabled={ocupado} style={botonPrimario("#2e9d6a", ocupado)}>
            {ocupado ? "Creando…" : conEnlace ? "✓ Crear y generar enlace" : "✓ Crear guía"}
          </button>
        </div>
      </form>
    </main>
  );
}
