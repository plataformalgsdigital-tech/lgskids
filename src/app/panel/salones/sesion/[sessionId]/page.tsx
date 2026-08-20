"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface SesionDetalle {
  sesion: { id: string; tipo: string; fecha: string; horaLocal: string; numero: number; duracionMin: number };
  salon: {
    id: string;
    nombre: string;
    cupo: number;
    timezone: string;
    holidayCountry: string;
    meetingUrl: string | null;
  };
  curso: { id: string; tipo: string; campania: string };
  guia: { userId: string; nombre: string; pais: string } | null;
}

interface Inscrito {
  childPersonId: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  paisContrato: string;
  marca: { estado: "PRESENTE" | "AUSENTE" | "JUSTIFICADO"; justificacion: string | null } | null;
}

interface Guia {
  id: string;
  nombre: string | null;
  username: string;
}

const NOMBRE_TIPO_CURSO: Record<string, string> = {
  JUNIOR: "Junior (6–9)",
  YOUNGSTER: "Youngster (10–13)",
};
const PAIS_NOMBRE: Record<string, string> = {
  CL: "Chile",
  CO: "Colombia",
  EC: "Ecuador",
  PE: "Perú",
};
const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_LARGO = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2026-06-30" → "martes, 30 de junio de 2026" (sin desfase de zona). */
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const fecha = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
  return `${DIAS_LARGO[fecha.getDay()]}, ${d} de ${MESES_LARGO[(m ?? 1) - 1]} de ${y}`;
}

const card: CSSProperties = {
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1.25rem",
};
const boton: CSSProperties = {
  padding: "0.55rem 1rem",
  borderRadius: "0.6rem",
  border: "1px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.9rem",
  cursor: "pointer",
  textDecoration: "none",
  color: "inherit",
  display: "inline-block",
};

export default function ResumenSesionPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [detalle, setDetalle] = useState<SesionDetalle | null>(null);
  const [inscritos, setInscritos] = useState<Inscrito[] | null>(null);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [mostrarSuspender, setMostrarSuspender] = useState(false);
  const [nuevoGuia, setNuevoGuia] = useState("");
  const [mostrarCambioGuia, setMostrarCambioGuia] = useState(false);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/scheduling/sessions/${params.sessionId}`);
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data: SesionDetalle & { error?: { message: string } } = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "No se pudo cargar la sesión.");
      return;
    }
    setDetalle(data);
    setNuevoGuia(data.guia?.userId ?? "");
    const resA = await apiFetch(`/api/attendance/sessions/${params.sessionId}`);
    if (resA.ok) {
      const dataA: { lista: Inscrito[] } = await resA.json();
      setInscritos(dataA.lista);
    } else {
      setInscritos([]);
    }
    const resG = await apiFetch("/api/identity/guides");
    if (resG.ok) {
      const dataG: { guias: Guia[] } = await resG.json();
      setGuias(dataG.guias);
    }
  }, [params.sessionId, router]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  async function suspender() {
    if (detalle === null) return;
    if (motivo.trim().length < 5) {
      setError("El motivo es obligatorio (mínimo 5 caracteres).");
      return;
    }
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/scheduling/classrooms/${detalle.salon.id}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: detalle.sesion.fecha, motivo: motivo.trim() }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo suspender.");
        return;
      }
      setAviso("Día suspendido. La sesión se corrió al final del curso.");
      setMostrarSuspender(false);
      setMotivo("");
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarGuia() {
    if (detalle === null) return;
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/scheduling/classrooms/${detalle.salon.id}/guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guiaUserId: nuevoGuia === "" ? null : nuevoGuia }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo cambiar el guía.");
        return;
      }
      setAviso("Guía actualizado.");
      setMostrarCambioGuia(false);
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  if (error !== null && detalle === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p role="alert" style={{ color: "#c62828" }}>
          {error}
        </p>
        <Link href="/panel/salones">← Volver a salones</Link>
      </main>
    );
  }
  if (detalle === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando sesión…</p>
      </main>
    );
  }

  const asistieron = (inscritos ?? []).filter((i) => i.marca?.estado === "PRESENTE").length;
  const totalInscritos = inscritos?.length ?? 0;
  const lleno = totalInscritos >= detalle.salon.cupo;
  const nombreEvento =
    detalle.sesion.tipo === "CLUB" ? "Club" : `Sesión ${detalle.sesion.numero}`;

  return (
    <main style={{ padding: "2rem", maxWidth: "62rem", margin: "0 auto" }}>
      <Link href="/panel/salones" style={{ fontSize: "0.9rem" }}>
        ← Volver a salones
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>📅 Detalles de la sesión</h1>

      {aviso !== null && (
        <p
          style={{
            marginTop: "0.6rem",
            color: "#1b5e20",
            background: "#e8f5e9",
            padding: "0.55rem 0.85rem",
            borderRadius: "0.6rem",
          }}
        >
          {aviso}
        </p>
      )}
      {error !== null && (
        <p role="alert" style={{ marginTop: "0.6rem", color: "#c62828" }}>
          {error}
        </p>
      )}

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Información del evento */}
        <section style={card}>
          <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Información del evento</h2>
          <p style={{ margin: "0.4rem 0" }}>
            <span
              style={{
                background: "#e3f2fd",
                color: "#0d47a1",
                padding: "0.15rem 0.55rem",
                borderRadius: "0.5rem",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              {detalle.sesion.tipo}
            </span>{" "}
            <strong>{nombreEvento}</strong> ·{" "}
            {NOMBRE_TIPO_CURSO[detalle.curso.tipo] ?? detalle.curso.tipo}
          </p>
          <p style={{ margin: "0.3rem 0", color: "var(--texto-suave)" }}>
            📅 {fechaLarga(detalle.sesion.fecha)}
          </p>
          <p style={{ margin: "0.3rem 0", color: "var(--texto-suave)" }}>
            🕓 {detalle.sesion.horaLocal} ({detalle.sesion.duracionMin} min)
          </p>
          <p style={{ margin: "0.3rem 0", color: "var(--texto-suave)" }}>
            👥 Límite: {detalle.salon.cupo} · Salón {detalle.salon.nombre} · Campaña{" "}
            {detalle.curso.campania}
          </p>
          <p style={{ margin: "0.3rem 0" }}>
            🔗{" "}
            {detalle.salon.meetingUrl !== null ? (
              <a href={detalle.salon.meetingUrl} target="_blank" rel="noreferrer">
                Enlace de la sesión
              </a>
            ) : (
              <span style={{ color: "var(--texto-suave)" }}>Sin enlace configurado</span>
            )}
          </p>
        </section>

        {/* Información del guía */}
        <section style={card}>
          <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Información del guía</h2>
          {detalle.guia !== null ? (
            <>
              <p style={{ margin: "0.4rem 0" }}>👤 <strong>{detalle.guia.nombre}</strong></p>
              <p style={{ margin: "0.3rem 0", color: "var(--texto-suave)" }}>
                País: {PAIS_NOMBRE[detalle.guia.pais] ?? detalle.guia.pais}
              </p>
            </>
          ) : (
            <p style={{ color: "var(--texto-suave)" }}>Este salón no tiene guía asignado.</p>
          )}
          <button
            type="button"
            onClick={() => setMostrarCambioGuia((v) => !v)}
            style={{ ...boton, marginTop: "0.5rem" }}
          >
            🔀 Cambiar guía
          </button>
          {mostrarCambioGuia && (
            <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              <select
                value={nuevoGuia}
                onChange={(e) => setNuevoGuia(e.target.value)}
                style={{ ...boton, fontWeight: 400, cursor: "auto", flex: "1 1 12rem" }}
              >
                <option value="">— Sin guía —</option>
                {guias.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre ?? g.username}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => void cambiarGuia()}
                style={{ ...boton, borderColor: "var(--lgs-verde)" }}
              >
                Guardar
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Acciones */}
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        {detalle.salon.meetingUrl !== null && (
          <a href={detalle.salon.meetingUrl} target="_blank" rel="noreferrer" style={{ ...boton, borderColor: "var(--lgs-azul)" }}>
            ▶ Ir al evento
          </a>
        )}
        <Link
          href={`/panel/salones/${detalle.salon.id}/sesion/${detalle.sesion.id}`}
          style={{ ...boton, borderColor: "var(--lgs-azul)" }}
        >
          ✔ Gestionar asistencia
        </Link>
        <button type="button" onClick={() => setMostrarSuspender((v) => !v)} style={boton}>
          ⏸ Suspender este día
        </button>
      </div>

      {mostrarSuspender && (
        <div style={{ ...card, marginTop: "0.8rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Motivo de la suspensión (obligatorio)…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            style={{ flex: "1 1 18rem", padding: "0.5rem 0.65rem", borderRadius: "0.5rem", border: "1.5px solid #d8dce6" }}
          />
          <button type="button" disabled={ocupado} onClick={() => void suspender()} style={{ ...boton, borderColor: "#e57373", color: "#c62828" }}>
            Confirmar suspensión
          </button>
        </div>
      )}

      {/* Usuarios inscritos */}
      <section style={{ ...card, marginTop: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>
            Usuarios inscritos ({totalInscritos}/{detalle.salon.cupo})
          </h2>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <span style={{ background: "#e8f5e9", color: "#1b5e20", padding: "0.2rem 0.6rem", borderRadius: "1rem", fontSize: "0.8rem", fontWeight: 700 }}>
              ✓ Asistieron: {asistieron}
            </span>
            {lleno && (
              <span style={{ background: "#ffebee", color: "#c62828", padding: "0.2rem 0.6rem", borderRadius: "1rem", fontSize: "0.8rem", fontWeight: 700 }}>
                Lleno
              </span>
            )}
          </div>
        </div>

        <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {inscritos === null ? (
            <p style={{ color: "var(--texto-suave)" }}>Cargando inscritos…</p>
          ) : inscritos.length === 0 ? (
            <p style={{ color: "var(--texto-suave)" }}>
              Sin matrículas todavía. La lista se deriva de las matrículas activas.
            </p>
          ) : (
            inscritos.map((i) => {
              const estado = i.marca?.estado ?? null;
              const badge =
                estado === "PRESENTE"
                  ? { txt: "✓ Asistió", bg: "#e8f5e9", fg: "#1b5e20" }
                  : estado === "AUSENTE"
                    ? { txt: "No asistió", bg: "#eceff1", fg: "#546e7a" }
                    : estado === "JUSTIFICADO"
                      ? { txt: "Justificado", bg: "#fff8e1", fg: "#8a6d00" }
                      : { txt: "— sin marcar", bg: "#f5f5f5", fg: "#9e9e9e" };
              return (
                <div
                  key={i.childPersonId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    padding: "0.55rem 0.75rem",
                    border: "1px solid #edf0f6",
                    borderRadius: "0.6rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>
                      {i.apellidos}, {i.nombres}
                    </strong>{" "}
                    <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                      {i.paisContrato}
                      {i.username !== null && ` · ${i.username}`}
                    </span>
                  </div>
                  <span
                    style={{
                      background: badge.bg,
                      color: badge.fg,
                      padding: "0.2rem 0.6rem",
                      borderRadius: "1rem",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                    }}
                  >
                    {badge.txt}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
