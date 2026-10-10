"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { numeroContrato } from "@/ui/numero-contrato";
import { ClaveConsultada, type ConsultaClave } from "../../usuarios/comunes";
import { AcademicInfo } from "./AcademicInfo";
import { EnviarCredencialesModal } from "./EnviarCredencialesModal";
import { PerfilWelcome } from "./PerfilWelcome";

interface Nino {
  id: string;
  nombres: string;
  apellidos: string;
  docTipo: string;
  docNumero: string;
  countryCode: string;
  fechaNacimiento: string | null;
  personaEmail: string | null;
  telefono: string | null;
  estado: "ACTIVA" | "INACTIVA";
  userId: string | null;
  contractId: string | null;
  username: string | null;
  correo: string | null;
  contratoNumero: number | null;
  externalRef: string | null;
  tipoCurso: string | null;
  inicio: string | null;
  finalContrato: string | null;
  contratoEstado: string | null;
  firmado: boolean | null;
  matriculaEstado: string | null;
  salon: string | null;
  meetingUrl: string | null;
  campania: string | null;
  curso: string | null;
  guia: string | null;
  proximaSesion: string | null;
  apoderados: {
    nombre: string;
    docTipo: string;
    docNumero: string;
    telefono: string | null;
    email: string | null;
    parentesco: string | null;
  }[];
}

const PAIS_NOMBRE: Record<string, string> = {
  CL: "Chile",
  CO: "Colombia",
  EC: "Ecuador",
  PE: "Perú",
};

function cursoLabel(curso: string | null): string {
  if (curso === "JUNIOR") return "Junior (6–9)";
  if (curso === "YOUNGSTER") return "Youngster (10–13)";
  return "—";
}

const card: CSSProperties = {
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1.25rem",
};
const badge = (bg: string, fg: string): CSSProperties => ({
  background: bg,
  color: fg,
  padding: "0.2rem 0.6rem",
  borderRadius: "1rem",
  fontSize: "0.8rem",
  fontWeight: 700,
});

function Dato({
  etiqueta,
  children,
  style,
}: {
  etiqueta: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ minWidth: 0, ...style }}>
      <div style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>{etiqueta}</div>
      {/* Un correo largo parte la línea en vez de montarse sobre la columna vecina. */}
      <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: "0.9rem",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
        gap: "0.9rem",
      }}
    >
      {children}
    </div>
  );
}

export default function DetalleNinoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [nino, setNino] = useState<Nino | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puedeVerClaves, setPuedeVerClaves] = useState(false);
  const [puedeEnviarMensajes, setPuedeEnviarMensajes] = useState(false);
  const [enviandoCredenciales, setEnviandoCredenciales] = useState(false);
  const [pestana, setPestana] = useState<"general" | "academic">("general");
  /** Sube cuando Academic Change mueve al niño: la ficha se vuelve a leer. */
  const [recarga, setRecarga] = useState(0);
  const [clave, setClave] = useState<ConsultaClave | null>(null);
  const [errorClave, setErrorClave] = useState<string | null>(null);

  async function verClave(userId: string) {
    if (clave !== null) {
      setClave(null);
      return;
    }
    setErrorClave(null);
    const res = await apiFetch(`/api/identity/users/${userId}/clave`);
    if (!res.ok) {
      setErrorClave("No se pudo consultar la clave.");
      return;
    }
    setClave((await res.json()) as ConsultaClave);
  }

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch(`/api/people/ninos/${params.id}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data: {
        nino?: Nino;
        puedeVerClaves?: boolean;
        puedeEnviarMensajes?: boolean;
        error?: { message: string };
      } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo cargar el niño.");
        return;
      }
      setNino(data.nino ?? null);
      setPuedeVerClaves(data.puedeVerClaves === true);
      setPuedeEnviarMensajes(data.puedeEnviarMensajes === true);
    }
    void cargar();
  }, [params.id, router, recarga]);

  if (error !== null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p role="alert" style={{ color: "#c62828" }}>
          {error}
        </p>
        <Link href="/panel/personas">← Volver a Kids</Link>
      </main>
    );
  }
  if (nino === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando ficha…</p>
      </main>
    );
  }

  const nc = numeroContrato({ externalRef: nino.externalRef, numero: nino.contratoNumero });

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <Link href="/panel/personas" style={{ fontSize: "0.9rem" }}>
        ← Volver a Kids
      </Link>

      {/* Encabezado */}
      <section style={{ ...card, marginTop: "0.6rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.7rem", margin: 0 }}>
              {nino.nombres} {nino.apellidos}
            </h1>
            <p style={{ margin: "0.4rem 0 0", color: "var(--texto-suave)", fontSize: "0.9rem" }}>
              ID: <strong>{nino.docNumero}</strong> · Contrato: <strong>{nc.numero}</strong> ·
              Programa: <strong>{nino.campania ?? "—"}</strong> ({cursoLabel(nino.curso)}) · Estado:{" "}
              <span
                style={badge(
                  nino.estado === "ACTIVA" ? "#e8f5e9" : "#eceff1",
                  nino.estado === "ACTIVA" ? "#1b5e20" : "#5a6172",
                )}
              >
                {nino.estado}
              </span>
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={badge("#ede7f6", "#4527a0")}>BENEFICIARIO</span>
            <span style={badge("#e3f2fd", "#0d47a1")}>
              {PAIS_NOMBRE[nino.countryCode] ?? nino.countryCode}
            </span>
            <span style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
              Próxima sesión: <strong>{nino.proximaSesion ?? "sin sesión futura"}</strong>
            </span>
          </div>
        </div>
      </section>

      {/* Pestañas */}
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: "0.4rem",
          marginTop: "1rem",
          borderBottom: "2px solid #e3e7f0",
        }}
      >
        {(
          [
            ["general", "General Info"],
            ["academic", "Academic Info"],
          ] as const
        ).map(([clave, texto]) => (
          <button
            key={clave}
            type="button"
            role="tab"
            aria-selected={pestana === clave}
            onClick={() => setPestana(clave)}
            style={{
              padding: "0.6rem 1.2rem",
              border: "none",
              borderBottom: `3px solid ${pestana === clave ? "var(--lgs-azul)" : "transparent"}`,
              marginBottom: "-2px",
              background: "transparent",
              fontWeight: 800,
              fontSize: "0.95rem",
              color: pestana === clave ? "var(--lgs-azul)" : "var(--texto-suave)",
              cursor: "pointer",
            }}
          >
            {texto}
          </button>
        ))}
      </div>

      {enviandoCredenciales && (
        <EnviarCredencialesModal
          childPersonId={nino.id}
          nombre={`${nino.nombres} ${nino.apellidos}`}
          onCerrar={() => setEnviandoCredenciales(false)}
        />
      )}

      {pestana === "academic" && (
        <AcademicInfo
          childPersonId={nino.id}
          contractId={nino.contractId}
          nombre={`${nino.nombres} ${nino.apellidos}`}
          salon={nino.salon}
          onCambio={() => setRecarga((n) => n + 1)}
        />
      )}

      {pestana === "general" && (
        <>
          {/* Datos personales */}
          <section style={{ ...card, marginTop: "1rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Datos personales</h2>
              {puedeEnviarMensajes && nino.userId !== null && (
                <button
                  type="button"
                  onClick={() => setEnviandoCredenciales(true)}
                  title="Envía usuario y clave al WhatsApp del apoderado"
                  style={{
                    padding: "0.4rem 0.9rem",
                    borderRadius: "0.6rem",
                    border: "none",
                    background: "#25d366",
                    color: "white",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  📲 Enviar acceso por WhatsApp
                </button>
              )}
            </div>
            {/* Tres líneas fijas: identidad · contacto (el correo ocupa dos columnas,
            porque el sintético es largo) · acceso. */}
            <style>{`
          .ficha-datos{display:grid;gap:0.9rem;margin-top:0.9rem;grid-template-columns:repeat(4,minmax(0,1fr))}
          .ficha-correo{grid-column:1 / span 2}
          .ficha-clave{grid-column:span 2}
          .ficha-nueva-linea{grid-column-start:1}
          @media (max-width:48rem){.ficha-datos{grid-template-columns:repeat(2,minmax(0,1fr))}}
        `}</style>
            <div className="ficha-datos">
              <Dato etiqueta="Nombres">{nino.nombres}</Dato>
              <Dato etiqueta="Apellidos">{nino.apellidos}</Dato>
              <Dato etiqueta="Documento">
                {nino.docTipo} {nino.docNumero}
              </Dato>
              <Dato etiqueta="Fecha de nacimiento">{nino.fechaNacimiento ?? "—"}</Dato>

              <div className="ficha-correo">
                <Dato etiqueta="Correo">{nino.correo ?? nino.personaEmail ?? "—"}</Dato>
              </div>
              <Dato etiqueta="Teléfono">{nino.telefono ?? "—"}</Dato>
              <Dato etiqueta="Plataforma">{PAIS_NOMBRE[nino.countryCode] ?? nino.countryCode}</Dato>

              <div className="ficha-nueva-linea">
                <Dato etiqueta="Usuario">{nino.username ?? "— sin login —"}</Dato>
              </div>
              <div className="ficha-clave">
                <Dato etiqueta="Clave">
                  {nino.userId === null ? (
                    "— sin login —"
                  ) : !puedeVerClaves ? (
                    <span style={{ color: "var(--texto-suave)", fontWeight: 400 }}>
                      •••••• (solo superadmin)
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        gap: "0.5rem",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      {clave === null ? "••••••" : <ClaveConsultada consulta={clave} />}
                      <button
                        type="button"
                        onClick={() => nino.userId !== null && void verClave(nino.userId)}
                        style={{
                          padding: "0.2rem 0.6rem",
                          borderRadius: "0.5rem",
                          border: "1px solid #e3e7f0",
                          background: "white",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                        }}
                      >
                        {clave === null ? "👁 Ver clave" : "🙈 Ocultar"}
                      </button>
                      {errorClave !== null && (
                        <span style={{ color: "#c62828", fontSize: "0.8rem" }}>{errorClave}</span>
                      )}
                    </span>
                  )}
                </Dato>
              </div>
            </div>
          </section>

          {/* Perfil que creó el niño desde su enlace, y su Welcome. */}
          <PerfilWelcome
            childPersonId={nino.id}
            tieneCuenta={nino.userId !== null}
            puedeEnviar={puedeEnviarMensajes}
          />

          {/* Información académica */}
          <section style={{ ...card, marginTop: "1rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Información académica</h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {nino.meetingUrl !== null && (
                  <a
                    href={nino.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "0.85rem" }}
                  >
                    ▶ Ir a la clase
                  </a>
                )}
                <Link href={`/panel/progreso/${nino.id}`} style={{ fontSize: "0.85rem" }}>
                  📈 Ver progreso
                </Link>
              </div>
            </div>
            <Grid>
              <Dato etiqueta="Campaña">{nino.campania ?? "—"}</Dato>
              <Dato etiqueta="Curso">{cursoLabel(nino.curso)}</Dato>
              <Dato etiqueta="Salón">{nino.salon ?? "— sin matrícula —"}</Dato>
              <Dato etiqueta="Guía">{nino.guia ?? "—"}</Dato>
              <Dato etiqueta="Estado matrícula">{nino.matriculaEstado ?? "—"}</Dato>
              <Dato etiqueta="Próxima sesión">{nino.proximaSesion ?? "sin sesión futura"}</Dato>
            </Grid>
          </section>

          {/* Contrato */}
          <section style={{ ...card, marginTop: "1rem" }}>
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Contrato</h2>
            <Grid>
              {/* De LGS: su número y, aparte, el documento del niño que LGS le
              agrega. Del panel de KIDS: el N° interno, que es el único. */}
              {nc.origen === "LGS" ? (
                <>
                  <Dato etiqueta="N° LGS">{nc.numero}</Dato>
                  <Dato etiqueta="Beneficiario (documento)">{nc.documento ?? "—"}</Dato>
                </>
              ) : (
                <Dato etiqueta="N° de contrato">{nc.numero}</Dato>
              )}
              <Dato etiqueta="Curso">{cursoLabel(nino.tipoCurso)}</Dato>
              <Dato etiqueta="Inicio">{nino.inicio ?? "—"}</Dato>
              <Dato etiqueta="Final">{nino.finalContrato ?? "—"}</Dato>
              <Dato etiqueta="Estado">{nino.contratoEstado ?? "—"}</Dato>
              <Dato etiqueta="Firmado">{nino.firmado === true ? "Sí" : "No"}</Dato>
            </Grid>
          </section>

          {/* Apoderados */}
          <section style={{ ...card, marginTop: "1rem" }}>
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>
              Apoderado{nino.apoderados.length !== 1 ? "s" : ""}
            </h2>
            {nino.apoderados.length === 0 ? (
              <p style={{ color: "var(--texto-suave)", marginTop: "0.6rem" }}>
                Sin apoderados registrados.
              </p>
            ) : (
              <div
                style={{
                  marginTop: "0.6rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {nino.apoderados.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "0.6rem 0.85rem",
                      border: "1px solid #edf0f6",
                      borderRadius: "0.6rem",
                    }}
                  >
                    <strong>{a.nombre}</strong>
                    {a.parentesco !== null && (
                      <span style={{ color: "var(--texto-suave)" }}> ({a.parentesco})</span>
                    )}
                    <div style={{ fontSize: "0.83rem", color: "var(--texto-suave)" }}>
                      {a.docTipo} {a.docNumero}
                      {a.telefono !== null && ` · tel. ${a.telefono}`}
                      {a.email !== null && ` · ${a.email}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
