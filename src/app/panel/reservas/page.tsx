"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { fechaLocal, horaLocal } from "@/ui/fecha-local";
import { numeroContrato } from "@/ui/numero-contrato";

type TipoCurso = "JUNIOR" | "YOUNGSTER";

interface Persona {
  nombres: string;
  apellidos: string;
  docTipo: string;
  docNumero: string;
  email: string;
  telefono: string;
}
interface Campania {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  estado: string;
}
interface Salon {
  id: string;
  nombre: string;
  courseId: string;
  cupo: number;
  ocupados: number;
  activo: boolean;
  guia: string | null;
  horario: { tipo: string; diaSemana: number; horaLocal: string }[];
}

const PAISES = ["CL", "CO", "EC", "PE"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  width: "100%",
};
const btnPrimario: CSSProperties = {
  padding: "0.6rem 1.4rem",
  borderRadius: "0.6rem",
  border: "none",
  background: "var(--lgs-verde)",
  color: "#1b2a10",
  fontWeight: 700,
  cursor: "pointer",
};
const btnSec: CSSProperties = { ...inputStyle, width: "auto", cursor: "pointer" };

const personaVacia = (): Persona => ({
  nombres: "",
  apellidos: "",
  docTipo: "",
  docNumero: "",
  email: "",
  telefono: "",
});

function edadEnFecha(nac: string, fecha: string): number {
  const [ny, nm, nd] = nac.split("-").map(Number);
  const [fy, fm, fd] = fecha.split("-").map(Number);
  let edad = (fy ?? 0) - (ny ?? 0);
  if ((fm ?? 0) < (nm ?? 0) || ((fm ?? 0) === (nm ?? 0) && (fd ?? 0) < (nd ?? 0))) edad -= 1;
  return edad;
}
function tipoPorEdad(edad: number): TipoCurso | null {
  if (edad >= 6 && edad <= 9) return "JUNIOR";
  if (edad >= 10 && edad <= 13) return "YOUNGSTER";
  return null;
}
function resumenHorario(h: Salon["horario"]): string {
  const porHora = new Map<string, number[]>();
  for (const s of h) {
    const dias = porHora.get(s.horaLocal) ?? [];
    dias.push(s.diaSemana);
    porHora.set(s.horaLocal, dias);
  }
  return [...porHora.entries()]
    .map(
      ([hora, dias]) =>
        `${dias
          .sort((a, b) => a - b)
          .map((d) => DIAS[d]?.toUpperCase())
          .join("-")} ${hora}`,
    )
    .join(" · ");
}

function CamposPersona({
  p,
  onChange,
  conFechaNac,
}: {
  p: Persona & { fechaNacimiento?: string };
  onChange: (patch: Partial<Persona & { fechaNacimiento: string }>) => void;
  conFechaNac?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
      <label>
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Nombres</span>
        <input
          value={p.nombres}
          onChange={(e) => onChange({ nombres: e.target.value })}
          required
          style={inputStyle}
        />
      </label>
      <label>
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Apellidos</span>
        <input
          value={p.apellidos}
          onChange={(e) => onChange({ apellidos: e.target.value })}
          required
          style={inputStyle}
        />
      </label>
      {conFechaNac === true && (
        <label>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Fecha de nacimiento</span>
          <input
            type="date"
            value={p.fechaNacimiento ?? ""}
            onChange={(e) => onChange({ fechaNacimiento: e.target.value })}
            required
            style={inputStyle}
          />
        </label>
      )}
      <label>
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Tipo doc.</span>
        <input
          value={p.docTipo}
          onChange={(e) => onChange({ docTipo: e.target.value })}
          required
          placeholder="TI / RUT / DNI"
          style={inputStyle}
        />
      </label>
      <label>
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>N° documento</span>
        <input
          value={p.docNumero}
          onChange={(e) => onChange({ docNumero: e.target.value })}
          required
          style={inputStyle}
        />
      </label>
      <label>
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Email (opcional)</span>
        <input
          type="email"
          value={p.email}
          onChange={(e) => onChange({ email: e.target.value })}
          style={inputStyle}
        />
      </label>
      <label>
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Teléfono/WhatsApp</span>
        <input
          value={p.telefono}
          onChange={(e) => onChange({ telefono: e.target.value })}
          style={inputStyle}
        />
      </label>
    </div>
  );
}

type Pestania = "pendientes" | "nueva";

/**
 * GESTIÓN DE RESERVAS (2026-10-07). Dos pestañas: las reservas que todavía
 * esperan aprobación —el cupo ya está tomado— y el asistente para crear una.
 */
export default function ReservasPage() {
  const [pestania, setPestania] = useState<Pestania>("pendientes");
  const [aviso, setAviso] = useState<string | null>(null);

  const pestanias: { id: Pestania; etiqueta: string }[] = [
    { id: "pendientes", etiqueta: "Reservas sin aprobar" },
    { id: "nueva", etiqueta: "Nueva reserva" },
  ];

  return (
    <main style={{ padding: "2rem", maxWidth: "76rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem" }}>Gestión de Reservas</h1>

      <div
        role="tablist"
        aria-label="Gestión de reservas"
        style={{
          display: "flex",
          gap: "0.25rem",
          marginTop: "1rem",
          borderBottom: "2px solid #e3e7f0",
        }}
      >
        {pestanias.map((p) => {
          const activa = pestania === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setPestania(p.id)}
              style={{
                padding: "0.6rem 1.1rem",
                border: "none",
                borderBottom: `3px solid ${activa ? "var(--lgs-azul)" : "transparent"}`,
                marginBottom: "-2px",
                background: "none",
                color: activa ? "var(--lgs-azul-oscuro)" : "var(--texto-suave)",
                fontWeight: activa ? 700 : 600,
                fontSize: "0.95rem",
                cursor: "pointer",
              }}
            >
              {p.etiqueta}
            </button>
          );
        })}
      </div>

      {aviso !== null && (
        <p
          style={{
            marginTop: "1rem",
            color: "#1b5e20",
            background: "#e8f5e9",
            padding: "0.7rem 1rem",
            borderRadius: "0.6rem",
          }}
        >
          {aviso}
        </p>
      )}

      {pestania === "pendientes" ? (
        <ReservasSinAprobar />
      ) : (
        <NuevaReserva
          onCreada={(texto) => {
            setAviso(texto);
            setPestania("pendientes");
          }}
        />
      )}
    </main>
  );
}

interface Reserva {
  id: string;
  numero: number | null;
  externalRef: string | null;
  countryCode: string;
  tipoCurso: string;
  titular: string;
  titularDocTipo: string;
  titularDocNumero: string;
  titularTelefono: string | null;
  beneficiario: string;
  salon: string | null;
  campania: string | null;
  matriculaDesde: string | null;
}

const PAIS_NOMBRE: Record<string, string> = {
  CL: "Chile",
  CO: "Colombia",
  EC: "Ecuador",
  PE: "Perú",
};

/**
 * Los cupos RESERVADOS cuyo contrato aún no se aprueba: la matrícula RESERVADA
 * es justo eso, y al aprobar pasa a ACTIVA y sale de aquí sola.
 */
function ReservasSinAprobar() {
  const router = useRouter();
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await apiFetch("/api/contracts?matriculaEstado=RESERVADA&limit=200");
        const data: { contratos?: Reserva[]; error?: { message: string } } = await res.json();
        if (!res.ok) {
          setError(data.error?.message ?? "No se pudieron cargar las reservas.");
          return;
        }
        setReservas(data.contratos ?? []);
      } catch {
        setError("Error de conexión.");
      }
    }
    void cargar();
  }, []);

  const th: CSSProperties = {
    padding: "0.55rem 0.6rem",
    textAlign: "left",
    fontWeight: 600,
    color: "var(--texto-suave)",
    whiteSpace: "nowrap",
  };
  const td: CSSProperties = { padding: "0.6rem", verticalAlign: "top" };
  const suave: CSSProperties = { color: "var(--texto-suave)", fontSize: "0.78rem" };

  if (error !== null) {
    return (
      <p role="alert" style={{ marginTop: "1rem", color: "#c62828" }}>
        {error}
      </p>
    );
  }
  if (reservas === null) {
    return <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>Cargando reservas…</p>;
  }

  return (
    <section style={{ marginTop: "1.25rem" }}>
      <p style={{ margin: 0, color: "var(--texto-suave)", fontSize: "0.88rem" }}>
        {reservas.length === 0
          ? "No hay reservas pendientes de aprobación."
          : `${String(reservas.length)} ${reservas.length === 1 ? "cupo reservado" : "cupos reservados"} esperando aprobación. Las que llegan desde LGS se aprueban en LGS: es ahí donde quedan el usuario y la clave del niño.`}
      </p>
      {reservas.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid #e3e7f0" }}>
                <th style={th}>N° contrato</th>
                <th style={th}>País</th>
                <th style={th}>Titular</th>
                <th style={th}>Beneficiario</th>
                <th style={th}>Fecha reserva</th>
                <th style={th}>Curso</th>
                <th style={th}>Salón</th>
              </tr>
            </thead>
            <tbody>
              {reservas.map((r) => {
                const n = numeroContrato(r);
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/panel/contratos/${r.id}`)}
                    title="Abrir la ficha del contrato"
                    style={{ borderBottom: "1px solid #edf0f6", cursor: "pointer" }}
                  >
                    <td style={td}>
                      <Link
                        href={`/panel/contratos/${r.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontWeight: 700 }}
                      >
                        {n.numero}
                      </Link>
                    </td>
                    <td style={td}>{PAIS_NOMBRE[r.countryCode] ?? r.countryCode}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{r.titular}</div>
                      <div style={suave}>
                        {r.titularDocTipo} {r.titularDocNumero}
                      </div>
                      <div style={suave}>{r.titularTelefono ?? "sin teléfono"}</div>
                    </td>
                    <td style={td}>
                      <div>{r.beneficiario}</div>
                      {n.documento !== null && <div style={suave}>doc. {n.documento}</div>}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {r.matriculaDesde !== null ? (
                        <>
                          {fechaLocal(r.matriculaDesde)}
                          <div style={suave}>{horaLocal(r.matriculaDesde)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ ...td, fontWeight: 600, color: "var(--lgs-azul-oscuro)" }}>
                      {r.tipoCurso}
                    </td>
                    <td style={td}>
                      <div>{r.salon ?? "—"}</div>
                      {r.campania !== null && <div style={suave}>{r.campania}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NuevaReserva({ onCreada }: { onCreada: (aviso: string) => void }) {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  // Paso 1
  const [externalRef, setExternalRef] = useState("");
  const [pais, setPais] = useState("CL");
  const [inicio, setInicio] = useState("");
  const [titular, setTitular] = useState<Persona>(personaVacia());
  // Paso 2
  const [titularEsApoderado, setTitularEsApoderado] = useState(true);
  const [apoderado, setApoderado] = useState<Persona>(personaVacia());
  const [parentesco, setParentesco] = useState("");
  // Paso 3
  const [nino, setNino] = useState<Persona & { fechaNacimiento: string }>({
    ...personaVacia(),
    fechaNacimiento: "",
  });
  // Paso 4
  const [campanias, setCampanias] = useState<Campania[]>([]);
  const [campaniaId, setCampaniaId] = useState("");
  const [salones, setSalones] = useState<Salon[]>([]);
  const [classroomId, setClassroomId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const tipoCurso: TipoCurso | null =
    nino.fechaNacimiento !== "" && inicio !== ""
      ? tipoPorEdad(edadEnFecha(nino.fechaNacimiento, inicio))
      : null;

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch("/api/catalog/campaigns");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.ok) {
        const data: { campanias: Campania[] } = await res.json();
        setCampanias(data.campanias.filter((c) => c.estado === "EN_MATRICULA"));
      }
    }
    void cargar();
  }, [router]);

  async function elegirCampania(id: string) {
    setCampaniaId(id);
    setClassroomId("");
    setSalones([]);
    if (id === "" || tipoCurso === null) return;
    const resC = await apiFetch(`/api/catalog/campaigns/${id}`);
    if (!resC.ok) return;
    const dataC: { campania: { courses: { id: string; tipo: string }[] } } = await resC.json();
    const curso = dataC.campania.courses.find((c) => c.tipo === tipoCurso);
    if (curso === undefined) return;
    const resS = await apiFetch(`/api/scheduling/classrooms?courseId=${curso.id}`);
    if (resS.ok) {
      const dataS: { salones: Salon[] } = await resS.json();
      setSalones(dataS.salones);
    }
  }

  function validarPaso1(): boolean {
    if (externalRef.trim() === "") return setErr("Ingresa el N° de contrato LGS.");
    if (inicio === "") return setErr("Ingresa el inicio del contrato.");
    if (titular.nombres === "" || titular.apellidos === "" || titular.docNumero === "")
      return setErr("Completa los datos del titular.");
    setError(null);
    return true;
  }
  function setErr(m: string): boolean {
    setError(m);
    return false;
  }

  async function enviar() {
    setError(null);
    if (tipoCurso === null) {
      setError(
        "La edad del niño no corresponde a Junior (6–9) ni Youngster (10–13) a la fecha de inicio.",
      );
      return;
    }
    if (classroomId === "") {
      setError("Elige un salón con cupo.");
      return;
    }
    setOcupado(true);
    try {
      const conPais = (p: Persona) => ({
        ...p,
        countryCode: pais,
        email: p.email || null,
        telefono: p.telefono || null,
      });
      const body = {
        externalRef: externalRef.trim(),
        countryCode: pais,
        tipoCurso,
        inicio,
        classroomId,
        titular: conPais(titular),
        titularEsApoderado,
        ...(titularEsApoderado ? {} : { apoderadoNuevo: conPais(apoderado) }),
        nino: { ...conPais(nino), fechaNacimiento: nino.fechaNacimiento },
        parentesco: parentesco || null,
      };
      const res = await apiFetch("/api/contracts/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: { externalRef?: string; error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo crear la reserva.");
        return;
      }
      onCreada(
        `Reserva creada para el contrato LGS ${data.externalRef ?? ""}. Queda RESERVADA hasta aprobar.`,
      );
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  const salonesDisponibles = salones.filter((s) => s.activo && s.ocupados < s.cupo);

  return (
    <section style={{ maxWidth: "48rem", marginTop: "1.25rem" }}>
      <p style={{ color: "var(--texto-suave)", margin: 0 }}>
        Paso {paso} de 4 · el cupo queda <strong>reservado</strong> hasta que se apruebe el
        contrato.
      </p>

      {error !== null && (
        <p role="alert" style={{ marginTop: "1rem", color: "#c62828" }}>
          {error}
        </p>
      )}

      <div
        style={{
          marginTop: "1.25rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.9rem",
        }}
      >
        {paso === 1 && (
          <>
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: "var(--lgs-azul)" }}>
              1 · Contrato LGS y titular
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" }}>
              <label>
                <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                  N° contrato LGS (PP-NNNNN-YY)
                </span>
                <input
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                  required
                  placeholder="01-16016-26"
                  style={inputStyle}
                />
              </label>
              <label>
                <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>País</span>
                <select value={pais} onChange={(e) => setPais(e.target.value)} style={inputStyle}>
                  {PAISES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <span style={{ alignSelf: "end", fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                Firmado, sin aprobar
              </span>
              <label>
                <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Inicio del curso</span>
                <input
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  required
                  style={inputStyle}
                />
              </label>
              <span style={{ alignSelf: "end", fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                Fin del contrato: <strong>12 meses desde el inicio</strong> (se calcula solo)
              </span>
            </div>
            <h3 style={{ margin: "0.5rem 0 0", fontSize: "0.95rem" }}>Titular</h3>
            <CamposPersona
              p={titular}
              onChange={(patch) => setTitular((prev) => ({ ...prev, ...patch }))}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                style={btnPrimario}
                onClick={() => validarPaso1() && setPaso(2)}
              >
                Siguiente →
              </button>
            </div>
          </>
        )}

        {paso === 2 && (
          <>
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: "var(--lgs-azul)" }}>
              2 · Apoderado
            </h2>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={titularEsApoderado}
                onChange={(e) => setTitularEsApoderado(e.target.checked)}
              />
              <span>El titular es también el apoderado</span>
            </label>
            {!titularEsApoderado && (
              <>
                <CamposPersona
                  p={apoderado}
                  onChange={(patch) => setApoderado((prev) => ({ ...prev, ...patch }))}
                />
                <label style={{ maxWidth: "16rem" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Parentesco</span>
                  <input
                    value={parentesco}
                    onChange={(e) => setParentesco(e.target.value)}
                    placeholder="madre / padre / tutor"
                    style={inputStyle}
                  />
                </label>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button type="button" style={btnSec} onClick={() => setPaso(1)}>
                ← Volver
              </button>
              <button type="button" style={btnPrimario} onClick={() => setPaso(3)}>
                Siguiente →
              </button>
            </div>
          </>
        )}

        {paso === 3 && (
          <>
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: "var(--lgs-azul)" }}>
              3 · Niño (beneficiario)
            </h2>
            <CamposPersona
              p={nino}
              onChange={(patch) => setNino((prev) => ({ ...prev, ...patch }))}
              conFechaNac
            />
            {nino.fechaNacimiento !== "" && inicio !== "" && (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: tipoCurso === null ? "#c62828" : "var(--texto-suave)",
                }}
              >
                Edad al inicio: {edadEnFecha(nino.fechaNacimiento, inicio)} años →{" "}
                {tipoCurso === null ? "no corresponde a Junior ni Youngster" : `curso ${tipoCurso}`}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button type="button" style={btnSec} onClick={() => setPaso(2)}>
                ← Volver
              </button>
              <button
                type="button"
                style={btnPrimario}
                disabled={tipoCurso === null}
                onClick={() => setPaso(4)}
              >
                Siguiente →
              </button>
            </div>
          </>
        )}

        {paso === 4 && (
          <>
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: "var(--lgs-azul)" }}>
              4 · Campaña, salón y horario
            </h2>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
              Curso <strong>{tipoCurso}</strong> (por edad del niño). Solo campañas en matrícula.
            </p>
            <label>
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Campaña</span>
              <select
                value={campaniaId}
                onChange={(e) => void elegirCampania(e.target.value)}
                style={inputStyle}
              >
                <option value="">— elegir campaña —</option>
                {campanias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.inicio} → {c.fin})
                  </option>
                ))}
              </select>
            </label>
            {campaniaId !== "" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                  Salón / horario (con cupo)
                </span>
                {salonesDisponibles.length === 0 ? (
                  <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>
                    No hay salones {tipoCurso} con cupo en esta campaña.
                  </p>
                ) : (
                  salonesDisponibles.map((s) => (
                    <label
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        padding: "0.55rem 0.75rem",
                        border: `1.5px solid ${classroomId === s.id ? "var(--lgs-verde)" : "#e3e7f0"}`,
                        borderRadius: "0.6rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="salon"
                        checked={classroomId === s.id}
                        onChange={() => setClassroomId(s.id)}
                      />
                      <span style={{ flex: 1 }}>
                        <strong>{s.nombre}</strong> · {resumenHorario(s.horario)}
                        {s.guia !== null && (
                          <span style={{ color: "var(--texto-suave)" }}> · {s.guia}</span>
                        )}
                      </span>
                      <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                        {s.ocupados}/{s.cupo}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button type="button" style={btnSec} onClick={() => setPaso(3)}>
                ← Volver
              </button>
              <button
                type="button"
                style={{ ...btnPrimario, background: ocupado ? "#9e9e9e" : "var(--lgs-verde)" }}
                disabled={ocupado || classroomId === ""}
                onClick={() => void enviar()}
              >
                {ocupado ? "Creando…" : "Crear reserva"}
              </button>
            </div>
          </>
        )}
      </div>

      <p style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
        <Link href="/panel/contratos">← Ir a Contratos</Link>
      </p>
    </section>
  );
}
