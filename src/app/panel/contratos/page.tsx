"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";

interface Contrato {
  id: string;
  numero: number;
  beneficiario: string;
  titular: string;
  username: string | null;
  countryCode: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  inicio: string;
  finalContrato: string;
  estado: "PENDIENTE" | "APROBADO" | "ONHOLD" | "INACTIVO";
  salon: string | null;
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

interface Persona {
  id: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string | null;
  countryCode: string;
  estado: string;
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
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [beneficiarioId, setBeneficiarioId] = useState("");
  const [titularId, setTitularId] = useState("");
  const [tipoCurso, setTipoCurso] = useState<"JUNIOR" | "YOUNGSTER">("JUNIOR");
  const [pais, setPais] = useState("CL");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [salones, setSalones] = useState<SalonOpcion[]>([]);
  // Contrato al que se le está eligiendo salón (matrícula o cambio académico).
  const [eligiendoSalon, setEligiendoSalon] = useState<{
    contrato: Contrato;
    modo: "matricular" | "mover";
  } | null>(null);
  const [salonElegido, setSalonElegido] = useState("");

  const cargar = useCallback(async () => {
    const [resC, resP, resS] = await Promise.all([
      fetch("/api/contracts"),
      fetch("/api/people"),
      fetch("/api/scheduling/classrooms"),
    ]);
    if (resC.ok) {
      const data: { contratos: Contrato[] } = await resC.json();
      setContratos(data.contratos);
    }
    if (resP.ok) {
      const data: { personas: Persona[] } = await resP.json();
      setPersonas(data.personas.filter((p) => p.estado === "ACTIVA"));
    }
    if (resS.ok) {
      const data: { salones: SalonOpcion[] } = await resS.json();
      setSalones(data.salones);
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  async function crear(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beneficiarioId,
          titularId,
          tipoCurso,
          countryCode: pais,
          inicio,
          finalContrato: fin,
        }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo crear el contrato.");
        return;
      }
      setMostrarForm(false);
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function accion(id: string, ruta: string, body?: object) {
    setError(null);
    setOcupado(true);
    try {
      const res = await fetch(`/api/contracts/${id}/${ruta}`, {
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
      await cargar();
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
        res = await fetch("/api/enrollment", {
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
        res = await fetch(`/api/enrollment/${eligiendoSalon.contrato.enrollmentId}/move`, {
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
      await cargar();
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

  const ninos = personas.filter((p) => p.fechaNacimiento !== null);

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.6rem" }}>Contratos</h1>
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
          {mostrarForm ? "Cancelar" : "+ Nuevo contrato"}
        </button>
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

      {mostrarForm && (
        <form
          onSubmit={crear}
          style={{
            marginTop: "1rem",
            padding: "1.25rem",
            border: "1px solid #e3e7f0",
            borderRadius: "0.9rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <label
            style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 14rem" }}
          >
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Niño (beneficiario)</span>
            <select
              required
              value={beneficiarioId}
              onChange={(e) => setBeneficiarioId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Elegir —</option>
              {ninos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.apellidos}, {p.nombres} ({p.countryCode})
                </option>
              ))}
            </select>
          </label>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 14rem" }}
          >
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Titular del contrato</span>
            <select
              required
              value={titularId}
              onChange={(e) => setTitularId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Elegir —</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.apellidos}, {p.nombres} ({p.countryCode})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Tipo de curso</span>
            <select
              value={tipoCurso}
              onChange={(e) => setTipoCurso(e.target.value as "JUNIOR" | "YOUNGSTER")}
              style={inputStyle}
            >
              <option value="JUNIOR">Junior (6–9)</option>
              <option value="YOUNGSTER">Youngster (10–13)</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>País</span>
            <select value={pais} onChange={(e) => setPais(e.target.value)} style={inputStyle}>
              {["CL", "CO", "EC", "PE"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Inicio</span>
            <input
              type="date"
              required
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Fin del contrato</span>
            <input
              type="date"
              required
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              style={inputStyle}
            />
          </label>
          <button
            type="submit"
            disabled={ocupado}
            style={{
              padding: "0.6rem 1.4rem",
              borderRadius: "0.6rem",
              border: "none",
              background: ocupado ? "#9e9e9e" : "var(--lgs-verde)",
              color: "#1b2a10",
              fontWeight: 700,
              cursor: ocupado ? "wait" : "pointer",
            }}
          >
            Crear contrato
          </button>
          <p style={{ width: "100%", fontSize: "0.8rem", color: "var(--texto-suave)" }}>
            La edad del niño a la fecha de inicio se valida contra su fecha de nacimiento. El
            contrato nace PENDIENTE; al aprobarlo se crean las credenciales del alumno.
          </p>
        </form>
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
                  <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                    Titular: {c.titular}
                    {c.username !== null && ` · usuario: ${c.username}`}
                    {c.salon !== null && (
                      <>
                        {" · "}
                        <strong style={{ color: "var(--lgs-azul-oscuro)" }}>🎓 {c.salon}</strong>
                      </>
                    )}
                  </div>
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
