"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { apiFetch } from "@/ui/api-fetch";

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

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>{etiqueta}</div>
      <div style={{ fontWeight: 600 }}>{children}</div>
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

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch(`/api/people/ninos/${params.id}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data: { nino?: Nino; error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo cargar el niño.");
        return;
      }
      setNino(data.nino ?? null);
    }
    void cargar();
  }, [params.id, router]);

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
              ID: <strong>{nino.docNumero}</strong> · Contrato:{" "}
              <strong>
                {nino.externalRef ??
                  (nino.contratoNumero !== null ? `N° ${nino.contratoNumero}` : "—")}
              </strong>{" "}
              · Programa: <strong>{nino.campania ?? "—"}</strong> ({cursoLabel(nino.curso)}) ·
              Estado:{" "}
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

      {/* Datos personales */}
      <section style={{ ...card, marginTop: "1rem" }}>
        <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Datos personales</h2>
        <Grid>
          <Dato etiqueta="Nombres">{nino.nombres}</Dato>
          <Dato etiqueta="Apellidos">{nino.apellidos}</Dato>
          <Dato etiqueta="Documento">
            {nino.docTipo} {nino.docNumero}
          </Dato>
          <Dato etiqueta="Fecha de nacimiento">{nino.fechaNacimiento ?? "—"}</Dato>
          <Dato etiqueta="Correo">{nino.correo ?? nino.personaEmail ?? "—"}</Dato>
          <Dato etiqueta="Teléfono">{nino.telefono ?? "—"}</Dato>
          <Dato etiqueta="Usuario">{nino.username ?? "— sin login —"}</Dato>
          <Dato etiqueta="Plataforma">{PAIS_NOMBRE[nino.countryCode] ?? nino.countryCode}</Dato>
        </Grid>
      </section>

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
          <Dato etiqueta="N° interno">
            {nino.contratoNumero !== null ? `N° ${nino.contratoNumero}` : "—"}
          </Dato>
          <Dato etiqueta="N° LGS">{nino.externalRef ?? "—"}</Dato>
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
            style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
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
    </main>
  );
}
