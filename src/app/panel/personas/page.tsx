"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Nino {
  id: string;
  nombres: string;
  apellidos: string;
  docTipo: string;
  docNumero: string;
  countryCode: string;
  fechaNacimiento: string | null;
  estado: "ACTIVA" | "INACTIVA";
  username: string | null;
  correo: string | null;
  contratoNumero: number | null;
  externalRef: string | null;
  tipoCurso: string | null;
  inicio: string | null;
  finalContrato: string | null;
  contratoEstado: string | null;
  campania: string | null;
  curso: string | null;
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
  const [ninos, setNinos] = useState<Nino[] | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [pais, setPais] = useState("CL");
  const [nino, setNino] = useState<DatosPersona>(personaVacia);
  const [apoderado, setApoderado] = useState<DatosPersona>(personaVacia);
  const [parentesco, setParentesco] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [campanias, setCampanias] = useState<{ id: string; nombre: string }[]>([]);
  // Filtros (el buscador global puede llegar con ?buscar=<documento>).
  const [fId, setFId] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("buscar") ?? "")
      : "",
  );
  const [fCampaniaId, setFCampaniaId] = useState("");
  const [fCurso, setFCurso] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fInicioDesde, setFInicioDesde] = useState("");
  const [fFinalHasta, setFFinalHasta] = useState("");

  const cargar = useCallback(async () => {
    const p = new URLSearchParams();
    if (fId) p.set("id", fId);
    if (fCampaniaId) p.set("campaignId", fCampaniaId);
    if (fCurso) p.set("tipoCurso", fCurso);
    if (fEstado) p.set("estado", fEstado);
    if (fInicioDesde) p.set("inicioDesde", fInicioDesde);
    if (fFinalHasta) p.set("finalHasta", fFinalHasta);
    const res = await apiFetch(`/api/people/ninos?${p.toString()}`);
    if (res.ok) {
      const data: { ninos: Nino[] } = await res.json();
      setNinos(data.ninos);
    }
  }, [fId, fCampaniaId, fCurso, fEstado, fInicioDesde, fFinalHasta]);

  useEffect(() => {
    async function run() {
      await cargar();
    }
    void run();
  }, [cargar]);

  useEffect(() => {
    async function cargarCampanias() {
      const res = await apiFetch("/api/catalog/campaigns");
      if (res.ok) {
        const data: { campanias: { id: string; nombre: string }[] } = await res.json();
        setCampanias(data.campanias);
      }
    }
    void cargarCampanias();
  }, []);

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
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.6rem" }}>Kids</h1>
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

      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.9rem 1rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          display: "flex",
          gap: "0.7rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <Campo etiqueta="Documento (id)" ancho="1 1 12rem">
          <input
            placeholder="Buscar por documento…"
            value={fId}
            onChange={(e) => setFId(e.target.value)}
            style={inputStyle}
          />
        </Campo>
        <Campo etiqueta="Campaña" ancho="1 1 12rem">
          <select
            value={fCampaniaId}
            onChange={(e) => setFCampaniaId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Todas</option>
            {campanias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Curso" ancho="0 0 10rem">
          <select value={fCurso} onChange={(e) => setFCurso(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            <option value="JUNIOR">Junior (6–9)</option>
            <option value="YOUNGSTER">Youngster (10–13)</option>
          </select>
        </Campo>
        <Campo etiqueta="Estado" ancho="0 0 8rem">
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            <option value="ACTIVA">Activa</option>
            <option value="INACTIVA">Inactiva</option>
          </select>
        </Campo>
        <Campo etiqueta="Inicio desde" ancho="0 0 9rem">
          <input
            type="date"
            value={fInicioDesde}
            onChange={(e) => setFInicioDesde(e.target.value)}
            style={inputStyle}
          />
        </Campo>
        <Campo etiqueta="Final hasta" ancho="0 0 9rem">
          <input
            type="date"
            value={fFinalHasta}
            onChange={(e) => setFFinalHasta(e.target.value)}
            style={inputStyle}
          />
        </Campo>
        {(fId || fCampaniaId || fCurso || fEstado || fInicioDesde || fFinalHasta) && (
          <button
            onClick={() => {
              setFId("");
              setFCampaniaId("");
              setFCurso("");
              setFEstado("");
              setFInicioDesde("");
              setFFinalHasta("");
            }}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #e3e7f0",
              background: "white",
              cursor: "pointer",
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      <section
        style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        {ninos === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : ninos.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>
            No hay niños que coincidan con los filtros.
          </p>
        ) : (
          ninos.map((n) => (
            <div
              key={n.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.8rem 1rem",
                border: "1px solid #e3e7f0",
                borderRadius: "0.7rem",
                flexWrap: "wrap",
                opacity: n.estado === "INACTIVA" ? 0.6 : 1,
              }}
            >
              <div style={{ minWidth: "18rem" }}>
                <strong style={{ fontSize: "1rem" }}>
                  {n.apellidos}, {n.nombres}
                </strong>{" "}
                <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  {n.docTipo} {n.docNumero} · {n.countryCode}
                  {n.fechaNacimiento !== null && ` · nac. ${n.fechaNacimiento}`}
                </span>
                <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  📧 {n.correo ?? "— sin correo —"}
                  {" · "}👤 {n.username ?? "— sin usuario —"}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  📣 {n.campania ?? "— sin campaña —"}
                  {" · "}
                  <strong>
                    {n.curso === "JUNIOR"
                      ? "Junior (6–9)"
                      : n.curso === "YOUNGSTER"
                        ? "Youngster (10–13)"
                        : "— sin curso —"}
                  </strong>
                  {n.contratoNumero !== null && ` · contrato N° ${n.contratoNumero}`}
                  {n.externalRef !== null && ` · LGS ${n.externalRef}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                {n.username !== null && (
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
                    background: n.estado === "ACTIVA" ? "#e8f5e9" : "#eceff1",
                    color: n.estado === "ACTIVA" ? "#1b5e20" : "#5a6172",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "1rem",
                    fontWeight: 700,
                  }}
                >
                  {n.estado}
                </span>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
