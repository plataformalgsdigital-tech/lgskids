"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Persona {
  id: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string | null;
  docTipo: string;
  docNumero: string;
  countryCode: string;
  email: string | null;
  telefono: string | null;
  estado: "ACTIVA" | "INACTIVA";
  userId: string | null;
  apoderados: { id: string; nombres: string; apellidos: string }[];
}

const PAISES = ["CL", "CO", "EC", "PE"];

const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

function Campo(props: { etiqueta: string; children: React.ReactNode; ancho?: string }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.2rem",
        flex: props.ancho ?? "1 1 10rem",
      }}
    >
      <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{props.etiqueta}</span>
      {props.children}
    </label>
  );
}

interface DatosPersona {
  nombres: string;
  apellidos: string;
  docTipo: string;
  docNumero: string;
  fechaNacimiento: string;
  email: string;
  telefono: string;
}

const personaVacia: DatosPersona = {
  nombres: "",
  apellidos: "",
  docTipo: "",
  docNumero: "",
  fechaNacimiento: "",
  email: "",
  telefono: "",
};

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [buscar, setBuscar] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [pais, setPais] = useState("CL");
  const [nino, setNino] = useState<DatosPersona>(personaVacia);
  const [apoderado, setApoderado] = useState<DatosPersona>(personaVacia);
  const [parentesco, setParentesco] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (q: string) => {
    const url = q === "" ? "/api/people" : `/api/people?buscar=${encodeURIComponent(q)}`;
    const res = await apiFetch(url);
    if (res.ok) {
      const data: { personas: Persona[] } = await res.json();
      setPersonas(data.personas);
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      // El buscador global puede llegar con ?buscar=<documento>.
      const q = new URLSearchParams(window.location.search).get("buscar") ?? "";
      await cargar(q);
      if (q !== "") setBuscar(q);
    }
    void inicial();
  }, [cargar]);

  async function crear(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setExito(null);
    setGuardando(true);
    try {
      const res = await apiFetch("/api/people/ninos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nino: {
            nombres: nino.nombres,
            apellidos: nino.apellidos,
            docTipo: nino.docTipo,
            docNumero: nino.docNumero,
            fechaNacimiento: nino.fechaNacimiento,
            countryCode: pais,
          },
          apoderadoNuevo: {
            nombres: apoderado.nombres,
            apellidos: apoderado.apellidos,
            docTipo: apoderado.docTipo,
            docNumero: apoderado.docNumero,
            countryCode: pais,
            email: apoderado.email || null,
            telefono: apoderado.telefono || null,
          },
          parentesco: parentesco || null,
        }),
      });
      const data: { error?: { message: string; details?: unknown } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo crear.");
        return;
      }
      setExito(`Niño ${nino.nombres} ${nino.apellidos} creado con su apoderado.`);
      setNino(personaVacia);
      setApoderado(personaVacia);
      setParentesco("");
      setMostrarForm(false);
      await cargar("");
    } catch {
      setError("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.6rem" }}>Personas</h1>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          style={{
            padding: "0.55rem 1.2rem",
            borderRadius: "0.6rem",
            border: "none",
            background: "var(--lgs-azul)",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {mostrarForm ? "Cancelar" : "+ Niño y apoderado"}
        </button>
      </div>

      {exito !== null && (
        <p
          style={{
            marginTop: "0.75rem",
            color: "#1b5e20",
            background: "#e8f5e9",
            padding: "0.6rem 0.9rem",
            borderRadius: "0.6rem",
          }}
        >
          {exito}
        </p>
      )}

      {mostrarForm && (
        <form
          onSubmit={crear}
          style={{
            marginTop: "1rem",
            padding: "1.25rem",
            border: "1px solid #e3e7f0",
            borderRadius: "0.9rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <Campo etiqueta="País del contrato/personas" ancho="0 0 8rem">
            <select value={pais} onChange={(e) => setPais(e.target.value)} style={inputStyle}>
              {PAISES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Campo>

          <fieldset
            style={{ border: "1px dashed #cfd6e4", borderRadius: "0.7rem", padding: "0.9rem" }}
          >
            <legend style={{ fontWeight: 700, fontSize: "0.9rem", padding: "0 0.4rem" }}>
              👧 Niño
            </legend>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <Campo etiqueta="Nombres">
                <input
                  required
                  minLength={2}
                  value={nino.nombres}
                  onChange={(e) => setNino({ ...nino, nombres: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
              <Campo etiqueta="Apellidos">
                <input
                  required
                  minLength={2}
                  value={nino.apellidos}
                  onChange={(e) => setNino({ ...nino, apellidos: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
              <Campo etiqueta="Fecha de nacimiento" ancho="0 0 10rem">
                <input
                  type="date"
                  required
                  value={nino.fechaNacimiento}
                  onChange={(e) => setNino({ ...nino, fechaNacimiento: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
              <Campo etiqueta="Tipo doc." ancho="0 0 7rem">
                <input
                  required
                  placeholder="TI / RUT / DNI"
                  value={nino.docTipo}
                  onChange={(e) => setNino({ ...nino, docTipo: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
              <Campo etiqueta="Número doc." ancho="0 0 10rem">
                <input
                  required
                  value={nino.docNumero}
                  onChange={(e) => setNino({ ...nino, docNumero: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
            </div>
          </fieldset>

          <fieldset
            style={{ border: "1px dashed #cfd6e4", borderRadius: "0.7rem", padding: "0.9rem" }}
          >
            <legend style={{ fontWeight: 700, fontSize: "0.9rem", padding: "0 0.4rem" }}>
              🧑 Apoderado (sus datos de contacto reciben las comunicaciones)
            </legend>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <Campo etiqueta="Nombres">
                <input
                  required
                  minLength={2}
                  value={apoderado.nombres}
                  onChange={(e) => setApoderado({ ...apoderado, nombres: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
              <Campo etiqueta="Apellidos">
                <input
                  required
                  minLength={2}
                  value={apoderado.apellidos}
                  onChange={(e) => setApoderado({ ...apoderado, apellidos: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
              <Campo etiqueta="Tipo doc." ancho="0 0 7rem">
                <input
                  required
                  placeholder="CC / RUT / DNI"
                  value={apoderado.docTipo}
                  onChange={(e) => setApoderado({ ...apoderado, docTipo: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
              <Campo etiqueta="Número doc." ancho="0 0 10rem">
                <input
                  required
                  value={apoderado.docNumero}
                  onChange={(e) => setApoderado({ ...apoderado, docNumero: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
              <Campo etiqueta="Email real" ancho="0 0 14rem">
                <input
                  type="email"
                  value={apoderado.email}
                  onChange={(e) => setApoderado({ ...apoderado, email: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
              <Campo etiqueta="WhatsApp" ancho="0 0 10rem">
                <input
                  value={apoderado.telefono}
                  onChange={(e) => setApoderado({ ...apoderado, telefono: e.target.value })}
                  style={inputStyle}
                />
              </Campo>
              <Campo etiqueta="Parentesco" ancho="0 0 8rem">
                <input
                  placeholder="madre / padre"
                  value={parentesco}
                  onChange={(e) => setParentesco(e.target.value)}
                  style={inputStyle}
                />
              </Campo>
            </div>
          </fieldset>

          {error !== null && (
            <p role="alert" style={{ color: "#c62828", fontSize: "0.9rem" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={guardando}
            style={{
              alignSelf: "flex-start",
              padding: "0.65rem 1.5rem",
              borderRadius: "0.7rem",
              border: "none",
              background: guardando ? "#9e9e9e" : "var(--lgs-verde)",
              color: "#1b2a10",
              fontWeight: 700,
              cursor: guardando ? "wait" : "pointer",
            }}
          >
            {guardando ? "Guardando…" : "Crear niño + apoderado"}
          </button>
        </form>
      )}

      <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem" }}>
        <input
          placeholder="Buscar por nombre o documento…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void cargar(buscar);
          }}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={() => void cargar(buscar)}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "1px solid #e3e7f0",
            background: "white",
            cursor: "pointer",
          }}
        >
          Buscar
        </button>
      </div>

      <section
        style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        {personas === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : personas.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>Sin personas registradas todavía.</p>
        ) : (
          personas.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 1rem",
                border: "1px solid #e3e7f0",
                borderRadius: "0.7rem",
                opacity: p.estado === "INACTIVA" ? 0.55 : 1,
              }}
            >
              <div>
                <strong>
                  {p.apellidos}, {p.nombres}
                </strong>{" "}
                <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  {p.docTipo} {p.docNumero} · {p.countryCode}
                  {p.fechaNacimiento !== null && ` · nac. ${p.fechaNacimiento}`}
                </span>
                {p.apoderados.length > 0 && (
                  <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                    Apoderado: {p.apoderados.map((a) => `${a.nombres} ${a.apellidos}`).join(", ")}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                {p.userId !== null && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      background: "#e3f2fd",
                      color: "#0d47a1",
                      padding: "0.2rem 0.55rem",
                      borderRadius: "1rem",
                      fontWeight: 700,
                    }}
                  >
                    con login
                  </span>
                )}
                <span
                  style={{
                    fontSize: "0.75rem",
                    background: p.estado === "ACTIVA" ? "#e8f5e9" : "#eceff1",
                    color: p.estado === "ACTIVA" ? "#1b5e20" : "#5a6172",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "1rem",
                    fontWeight: 700,
                  }}
                >
                  {p.estado}
                </span>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
