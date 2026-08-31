"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

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

export default function ReservasPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  // Paso 1
  const [externalRef, setExternalRef] = useState("");
  const [pais, setPais] = useState("CL");
  const [inicio, setInicio] = useState("");
  const [finalContrato, setFinalContrato] = useState("");
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
  const [ok, setOk] = useState<string | null>(null);
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
    if (inicio === "" || finalContrato === "") return setErr("Ingresa inicio y fin del contrato.");
    if (finalContrato <= inicio) return setErr("El fin debe ser posterior al inicio.");
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
    setOk(null);
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
        finalContrato,
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
      setOk(
        `Reserva creada para el contrato LGS ${data.externalRef}. Queda RESERVADA hasta aprobar.`,
      );
      setTimeout(() => router.push("/panel/contratos"), 1800);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  const salonesDisponibles = salones.filter((s) => s.activo && s.ocupados < s.cupo);

  return (
    <main style={{ padding: "2rem", maxWidth: "48rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem" }}>Reserva de beneficiario (LGS)</h1>
      <p style={{ color: "var(--texto-suave)", marginTop: "0.25rem" }}>
        Paso {paso} de 4 · el cupo queda <strong>reservado</strong> hasta que se apruebe el
        contrato.
      </p>

      {ok !== null && (
        <p
          style={{
            marginTop: "1rem",
            color: "#1b5e20",
            background: "#e8f5e9",
            padding: "0.7rem 1rem",
            borderRadius: "0.6rem",
          }}
        >
          {ok}
        </p>
      )}
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
              <label>
                <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Fin del contrato</span>
                <input
                  type="date"
                  value={finalContrato}
                  onChange={(e) => setFinalContrato(e.target.value)}
                  required
                  style={inputStyle}
                />
              </label>
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
    </main>
  );
}
