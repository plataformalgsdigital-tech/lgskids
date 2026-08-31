"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Fichas de los guías: datos de contacto y su sala de Zoom.
 *
 * Replica el alta de MOSAICO (/nuevo-guia) con una diferencia: la CUENTA se
 * crea en Usuarios y roles (usuario + rol con alcance por país) y aquí se
 * completa su ficha. No hay dos identidades para la misma persona.
 */

interface Ficha {
  guiaUserId: string;
  username: string;
  nombres: string | null;
  apellidos: string | null;
  docNumero: string | null;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  domicilio: string | null;
  fechaNacimiento: string | null;
  zoomUrl: string | null;
}

interface Enlace {
  guiaUserId: string;
  estado: "VIGENTE" | "USADA" | "REVOCADA" | "VENCIDA";
  expiraEn: string;
  usadoEn: string | null;
}

const PAISES = ["CL", "CO", "EC", "PE"];

const COLOR_ENLACE: Record<Enlace["estado"], { bg: string; c: string; txt: string }> = {
  VIGENTE: { bg: "#e8f5e9", c: "#1b5e20", txt: "Enlace enviado" },
  USADA: { bg: "#e3f2fd", c: "#0d47a1", txt: "Se registró" },
  VENCIDA: { bg: "#fff3e0", c: "#e65100", txt: "Enlace vencido" },
  REVOCADA: { bg: "#eceff1", c: "#455a64", txt: "Enlace revocado" },
};

const campo: CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  fontFamily: "inherit",
};
const rotulo: CSSProperties = {
  display: "block",
  fontSize: "0.76rem",
  fontWeight: 700,
  marginBottom: "0.15rem",
};
const tarjeta: CSSProperties = {
  background: "white",
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1rem 1.1rem",
};

const VACIA = {
  nombres: "",
  apellidos: "",
  docNumero: "",
  email: "",
  telefono: "",
  pais: "",
  domicilio: "",
  fechaNacimiento: "",
  zoomUrl: "",
};

export default function GuiasPage() {
  const [guias, setGuias] = useState<Ficha[] | null>(null);
  const [enlaces, setEnlaces] = useState<Record<string, Enlace>>({});
  const [enlaceNuevo, setEnlaceNuevo] = useState<string | null>(null);
  const [diasVigencia, setDiasVigencia] = useState(7);
  const [copiado, setCopiado] = useState(false);
  const [sel, setSel] = useState<Ficha | null>(null);
  const [form, setForm] = useState({ ...VACIA });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await apiFetch("/api/scheduling/guias");
    if (!res.ok) {
      setError("No se pudo cargar la lista de guías.");
      return;
    }
    const data = (await res.json()) as {
      guias: Ficha[];
      enlaces: Enlace[];
      diasVigencia: number;
    };
    setGuias(data.guias);
    setEnlaces(Object.fromEntries(data.enlaces.map((e) => [e.guiaUserId, e])));
    setDiasVigencia(data.diasVigencia);
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  function abrir(g: Ficha) {
    setSel(g);
    setAviso(null);
    setError(null);
    // El enlace se muestra UNA vez, al emitirlo: después solo queda su hash.
    setEnlaceNuevo(null);
    setCopiado(false);
    setForm({
      nombres: g.nombres ?? "",
      apellidos: g.apellidos ?? "",
      docNumero: g.docNumero ?? "",
      email: g.email ?? "",
      telefono: g.telefono ?? "",
      pais: g.pais ?? "",
      domicilio: g.domicilio ?? "",
      fechaNacimiento: g.fechaNacimiento ?? "",
      zoomUrl: g.zoomUrl ?? "",
    });
  }

  async function emitirEnlace() {
    if (sel === null) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    setCopiado(false);
    try {
      const res = await apiFetch("/api/scheduling/guias/invitacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guiaUserId: sel.guiaUserId }),
      });
      const c: { enlace?: string; error?: { message?: string } } = await res.json();
      if (!res.ok) {
        setError(c.error?.message ?? "No se pudo generar el enlace.");
        return;
      }
      setEnlaceNuevo(c.enlace ?? null);
      setAviso("Enlace generado. Cópialo y envíaselo al guía: no se vuelve a mostrar.");
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function revocarEnlace() {
    if (sel === null) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch("/api/scheduling/guias/invitacion", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guiaUserId: sel.guiaUserId }),
      });
      if (!res.ok) {
        setError("No se pudo revocar el enlace.");
        return;
      }
      setEnlaceNuevo(null);
      setAviso("Enlace revocado: ya no sirve.");
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    if (enlaceNuevo === null) return;
    await navigator.clipboard.writeText(enlaceNuevo);
    setCopiado(true);
  }

  async function guardar() {
    if (sel === null) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch("/api/scheduling/guias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guiaUserId: sel.guiaUserId, ...form }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo guardar la ficha.");
        return;
      }
      setAviso(`Ficha de ${sel.username} guardada.`);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  const estadoSel = sel === null ? undefined : enlaces[sel.guiaUserId];

  return (
    <main>
      <h1 style={{ fontSize: "1.6rem", marginBottom: "0.35rem" }}>Guías</h1>
      <p style={{ color: "var(--texto-suave)", marginBottom: "1.25rem" }}>
        Datos de contacto y sala de Zoom. La cuenta y los roles se crean en{" "}
        <strong>Usuarios y roles</strong>; aquí se completa la ficha.
      </p>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, marginBottom: "0.8rem" }}>
          {error}
        </p>
      )}
      {aviso !== null && (
        <p style={{ color: "#1b5e20", fontWeight: 600, marginBottom: "0.8rem" }}>{aviso}</p>
      )}

      <div
        style={{ display: "grid", gridTemplateColumns: "18rem 1fr", gap: "1rem" }}
        className="guias-dos"
      >
        <section style={{ ...tarjeta, padding: "0.6rem" }}>
          {guias === null ? (
            <p style={{ color: "var(--texto-suave)", padding: "0.5rem" }}>Cargando…</p>
          ) : guias.length === 0 ? (
            <p style={{ color: "var(--texto-suave)", padding: "0.5rem" }}>
              No hay guías activos. Créalos en Usuarios y roles con el rol <strong>guia</strong>.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {guias.map((g) => (
                <button
                  key={g.guiaUserId}
                  type="button"
                  onClick={() => abrir(g)}
                  style={{
                    textAlign: "left",
                    border: "none",
                    borderRadius: "0.5rem",
                    padding: "0.6rem 0.7rem",
                    cursor: "pointer",
                    background: sel?.guiaUserId === g.guiaUserId ? "#eef2ff" : "transparent",
                    font: "inherit",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {g.nombres !== null && g.apellidos !== null
                      ? `${g.nombres} ${g.apellidos}`
                      : g.username}
                  </span>
                  <span
                    style={{ display: "block", fontSize: "0.74rem", color: "var(--texto-suave)" }}
                  >
                    {g.username}
                    {g.zoomUrl === null || g.zoomUrl === "" ? " · sin Zoom" : ` · ${g.pais ?? "—"}`}
                  </span>
                  {enlaces[g.guiaUserId] !== undefined && (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: "0.25rem",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        padding: "0.1rem 0.45rem",
                        borderRadius: "1rem",
                        background: COLOR_ENLACE[enlaces[g.guiaUserId]!.estado].bg,
                        color: COLOR_ENLACE[enlaces[g.guiaUserId]!.estado].c,
                      }}
                    >
                      {COLOR_ENLACE[enlaces[g.guiaUserId]!.estado].txt}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        <section style={tarjeta}>
          {sel === null ? (
            <p style={{ color: "var(--texto-suave)" }}>Elige un guía para ver y editar su ficha.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800 }}>{sel.username}</h2>

              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}
                className="guias-dos"
              >
                <div>
                  <label style={rotulo} htmlFor="g-nom">
                    Nombres
                  </label>
                  <input
                    id="g-nom"
                    value={form.nombres}
                    onChange={(e) => setForm({ ...form, nombres: e.target.value })}
                    style={campo}
                  />
                </div>
                <div>
                  <label style={rotulo} htmlFor="g-ape">
                    Apellidos
                  </label>
                  <input
                    id="g-ape"
                    value={form.apellidos}
                    onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
                    style={campo}
                  />
                </div>
                <div>
                  <label style={rotulo} htmlFor="g-doc">
                    Documento
                  </label>
                  <input
                    id="g-doc"
                    value={form.docNumero}
                    onChange={(e) => setForm({ ...form, docNumero: e.target.value })}
                    style={campo}
                  />
                </div>
                <div>
                  <label style={rotulo} htmlFor="g-nac">
                    Fecha de nacimiento
                  </label>
                  <input
                    id="g-nac"
                    type="date"
                    value={form.fechaNacimiento}
                    onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
                    style={campo}
                  />
                </div>
                <div>
                  <label style={rotulo} htmlFor="g-mail">
                    Correo
                  </label>
                  <input
                    id="g-mail"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    style={campo}
                  />
                </div>
                <div>
                  <label style={rotulo} htmlFor="g-tel">
                    Teléfono
                  </label>
                  <input
                    id="g-tel"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                    style={campo}
                  />
                </div>
                <div>
                  <label style={rotulo} htmlFor="g-pais">
                    País
                  </label>
                  <select
                    id="g-pais"
                    value={form.pais}
                    onChange={(e) => setForm({ ...form, pais: e.target.value })}
                    style={campo}
                  >
                    <option value="">Sin país</option>
                    {PAISES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={rotulo} htmlFor="g-dom">
                    Domicilio
                  </label>
                  <input
                    id="g-dom"
                    value={form.domicilio}
                    onChange={(e) => setForm({ ...form, domicilio: e.target.value })}
                    style={campo}
                  />
                </div>
              </div>

              <div>
                <label style={rotulo} htmlFor="g-zoom">
                  Sala de Zoom
                </label>
                <input
                  id="g-zoom"
                  value={form.zoomUrl}
                  onChange={(e) => setForm({ ...form, zoomUrl: e.target.value })}
                  placeholder="https://zoom.us/j/NÚMERO"
                  style={campo}
                />
                <p
                  style={{ fontSize: "0.75rem", color: "var(--texto-suave)", marginTop: "0.2rem" }}
                >
                  Debe ser el enlace de la <strong>sala</strong>, no el de chat o contacto: ese
                  último le abre al alumno “Enviar solicitud de contacto” en vez de la clase. El
                  enlace de anfitrión (<code>/s/</code>) se convierte solo. Dos guías no pueden
                  compartir sala.
                </p>
              </div>

              <section
                style={{
                  border: "1px dashed #cfd6e6",
                  borderRadius: "0.7rem",
                  padding: "0.8rem 0.9rem",
                  background: "#fbfcff",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <strong style={{ fontSize: "0.9rem" }}>🔗 Enlace de registro</strong>
                  <p
                    style={{
                      fontSize: "0.76rem",
                      color: "var(--texto-suave)",
                      marginTop: "0.15rem",
                    }}
                  >
                    En vez de llenarle la ficha, envíale este enlace y él mismo carga sus datos, su
                    sala de Zoom y su foto. Sirve <strong>una sola vez</strong> y vence a los{" "}
                    {diasVigencia} días.
                  </p>
                </div>

                {estadoSel !== undefined && (
                  <p style={{ fontSize: "0.78rem" }}>
                    Último enlace:{" "}
                    <strong style={{ color: COLOR_ENLACE[estadoSel.estado].c }}>
                      {COLOR_ENLACE[estadoSel.estado].txt}
                    </strong>
                    {estadoSel.estado === "USADA" && estadoSel.usadoEn !== null
                      ? ` el ${new Date(estadoSel.usadoEn).toLocaleDateString("es-CL")}`
                      : estadoSel.estado === "VIGENTE"
                        ? ` · vence el ${new Date(estadoSel.expiraEn).toLocaleDateString("es-CL")}`
                        : ""}
                  </p>
                )}

                {enlaceNuevo !== null && (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.4rem",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <input
                      readOnly
                      value={enlaceNuevo}
                      onFocus={(e) => e.currentTarget.select()}
                      style={{
                        ...campo,
                        flex: 1,
                        minWidth: "14rem",
                        fontSize: "0.78rem",
                        background: "white",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void copiar()}
                      style={{
                        padding: "0.5rem 0.9rem",
                        borderRadius: "0.5rem",
                        border: "none",
                        background: copiado ? "var(--lgs-verde)" : "var(--lgs-azul)",
                        color: "white",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: "0.82rem",
                      }}
                    >
                      {copiado ? "✓ Copiado" : "Copiar"}
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void emitirEnlace()}
                    disabled={ocupado}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: "0.5rem",
                      border: "1.5px solid var(--lgs-azul)",
                      background: "white",
                      color: "var(--lgs-azul-oscuro)",
                      fontWeight: 700,
                      cursor: ocupado ? "wait" : "pointer",
                      fontSize: "0.82rem",
                    }}
                  >
                    {estadoSel?.estado === "VIGENTE" ? "↻ Generar uno nuevo" : "🔗 Generar enlace"}
                  </button>
                  {estadoSel?.estado === "VIGENTE" && (
                    <button
                      type="button"
                      onClick={() => void revocarEnlace()}
                      disabled={ocupado}
                      style={{
                        padding: "0.5rem 1rem",
                        borderRadius: "0.5rem",
                        border: "1.5px solid #e0e4ee",
                        background: "white",
                        color: "#8a2020",
                        fontWeight: 700,
                        cursor: ocupado ? "wait" : "pointer",
                        fontSize: "0.82rem",
                      }}
                    >
                      Revocar
                    </button>
                  )}
                </div>
              </section>

              <button
                type="button"
                onClick={() => void guardar()}
                disabled={ocupado}
                style={{
                  alignSelf: "flex-start",
                  padding: "0.6rem 1.2rem",
                  borderRadius: "0.6rem",
                  border: "none",
                  background: "var(--lgs-azul)",
                  color: "white",
                  fontWeight: 700,
                  cursor: ocupado ? "wait" : "pointer",
                }}
              >
                {ocupado ? "Guardando…" : "💾 Guardar ficha"}
              </button>
            </div>
          )}
        </section>
      </div>

      <style>{`@media (max-width: 860px) { .guias-dos { grid-template-columns: 1fr !important; } }`}</style>
    </main>
  );
}
