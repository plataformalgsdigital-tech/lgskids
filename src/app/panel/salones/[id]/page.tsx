"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

interface Detalle {
  salon: {
    id: string;
    nombre: string;
    cupo: number;
    meetingUrl: string | null;
    timezone: string;
    holidayCountry: string;
  };
  slots: { tipo: string; diaSemana: number; horaLocal: string; duracionMin: number }[];
  sesiones: { id: string; tipo: string; fecha: string; startsAt: string; numero: number }[];
  suspensiones: string[];
  finReal: string | null;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const boton: CSSProperties = {
  padding: "0.45rem 1rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
};

export default function DetalleSalonPage() {
  const params = useParams<{ id: string }>();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/scheduling/classrooms/${params.id}`);
    if (res.ok) {
      setDetalle((await res.json()) as Detalle);
    }
  }, [params.id]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  async function accion(ruta: string, body?: object) {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await fetch(`/api/scheduling/classrooms/${params.id}/${ruta}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      const data: { sesiones?: number; error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "La operación falló.");
        return;
      }
      setAviso(`Listo: ${data.sesiones} sesiones regeneradas.`);
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  function suspender(fecha: string) {
    const motivo = window.prompt(`Motivo para suspender la sesión del ${fecha} (obligatorio):`);
    if (motivo !== null && motivo.trim().length >= 5) {
      void accion("suspend", { fecha, motivo });
    } else if (motivo !== null) {
      setError("El motivo debe tener al menos 5 caracteres.");
    }
  }

  if (detalle === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando salón…</p>
      </main>
    );
  }

  const horaLocal = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <main style={{ padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <Link href="/panel/salones" style={{ fontSize: "0.9rem" }}>
        ← Volver a salones
      </Link>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.6rem", marginTop: "0.5rem" }}>{detalle.salon.nombre}</h1>
        <button style={boton} disabled={ocupado} onClick={() => void accion("regenerate")}>
          🔄 Regenerar sesiones
        </button>
      </div>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Cupo {detalle.salon.cupo} · {detalle.salon.timezone} · feriados{" "}
        {detalle.salon.holidayCountry}
        {detalle.finReal !== null && (
          <>
            {" · "}
            <strong>fin real: {detalle.finReal}</strong>
          </>
        )}
      </p>
      <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
        Horario:{" "}
        {detalle.slots
          .map(
            (s) => `${s.tipo === "CLUB" ? "Club" : "Sesión"} ${DIAS[s.diaSemana]} ${s.horaLocal}`,
          )
          .join(" · ")}
      </p>
      {detalle.salon.meetingUrl !== null && (
        <p style={{ fontSize: "0.85rem" }}>
          Enlace: <a href={detalle.salon.meetingUrl}>{detalle.salon.meetingUrl}</a>
        </p>
      )}
      {detalle.suspensiones.length > 0 && (
        <p
          style={{
            fontSize: "0.85rem",
            color: "#8a6d00",
            background: "#fff8e1",
            padding: "0.5rem 0.8rem",
            borderRadius: "0.6rem",
            marginTop: "0.5rem",
          }}
        >
          Días suspendidos (corridos al final): {detalle.suspensiones.join(", ")}
        </p>
      )}
      {aviso !== null && (
        <p
          style={{
            marginTop: "0.5rem",
            color: "#1b5e20",
            background: "#e8f5e9",
            padding: "0.5rem 0.8rem",
            borderRadius: "0.6rem",
          }}
        >
          {aviso}
        </p>
      )}
      {error !== null && (
        <p role="alert" style={{ marginTop: "0.5rem", color: "#c62828" }}>
          {error}
        </p>
      )}

      <section style={{ marginTop: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.6rem" }}>
          Sesiones ({detalle.sesiones.length})
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
            gap: "0.5rem",
          }}
        >
          {detalle.sesiones.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 0.75rem",
                border: "1px solid #edf0f6",
                borderLeft: `4px solid ${s.tipo === "CLUB" ? "var(--lgs-amarillo)" : "var(--lgs-azul)"}`,
                borderRadius: "0.5rem",
                fontSize: "0.85rem",
              }}
            >
              <span>
                <strong>{s.tipo === "CLUB" ? "Club" : `Sesión ${s.numero}`}</strong> ·{" "}
                {DIAS[new Date(`${s.fecha}T12:00:00Z`).getUTCDay()]} {s.fecha} ·{" "}
                {horaLocal(s.startsAt)}
              </span>
              <button
                style={{ ...boton, padding: "0.2rem 0.5rem" }}
                disabled={ocupado}
                onClick={() => suspender(s.fecha)}
                title="Suspender este día"
              >
                ⏸
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
