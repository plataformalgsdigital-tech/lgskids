"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Ficha del contrato: el titular arriba y sus beneficiarios en tarjetas, con
 * las acciones sobre CADA niño (salón, curso, pausa, inactivación).
 *
 * Por qué hay varios beneficiarios si en KIDS cada niño es su propio contrato:
 * un contrato de LGS puede traer hermanos, y aquí se separan con el sufijo
 * `#documento` del N° de LGS. Quien abre el contrato de un niño está mirando la
 * matrícula de una familia, así que se muestran juntos — y cada tarjeta actúa
 * sobre SU contrato, no sobre el de al lado.
 */

interface Contrato {
  id: string;
  numero: number;
  beneficiario: string;
  beneficiarioDocTipo: string;
  beneficiarioDocNumero: string;
  beneficiarioFechaNac: string | null;
  beneficiarioEstado: string;
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
  curso: string;
  cupo: number;
  ocupados: number;
}

/**
 * Estado ACADÉMICO: si el niño está tomando el programa. Lo deriva el servidor
 * de contrato + vigencia + matrícula, y es la MISMA respuesta que recibe LGS.
 */
interface Academico {
  activo: boolean;
  estado: "ACTIVO" | "INACTIVO";
  motivo: string | null;
  detalle: string;
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

const PAIS_NOMBRE: Record<string, string> = {
  CL: "Chile",
  CO: "Colombia",
  EC: "Ecuador",
  PE: "Perú",
};

const CURSO_NOMBRE: Record<string, string> = {
  JUNIOR: "Junior (6–9)",
  YOUNGSTER: "Youngster (10–13)",
};

const boton: CSSProperties = {
  padding: "0.4rem 0.85rem",
  borderRadius: "0.5rem",
  border: "1px solid #e3e7f0",
  background: "white",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

const select: CSSProperties = {
  padding: "0.4rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.85rem",
};

/** Un dato con su rótulo, como el resumen de matrícula de LGS. */
function Dato(props: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--texto-suave)",
        }}
      >
        {props.rotulo}
      </div>
      <div style={{ fontSize: "0.92rem", marginTop: "0.1rem" }}>{props.children}</div>
    </div>
  );
}

const rejilla: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
  gap: "0.85rem 1.2rem",
};

export default function FichaContratoPage() {
  const params = useParams<{ id: string }>();
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [hermanos, setHermanos] = useState<Contrato[]>([]);
  /** ¿Está cursando? Por contrato, derivado en el servidor. */
  const [academico, setAcademico] = useState<Record<string, Academico>>({});
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [salones, setSalones] = useState<SalonOpcion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null);
  /** Formulario abierto sobre una tarjeta: mover de salón o cambiar de curso. */
  const [form, setForm] = useState<{
    contratoId: string;
    modo: "matricular" | "salon" | "curso";
    cursoDestino: "JUNIOR" | "YOUNGSTER";
    salonId: string;
    motivo: string;
  } | null>(null);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/contracts/${params.id}`);
    if (!res.ok) {
      setError("No se pudo cargar el contrato.");
      return;
    }
    const data: {
      contrato: Contrato;
      hermanos: Contrato[];
      puedeGestionar: boolean;
      academico?: Record<string, Academico>;
    } = await res.json();
    setContrato(data.contrato);
    setHermanos(data.hermanos);
    setAcademico(data.academico ?? {});
    setPuedeGestionar(data.puedeGestionar);
  }, [params.id]);

  useEffect(() => {
    async function run() {
      await cargar();
    }
    void run();
  }, [cargar]);

  useEffect(() => {
    async function cargarSalones() {
      const res = await apiFetch("/api/scheduling/classrooms");
      if (res.ok) {
        const data: { salones: SalonOpcion[] } = await res.json();
        setSalones(data.salones);
      }
    }
    void cargarSalones();
  }, []);

  async function accion(id: string, ruta: string, body?: object) {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/contracts/${id}/${ruta}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      const data: {
        credenciales?: Credenciales | null;
        diasExtendidos?: number;
        error?: { message: string };
      } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "La operación falló.");
        return false;
      }
      if (data.credenciales != null) setCredenciales(data.credenciales);
      if (data.diasExtendidos !== undefined) {
        setAviso(`Reactivado: el contrato se extendió ${String(data.diasExtendidos)} días.`);
      }
      await cargar();
      return true;
    } catch {
      setError("Error de conexión.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  function pedirMotivo(titulo: string): string | null {
    const motivo = window.prompt(titulo);
    if (motivo === null) return null;
    if (motivo.trim().length < 5) {
      setError("El motivo debe tener al menos 5 caracteres.");
      return null;
    }
    return motivo.trim();
  }

  /** Guarda el formulario abierto: matricular, mover de salón o cambiar de curso. */
  async function confirmarForm() {
    if (form === null || form.salonId === "") return;
    setError(null);
    setAviso(null);
    const c = [contrato, ...hermanos].find((x) => x?.id === form.contratoId);
    if (c == null) return;

    if (form.modo === "matricular") {
      setOcupado(true);
      try {
        const res = await apiFetch("/api/enrollment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contractId: c.id, classroomId: form.salonId }),
        });
        const data: { error?: { message: string } } = await res.json();
        if (!res.ok) {
          setError(data.error?.message ?? "No se pudo matricular.");
          return;
        }
        setForm(null);
        setAviso("Matriculado.");
        await cargar();
      } finally {
        setOcupado(false);
      }
      return;
    }

    if (form.motivo.trim().length < 5) {
      setError("El motivo es obligatorio (mínimo 5 caracteres).");
      return;
    }
    setOcupado(true);
    try {
      const res =
        form.modo === "salon"
          ? await apiFetch(`/api/enrollment/${c.enrollmentId}/move`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nuevoClassroomId: form.salonId, motivo: form.motivo.trim() }),
            })
          : await apiFetch(`/api/contracts/${c.id}/curso`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tipoCurso: form.cursoDestino,
                classroomId: form.salonId,
                motivo: form.motivo.trim(),
              }),
            });
      const data: { advertencia?: string | null; error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "La operación falló.");
        return;
      }
      setForm(null);
      const hecho = form.modo === "salon" ? "Cambio de salón hecho." : "Cambio de curso hecho.";
      // La edad advierte, no bloquea: se dice qué se saltó, y queda auditado.
      setAviso(
        data.advertencia != null && data.advertencia !== ""
          ? `${hecho} ⚠ ${data.advertencia}`
          : hecho,
      );
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  if (contrato === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <Link href="/panel/contratos" style={{ fontSize: "0.9rem" }}>
          ← Volver a contratos
        </Link>
        <p style={{ color: "var(--texto-suave)", marginTop: "1rem" }}>
          {error ?? "Cargando contrato…"}
        </p>
      </main>
    );
  }

  const estado = ESTADO_UI[contrato.estado];
  const beneficiarios = [contrato, ...hermanos];

  return (
    <main style={{ padding: "2rem", maxWidth: "62rem", margin: "0 auto" }}>
      <Link href="/panel/contratos" style={{ fontSize: "0.9rem" }}>
        ← Volver a contratos
      </Link>
      <h1 style={{ fontSize: "1.6rem", margin: "0.5rem 0 0.2rem" }}>Resumen de matrícula</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", margin: 0 }}>
        {contrato.campania ?? "— sin campaña —"} · Contrato N° {contrato.numero}
        {contrato.externalRef !== null && ` · LGS ${contrato.externalRef}`} ·{" "}
        {PAIS_NOMBRE[contrato.countryCode] ?? contrato.countryCode}
      </p>

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
            Entrégalas al apoderado. El niño deberá cambiarla en su primer ingreso.
          </p>
          <button onClick={() => setCredenciales(null)} style={{ ...boton, marginTop: "0.4rem" }}>
            Entendido, cerrar
          </button>
        </div>
      )}
      {error !== null && (
        <p role="alert" style={{ marginTop: "0.75rem", color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {aviso !== null && (
        <p
          style={{
            marginTop: "0.75rem",
            color: "#1b5e20",
            background: "#e8f5e9",
            padding: "0.5rem 0.8rem",
            borderRadius: "0.6rem",
          }}
        >
          {aviso}
        </p>
      )}

      {/* ── Titular ──────────────────────────────────────────── */}
      <section
        style={{
          marginTop: "1.25rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          overflow: "hidden",
          background: "white",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, var(--lgs-azul) 0%, var(--lgs-magenta) 100%)",
            color: "white",
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "0.72rem", letterSpacing: "0.05em", opacity: 0.85 }}>
              TITULAR
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>{contrato.titular}</div>
            <div style={{ fontSize: "0.82rem", opacity: 0.9 }}>
              {contrato.titularDocTipo} {contrato.titularDocNumero}
            </div>
          </div>
          <span
            style={{
              fontSize: "0.78rem",
              fontWeight: 700,
              padding: "0.25rem 0.7rem",
              borderRadius: "1rem",
              color: estado.color,
              background: estado.fondo,
            }}
          >
            {estado.texto}
          </span>
        </div>
        <div style={{ ...rejilla, padding: "1.1rem 1.25rem" }}>
          <Dato rotulo="Documento">
            {contrato.titularDocTipo} {contrato.titularDocNumero}
          </Dato>
          <Dato rotulo="Plataforma">
            {PAIS_NOMBRE[contrato.countryCode] ?? contrato.countryCode}
          </Dato>
          <Dato rotulo="Celular">{contrato.titularTelefono ?? "—"}</Dato>
          <Dato rotulo="Email">{contrato.titularEmail ?? "—"}</Dato>
          <Dato rotulo="Inicio contrato">{contrato.inicio}</Dato>
          <Dato rotulo="Fin contrato">{contrato.finalContrato}</Dato>
          {/* Fija por regla de negocio: inicio + 12 meses, más las pausas. */}
          <Dato rotulo="Vigencia (meses)">12</Dato>
        </div>
        {contrato.apoderados.length > 0 && (
          <div
            style={{
              borderTop: "1px solid #edf0f6",
              padding: "0.8rem 1.25rem",
              fontSize: "0.85rem",
              color: "var(--texto-suave)",
            }}
          >
            🧑‍🤝‍🧑 Apoderado{contrato.apoderados.length > 1 ? "s" : ""}:{" "}
            {contrato.apoderados
              .map(
                (a) =>
                  `${a.nombre}${a.parentesco !== null ? ` (${a.parentesco})` : ""} · ${a.docTipo} ${a.docNumero}${a.telefono !== null ? ` · tel. ${a.telefono}` : ""}`,
              )
              .join("   |   ")}
          </div>
        )}
      </section>

      {/* ── Beneficiarios ────────────────────────────────────── */}
      <h2 style={{ fontSize: "1.1rem", margin: "1.5rem 0 0.6rem" }}>
        👥 Beneficiarios ({beneficiarios.length})
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))",
          gap: "0.9rem",
        }}
      >
        {beneficiarios.map((c) => {
          const suyo = c.id === contrato.id;
          const e = ESTADO_UI[c.estado];
          const abierto = form?.contratoId === c.id ? form : null;
          // El salón destino tiene que ser del curso que va a quedar en el contrato.
          const cursoObjetivo = abierto?.modo === "curso" ? abierto.cursoDestino : c.tipoCurso;
          return (
            <article
              key={c.id}
              style={{
                border: suyo ? "2px solid var(--lgs-azul)" : "1px solid #e3e7f0",
                borderRadius: "0.9rem",
                overflow: "hidden",
                background: "white",
              }}
            >
              <div
                style={{
                  background: suyo ? "var(--lgs-azul)" : "#78909c",
                  color: "white",
                  padding: "0.7rem 1rem",
                }}
              >
                <div style={{ fontWeight: 800 }}>{c.beneficiario}</div>
                <div style={{ fontSize: "0.78rem", opacity: 0.9 }}>
                  {c.beneficiarioDocTipo} {c.beneficiarioDocNumero} · contrato N° {c.numero}
                </div>
              </div>
              {/* ¿Está tomando el programa? Es la MISMA respuesta que recibe
                  LGS, y por eso va arriba de todo en su tarjeta. */}
              {academico[c.id] !== undefined && (
                <div
                  style={{
                    padding: "0.5rem 1rem",
                    background: academico[c.id]?.activo === true ? "#e8f5e9" : "#fff8e1",
                    color: academico[c.id]?.activo === true ? "#1b5e20" : "#8a6d00",
                    fontSize: "0.85rem",
                    borderBottom: "1px solid #edf0f6",
                  }}
                >
                  <strong>
                    {academico[c.id]?.activo === true
                      ? "🟢 Cursando el programa"
                      : "⚪ No está cursando"}
                  </strong>
                  {academico[c.id]?.activo !== true && ` · ${academico[c.id]?.detalle ?? ""}`}
                </div>
              )}
              <div style={{ ...rejilla, padding: "0.9rem 1rem" }}>
                <Dato rotulo="Fecha de nacimiento">{c.beneficiarioFechaNac ?? "—"}</Dato>
                <Dato rotulo="Curso">{CURSO_NOMBRE[c.tipoCurso] ?? c.tipoCurso}</Dato>
                <Dato rotulo="Salón">
                  {c.salon ?? <span style={{ color: "#8a6d00" }}>sin matricular</span>}
                </Dato>
                <Dato rotulo="Usuario">
                  {c.username ?? <span style={{ color: "var(--texto-suave)" }}>aún no tiene</span>}
                </Dato>
                <Dato rotulo="Estado del contrato">
                  <span style={{ color: e.color, fontWeight: 700 }}>{e.texto}</span>
                </Dato>
                <Dato rotulo="Vigencia">
                  {c.inicio} → {c.finalContrato}
                </Dato>
              </div>

              {puedeGestionar && (
                <div
                  style={{
                    borderTop: "1px solid #edf0f6",
                    padding: "0.7rem 1rem",
                    display: "flex",
                    gap: "0.4rem",
                    flexWrap: "wrap",
                  }}
                >
                  {c.estado === "PENDIENTE" && (
                    <button
                      style={{ ...boton, borderColor: "var(--lgs-verde)" }}
                      disabled={ocupado}
                      onClick={() => void accion(c.id, "approve")}
                    >
                      ✔ Aprobar
                    </button>
                  )}
                  {c.estado === "APROBADO" && c.enrollmentId === null && (
                    <button
                      style={{ ...boton, borderColor: "var(--lgs-azul)" }}
                      disabled={ocupado}
                      onClick={() =>
                        setForm({
                          contratoId: c.id,
                          modo: "matricular",
                          cursoDestino: c.tipoCurso,
                          salonId: "",
                          motivo: "",
                        })
                      }
                    >
                      🎓 Matricular
                    </button>
                  )}
                  {c.estado === "APROBADO" && c.enrollmentId !== null && (
                    <button
                      style={boton}
                      disabled={ocupado}
                      onClick={() =>
                        setForm({
                          contratoId: c.id,
                          modo: "salon",
                          cursoDestino: c.tipoCurso,
                          salonId: "",
                          motivo: "",
                        })
                      }
                    >
                      🔀 Cambiar salón
                    </button>
                  )}
                  {c.estado !== "INACTIVO" && (
                    <button
                      style={boton}
                      disabled={ocupado}
                      onClick={() =>
                        setForm({
                          contratoId: c.id,
                          modo: "curso",
                          cursoDestino: c.tipoCurso === "JUNIOR" ? "YOUNGSTER" : "JUNIOR",
                          salonId: "",
                          motivo: "",
                        })
                      }
                    >
                      🎚 Cambiar curso
                    </button>
                  )}
                  {c.estado === "APROBADO" && (
                    <button
                      style={boton}
                      disabled={ocupado}
                      onClick={() => {
                        const m = pedirMotivo("Motivo de la pausa (obligatorio):");
                        if (m !== null) void accion(c.id, "onhold", { motivo: m });
                      }}
                    >
                      ⏸ Pausar
                    </button>
                  )}
                  {c.estado === "ONHOLD" && (
                    <button
                      style={boton}
                      disabled={ocupado}
                      onClick={() => void accion(c.id, "reactivate")}
                    >
                      ▶ Reactivar
                    </button>
                  )}
                  {c.estado !== "INACTIVO" && (
                    <button
                      style={{ ...boton, color: "#c62828" }}
                      disabled={ocupado}
                      onClick={() => {
                        const m = pedirMotivo("Motivo de la inactivación (obligatorio):");
                        if (m !== null) void accion(c.id, "deactivate", { motivo: m });
                      }}
                    >
                      ✖ Inactivar
                    </button>
                  )}
                </div>
              )}

              {abierto !== null && (
                <div
                  style={{
                    borderTop: "1px solid #edf0f6",
                    padding: "0.8rem 1rem",
                    background: "#f7f9fc",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  {abierto.modo === "curso" && (
                    <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      Curso nuevo{" "}
                      <select
                        value={abierto.cursoDestino}
                        onChange={(ev) =>
                          setForm({
                            ...abierto,
                            cursoDestino: ev.target.value as "JUNIOR" | "YOUNGSTER",
                            salonId: "",
                          })
                        }
                        style={select}
                      >
                        <option value="JUNIOR">Junior (6–9)</option>
                        <option value="YOUNGSTER">Youngster (10–13)</option>
                      </select>
                    </label>
                  )}
                  <select
                    value={abierto.salonId}
                    onChange={(ev) => setForm({ ...abierto, salonId: ev.target.value })}
                    style={select}
                  >
                    <option value="">— Elegir salón {cursoObjetivo} —</option>
                    {salones
                      .filter((s) => s.curso === cursoObjetivo && s.id !== null)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.campania} · {s.nombre} ({s.ocupados}/{s.cupo})
                        </option>
                      ))}
                  </select>
                  {abierto.modo !== "matricular" && (
                    <input
                      value={abierto.motivo}
                      onChange={(ev) => setForm({ ...abierto, motivo: ev.target.value })}
                      placeholder="Motivo del cambio (queda en el historial)"
                      style={{ ...select, width: "100%" }}
                    />
                  )}
                  {abierto.modo === "curso" && (
                    <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--texto-suave)" }}>
                      Cambia el curso del CONTRATO y mueve la matrícula al salón elegido. Si la edad
                      del niño no cuadra con el curso nuevo se avisa, pero no se impide: los rangos
                      son 6–9 y 10–13, así que todo cambio de curso se sale de uno.
                    </p>
                  )}
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      style={{ ...boton, borderColor: "var(--lgs-verde)" }}
                      disabled={ocupado || abierto.salonId === ""}
                      onClick={() => void confirmarForm()}
                    >
                      Confirmar
                    </button>
                    <button style={boton} onClick={() => setForm(null)} disabled={ocupado}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
