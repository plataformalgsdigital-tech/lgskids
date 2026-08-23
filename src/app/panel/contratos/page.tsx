"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Contrato {
  id: string;
  numero: number;
  beneficiario: string;
  beneficiarioDocTipo: string;
  beneficiarioDocNumero: string;
  beneficiarioFechaNac: string | null;
  titular: string;
  titularDocTipo: string;
  titularDocNumero: string;
  titularTelefono: string | null;
  titularEmail: string | null;
  apoderados: {
    nombre: string;
    docTipo: string;
    docNumero: string;
    telefono: string | null;
    parentesco: string | null;
  }[];
  username: string | null;
  countryCode: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  inicio: string;
  finalContrato: string;
  estado: "PENDIENTE" | "APROBADO" | "ONHOLD" | "INACTIVO";
  externalRef: string | null;
  salon: string | null;
  campania: string | null;
  enrollmentId: string | null;
}

interface SalonOpcion {
  id: string;
  nombre: string;
  campania: string;
  curso: string; // tipo del curso (JUNIOR | YOUNGSTER)
  cupo: number;
  sesiones: number;
}

interface Credenciales {
  username: string;
  correo: string;
  passwordInicial: string;
}

const ESTADO_UI: Record<Contrato["estado"], { texto: string; color: string; fondo: string }> = {
  PENDIENTE: { texto: "Pendiente", color: "#8a6d00", fondo: "#fff8e1" },
  APROBADO: { texto: "Aprobado", color: "#1b5e20", fondo: "#e8f5e9" },
  ONHOLD: { texto: "En pausa", color: "#0d47a1", fondo: "#e3f2fd" },
  INACTIVO: { texto: "Inactivo", color: "#5a6172", fondo: "#eceff1" },
};

const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

const botonAccion: CSSProperties = {
  padding: "0.35rem 0.8rem",
  borderRadius: "0.5rem",
  border: "1px solid #e3e7f0",
  background: "white",
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
};

export default function ContratosPage() {
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [salones, setSalones] = useState<SalonOpcion[]>([]);
  const [campanias, setCampanias] = useState<{ id: string; nombre: string }[]>([]);
  // Contrato al que se le está eligiendo salón (matrícula o cambio académico).
  const [eligiendoSalon, setEligiendoSalon] = useState<{
    contrato: Contrato;
    modo: "matricular" | "mover";
  } | null>(null);
  const [salonElegido, setSalonElegido] = useState("");
  // Filtros
  const [fEstado, setFEstado] = useState("");
  const [fPais, setFPais] = useState("");
  const [fTipoCurso, setFTipoCurso] = useState("");
  const [fCampaniaId, setFCampaniaId] = useState("");
  const [fInicioDesde, setFInicioDesde] = useState("");
  const [fFinalHasta, setFFinalHasta] = useState("");

  const cargarContratos = useCallback(async () => {
    const p = new URLSearchParams();
    if (fEstado) p.set("estado", fEstado);
    if (fPais) p.set("pais", fPais);
    if (fTipoCurso) p.set("tipoCurso", fTipoCurso);
    if (fCampaniaId) p.set("campaignId", fCampaniaId);
    if (fInicioDesde) p.set("inicioDesde", fInicioDesde);
    if (fFinalHasta) p.set("finalHasta", fFinalHasta);
    p.set("limit", "200");
    const res = await apiFetch(`/api/contracts?${p.toString()}`);
    if (res.ok) {
      const data: { contratos: Contrato[] } = await res.json();
      setContratos(data.contratos);
    }
  }, [fEstado, fPais, fTipoCurso, fCampaniaId, fInicioDesde, fFinalHasta]);

  useEffect(() => {
    async function run() {
      await cargarContratos();
    }
    void run();
  }, [cargarContratos]);

  useEffect(() => {
    async function estaticos() {
      const [resS, resCa] = await Promise.all([
        apiFetch("/api/scheduling/classrooms"),
        apiFetch("/api/catalog/campaigns"),
      ]);
      if (resS.ok) {
        const data: { salones: SalonOpcion[] } = await resS.json();
        setSalones(data.salones);
      }
      if (resCa.ok) {
        const data: { campanias: { id: string; nombre: string }[] } = await resCa.json();
        setCampanias(data.campanias);
      }
    }
    void estaticos();
  }, []);

  /** Genera un CSV con los contratos actualmente listados (respeta los filtros). */
  function descargarCSV() {
    if (contratos === null || contratos.length === 0) return;
    setDescargando(true);
    try {
      const headers = [
        "N",
        "N LGS",
        "Estado",
        "Pais",
        "Curso",
        "Inicio",
        "Final",
        "Beneficiario",
        "Doc beneficiario",
        "Nacimiento",
        "Usuario",
        "Titular",
        "Doc titular",
        "Tel titular",
        "Email titular",
        "Apoderados",
        "Salon",
        "Campana",
      ];
      const esc = (v: unknown): string => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const filas = contratos.map((c) =>
        [
          c.numero,
          c.externalRef ?? "",
          c.estado,
          c.countryCode,
          c.tipoCurso,
          c.inicio,
          c.finalContrato,
          c.beneficiario,
          `${c.beneficiarioDocTipo} ${c.beneficiarioDocNumero}`,
          c.beneficiarioFechaNac ?? "",
          c.username ?? "",
          c.titular,
          `${c.titularDocTipo} ${c.titularDocNumero}`,
          c.titularTelefono ?? "",
          c.titularEmail ?? "",
          c.apoderados
            .map(
              (a) =>
                `${a.nombre}${a.parentesco !== null ? ` (${a.parentesco})` : ""} ${a.docTipo} ${a.docNumero}`,
            )
            .join(" | "),
          c.salon ?? "",
          c.campania ?? "",
        ]
          .map(esc)
          .join(","),
      );
      const csv = [headers.join(","), ...filas].join("\r\n");
      // BOM para que Excel respete los acentos.
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const hoy = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `contratos-${hoy}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando(false);
    }
  }

  async function accion(id: string, ruta: string, body?: object) {
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/contracts/${id}/${ruta}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      const data: {
        credenciales?: Credenciales | null;
        error?: { message: string };
        diasExtendidos?: number;
      } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "La operación falló.");
        return;
      }
      if (data.credenciales != null) {
        setCredenciales(data.credenciales);
      }
      await cargarContratos();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  function aprobar(id: string) {
    void accion(id, "approve");
  }

  async function confirmarSalon() {
    if (eligiendoSalon === null || salonElegido === "") return;
    setError(null);
    setOcupado(true);
    try {
      let res: Response;
      if (eligiendoSalon.modo === "matricular") {
        res = await apiFetch("/api/enrollment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractId: eligiendoSalon.contrato.id,
            classroomId: salonElegido,
          }),
        });
      } else {
        const motivo = window.prompt("Motivo del cambio académico (obligatorio):");
        if (motivo === null) {
          setOcupado(false);
          return;
        }
        if (motivo.trim().length < 5) {
          setError("El motivo debe tener al menos 5 caracteres.");
          setOcupado(false);
          return;
        }
        res = await apiFetch(`/api/enrollment/${eligiendoSalon.contrato.enrollmentId}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nuevoClassroomId: salonElegido, motivo }),
        });
      }
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "La operación falló.");
        return;
      }
      setEligiendoSalon(null);
      setSalonElegido("");
      await cargarContratos();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }
  function pausar(id: string) {
    const motivo = window.prompt("Motivo de la pausa (obligatorio):");
    if (motivo !== null && motivo.trim().length >= 5) void accion(id, "onhold", { motivo });
    else if (motivo !== null) setError("El motivo debe tener al menos 5 caracteres.");
  }
  function reactivar(id: string) {
    void accion(id, "reactivate");
  }
  function inactivar(id: string) {
    const motivo = window.prompt("Motivo de la inactivación (obligatorio):");
    if (motivo !== null && motivo.trim().length >= 5) void accion(id, "deactivate", { motivo });
    else if (motivo !== null) setError("El motivo debe tener al menos 5 caracteres.");
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.6rem" }}>Contratos</h1>
        <button
          onClick={descargarCSV}
          disabled={descargando || contratos === null || contratos.length === 0}
          title={
            contratos !== null && contratos.length > 0
              ? "Descarga los contratos listados (con los filtros aplicados)"
              : "No hay contratos para exportar"
          }
          style={{
            padding: "0.55rem 1.2rem",
            borderRadius: "0.6rem",
            border: "none",
            background:
              descargando || contratos === null || contratos.length === 0
                ? "#9e9e9e"
                : "var(--lgs-verde)",
            color: "#1b2a10",
            fontWeight: 700,
            cursor: descargando ? "wait" : "pointer",
          }}
        >
          {descargando ? "Generando…" : "⬇ Descargar CSV"}
        </button>
      </div>

      <div
        style={{
          marginTop: "1rem",
          padding: "0.9rem 1rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          display: "flex",
          gap: "0.7rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Contrato (estado)</span>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="APROBADO">Aprobado</option>
            <option value="ONHOLD">En pausa</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Plataforma</span>
          <select value={fPais} onChange={(e) => setFPais(e.target.value)} style={inputStyle}>
            <option value="">Todas</option>
            {["CL", "CO", "EC", "PE"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 12rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Campaña</span>
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
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Curso</span>
          <select
            value={fTipoCurso}
            onChange={(e) => setFTipoCurso(e.target.value)}
            style={inputStyle}
          >
            <option value="">Todos</option>
            <option value="JUNIOR">Junior (6–9)</option>
            <option value="YOUNGSTER">Youngster (10–13)</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Inicio desde</span>
          <input
            type="date"
            value={fInicioDesde}
            onChange={(e) => setFInicioDesde(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Final hasta</span>
          <input
            type="date"
            value={fFinalHasta}
            onChange={(e) => setFFinalHasta(e.target.value)}
            style={inputStyle}
          />
        </label>
        {(fEstado || fPais || fTipoCurso || fCampaniaId || fInicioDesde || fFinalHasta) && (
          <button
            onClick={() => {
              setFEstado("");
              setFPais("");
              setFTipoCurso("");
              setFCampaniaId("");
              setFInicioDesde("");
              setFFinalHasta("");
            }}
            style={botonAccion}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {credenciales !== null && (
        <div
          style={{
            marginTop: "1rem",
            padding: "1rem 1.25rem",
            background: "#e8f5e9",
            border: "2px solid var(--lgs-verde)",
            borderRadius: "0.9rem",
          }}
        >
          <strong>🎉 Alumno dado de alta. Credenciales (se muestran UNA sola vez):</strong>
          <p style={{ marginTop: "0.4rem", fontFamily: "monospace", fontSize: "1.05rem" }}>
            Usuario: <strong>{credenciales.username}</strong> · Contraseña inicial:{" "}
            <strong>{credenciales.passwordInicial}</strong>
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
            Entréguelas al apoderado. El niño deberá cambiar la contraseña en su primer ingreso.
          </p>
          <button
            onClick={() => setCredenciales(null)}
            style={{ ...botonAccion, marginTop: "0.4rem" }}
          >
            Entendido, cerrar
          </button>
        </div>
      )}

      {error !== null && (
        <p role="alert" style={{ marginTop: "0.75rem", color: "#c62828" }}>
          {error}
        </p>
      )}

      <section
        style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        {contratos === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : contratos.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>
            Sin contratos. Primero crea las personas en la sección Personas.
          </p>
        ) : (
          contratos.map((c) => {
            const estado = ESTADO_UI[c.estado];
            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.8rem 1rem",
                  border: "1px solid #e3e7f0",
                  borderRadius: "0.7rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: "16rem" }}>
                  <strong>
                    N° {c.numero} · {c.beneficiario}
                  </strong>{" "}
                  <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                    {c.tipoCurso} · {c.countryCode} · {c.inicio} → {c.finalContrato}
                  </span>
                  {c.externalRef !== null && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#0d47a1",
                        background: "#e3f2fd",
                        padding: "0.1rem 0.45rem",
                        borderRadius: "0.5rem",
                        marginLeft: "0.4rem",
                      }}
                    >
                      LGS {c.externalRef}
                    </span>
                  )}
                  <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                    👦 Beneficiario: <strong>{c.beneficiario}</strong> · {c.beneficiarioDocTipo}{" "}
                    {c.beneficiarioDocNumero}
                    {c.beneficiarioFechaNac !== null && ` · nac. ${c.beneficiarioFechaNac}`}
                    {c.username !== null && ` · usuario: ${c.username}`}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                    👤 Titular: <strong>{c.titular}</strong> · {c.titularDocTipo}{" "}
                    {c.titularDocNumero}
                    {c.titularTelefono !== null && ` · tel. ${c.titularTelefono}`}
                    {c.titularEmail !== null && ` · ${c.titularEmail}`}
                    {c.salon !== null && (
                      <>
                        {" · "}
                        <strong style={{ color: "var(--lgs-azul-oscuro)" }}>🎓 {c.salon}</strong>
                      </>
                    )}
                  </div>
                  {c.apoderados.length > 0 && (
                    <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                      🧑‍🤝‍🧑 Apoderado{c.apoderados.length > 1 ? "s" : ""}:{" "}
                      {c.apoderados
                        .map(
                          (a) =>
                            `${a.nombre}${a.parentesco !== null ? ` (${a.parentesco})` : ""} · ${a.docTipo} ${a.docNumero}${a.telefono !== null ? ` · tel. ${a.telefono}` : ""}`,
                        )
                        .join("   |   ")}
                    </div>
                  )}
                  {eligiendoSalon?.contrato.id === c.id && (
                    <div
                      style={{
                        marginTop: "0.4rem",
                        display: "flex",
                        gap: "0.4rem",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <select
                        value={salonElegido}
                        onChange={(e) => setSalonElegido(e.target.value)}
                        style={{
                          padding: "0.4rem",
                          borderRadius: "0.5rem",
                          border: "1.5px solid #d8dce6",
                          fontSize: "0.85rem",
                        }}
                      >
                        <option value="">— Elegir salón {c.tipoCurso} —</option>
                        {salones
                          .filter((s) => s.curso === c.tipoCurso)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.campania} · {s.nombre} (cupo {s.cupo})
                            </option>
                          ))}
                      </select>
                      <button
                        style={{ ...botonAccion, borderColor: "var(--lgs-verde)" }}
                        disabled={ocupado || salonElegido === ""}
                        onClick={() => void confirmarSalon()}
                      >
                        Confirmar
                      </button>
                      <button style={botonAccion} onClick={() => setEligiendoSalon(null)}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      padding: "0.22rem 0.6rem",
                      borderRadius: "1rem",
                      color: estado.color,
                      background: estado.fondo,
                    }}
                  >
                    {estado.texto}
                  </span>
                  {c.estado === "PENDIENTE" && (
                    <button
                      style={{ ...botonAccion, borderColor: "var(--lgs-verde)" }}
                      onClick={() => aprobar(c.id)}
                      disabled={ocupado}
                    >
                      ✔ Aprobar
                    </button>
                  )}
                  {c.estado === "APROBADO" && c.enrollmentId === null && (
                    <button
                      style={{ ...botonAccion, borderColor: "var(--lgs-azul)" }}
                      disabled={ocupado}
                      onClick={() => {
                        setEligiendoSalon({ contrato: c, modo: "matricular" });
                        setSalonElegido("");
                      }}
                    >
                      🎓 Matricular
                    </button>
                  )}
                  {c.estado === "APROBADO" && c.enrollmentId !== null && (
                    <button
                      style={botonAccion}
                      disabled={ocupado}
                      onClick={() => {
                        setEligiendoSalon({ contrato: c, modo: "mover" });
                        setSalonElegido("");
                      }}
                    >
                      🔀 Cambiar salón
                    </button>
                  )}
                  {c.estado === "APROBADO" && (
                    <button style={botonAccion} onClick={() => pausar(c.id)} disabled={ocupado}>
                      ⏸ Pausar
                    </button>
                  )}
                  {c.estado === "ONHOLD" && (
                    <button style={botonAccion} onClick={() => reactivar(c.id)} disabled={ocupado}>
                      ▶ Reactivar
                    </button>
                  )}
                  {c.estado !== "INACTIVO" && (
                    <button
                      style={{ ...botonAccion, color: "#c62828" }}
                      onClick={() => inactivar(c.id)}
                      disabled={ocupado}
                    >
                      ✖ Inactivar
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
