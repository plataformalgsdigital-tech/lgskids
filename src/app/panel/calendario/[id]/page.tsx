"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Detalle {
  salon: {
    id: string;
    nombre: string;
    guiaUserId: string | null;
    cupo: number;
    activo: boolean;
    meetingUrl: string | null;
    timezone: string;
    holidayCountry: string;
  };
  slots: { tipo: string; diaSemana: number; horaLocal: string; duracionMin: number }[];
  sesiones: { id: string; tipo: string; fecha: string; startsAt: string; numero: number }[];
  suspensiones: string[];
  finReal: string | null;
  campania: {
    campaignId: string;
    campaignNombre: string;
    campaignInicio: string;
    fin: string;
    finalVenta: string;
    cursoInicio: string;
    finalCurso: string;
  } | null;
}

interface Guia {
  id: string;
  nombre: string | null;
  username: string;
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

interface RosterItem {
  enrollmentId: string;
  childPersonId: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  contratoNumero: number;
}

export default function DetalleSalonPage() {
  const params = useParams<{ id: string }>();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Edición del salón
  const [cupoEdit, setCupoEdit] = useState("");
  const [guiaEdit, setGuiaEdit] = useState("");
  // Edición de fechas de campaña (afectan a todos sus salones)
  const [finEdit, setFinEdit] = useState("");
  const [cierreEdit, setCierreEdit] = useState("");

  const cargar = useCallback(async () => {
    const [res, resRoster] = await Promise.all([
      apiFetch(`/api/scheduling/classrooms/${params.id}`),
      apiFetch(`/api/enrollment?classroomId=${params.id}`),
    ]);
    if (res.ok) {
      const d = (await res.json()) as Detalle;
      setDetalle(d);
      setCupoEdit(String(d.salon.cupo));
      setGuiaEdit(d.salon.guiaUserId ?? "");
      if (d.campania !== null) {
        setFinEdit(d.campania.fin);
        setCierreEdit(d.campania.finalVenta);
      }
    }
    if (resRoster.ok) {
      const data: { roster: RosterItem[] } = await resRoster.json();
      setRoster(data.roster);
    }
  }, [params.id]);

  useEffect(() => {
    async function inicial() {
      await cargar();
      const g = await apiFetch("/api/identity/guides");
      if (g.ok) {
        const data: { guias: Guia[] } = await g.json();
        setGuias(data.guias);
      }
    }
    void inicial();
  }, [cargar]);

  async function guardarSalon(patch: { cupo?: number; guiaUserId?: string | null; activo?: boolean }) {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/scheduling/classrooms/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo guardar el salón.");
        return;
      }
      setAviso("Salón actualizado.");
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function guardarFechasCampania() {
    if (detalle?.campania == null) return;
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/catalog/campaigns/${detalle.campania.campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fin: finEdit, finalVenta: cierreEdit }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudieron guardar las fechas.");
        return;
      }
      setAviso("Fechas de la campaña actualizadas (afecta a todos sus salones).");
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function accion(ruta: string, body?: object) {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/scheduling/classrooms/${params.id}/${ruta}`, {
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
      <Link href="/panel/calendario" style={{ fontSize: "0.9rem" }}>
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
        <h1 style={{ fontSize: "1.6rem", marginTop: "0.5rem" }}>
          {detalle.salon.nombre}{" "}
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "0.2rem 0.6rem",
              borderRadius: "1rem",
              verticalAlign: "middle",
              background: detalle.salon.activo ? "#e8f5e9" : "#ffebee",
              color: detalle.salon.activo ? "#1b5e20" : "#c62828",
            }}
          >
            {detalle.salon.activo ? "Activo" : "Inactivo"}
          </span>
        </h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            style={boton}
            disabled={ocupado}
            onClick={() => void guardarSalon({ activo: !detalle.salon.activo })}
            title={
              detalle.salon.activo
                ? "Al desactivar, el salón deja de ofrecerse en el wizard de contratos"
                : "Reactivar el salón"
            }
          >
            {detalle.salon.activo ? "🚫 Desactivar" : "✅ Activar"}
          </button>
          <button style={boton} disabled={ocupado} onClick={() => void accion("regenerate")}>
            🔄 Regenerar sesiones
          </button>
        </div>
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

      {/* Editar salón: cupo + guía */}
      <section
        style={{
          marginTop: "1rem",
          padding: "1rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.8rem",
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <strong style={{ width: "100%", fontSize: "0.95rem" }}>Editar salón</strong>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", width: "6rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Cupo (N.º usuarios)</span>
          <input
            type="number"
            min={1}
            max={50}
            value={cupoEdit}
            onChange={(e) => setCupoEdit(e.target.value)}
            style={{ padding: "0.45rem", borderRadius: "0.5rem", border: "1.5px solid #d8dce6" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 14rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Guía</span>
          <select
            value={guiaEdit}
            onChange={(e) => setGuiaEdit(e.target.value)}
            style={{ padding: "0.45rem", borderRadius: "0.5rem", border: "1.5px solid #d8dce6" }}
          >
            <option value="">— Sin guía —</option>
            {guias.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre ?? g.username}
              </option>
            ))}
          </select>
        </label>
        <button
          style={{ ...boton, borderColor: "var(--lgs-verde)", background: "var(--lgs-verde)", color: "#1b2a10" }}
          disabled={ocupado}
          onClick={() =>
            void guardarSalon({ cupo: Number(cupoEdit), guiaUserId: guiaEdit || null })
          }
        >
          Guardar salón
        </button>
      </section>

      {/* Fechas de la campaña (compartidas por todos sus salones) */}
      {detalle.campania !== null && (
        <section
          style={{
            marginTop: "0.75rem",
            padding: "1rem",
            border: "1px solid #e3e7f0",
            borderRadius: "0.8rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div style={{ width: "100%" }}>
            <strong style={{ fontSize: "0.95rem" }}>
              Campaña: {detalle.campania.campaignNombre}
            </strong>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.8rem", color: "var(--texto-suave)" }}>
              Inicio campaña {detalle.campania.campaignInicio} · Inicio curso{" "}
              {detalle.campania.cursoInicio} · Fin curso nominal {detalle.campania.finalCurso}. Editar
              estas fechas afecta a <strong>todos los salones</strong> de la campaña.
            </p>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Fin de campaña (12 meses)</span>
            <input
              type="date"
              value={finEdit}
              onChange={(e) => setFinEdit(e.target.value)}
              style={{ padding: "0.45rem", borderRadius: "0.5rem", border: "1.5px solid #d8dce6" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Cierre de matrícula</span>
            <input
              type="date"
              value={cierreEdit}
              onChange={(e) => setCierreEdit(e.target.value)}
              style={{ padding: "0.45rem", borderRadius: "0.5rem", border: "1.5px solid #d8dce6" }}
            />
          </label>
          <button style={boton} disabled={ocupado} onClick={() => void guardarFechasCampania()}>
            Guardar fechas
          </button>
        </section>
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
          Alumnos matriculados ({roster.length}/{detalle.salon.cupo})
        </h2>
        {roster.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
            Sin matrículas todavía. La lista se deriva de las matrículas activas — se matricula
            desde la sección Contratos.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {roster.map((r) => (
              <div
                key={r.enrollmentId}
                style={{
                  padding: "0.45rem 0.75rem",
                  border: "1px solid #edf0f6",
                  borderRadius: "0.5rem",
                  fontSize: "0.85rem",
                }}
              >
                <strong>
                  {r.apellidos}, {r.nombres}
                </strong>{" "}
                <span style={{ color: "var(--texto-suave)" }}>
                  · contrato N° {r.contratoNumero}
                  {r.username !== null && ` · ${r.username}`}
                </span>{" "}
                <Link href={`/panel/progreso/${r.childPersonId}`} title="Ver progreso y medallas">
                  📈
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

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
              <Link
                href={`/panel/calendario/${params.id}/sesion/${s.id}`}
                style={{ color: "inherit", flex: 1 }}
                title="Abrir asistencia de esta sesión"
              >
                <strong>{s.tipo === "CLUB" ? "Club" : `Sesión ${s.numero}`}</strong> ·{" "}
                {DIAS[new Date(`${s.fecha}T12:00:00Z`).getUTCDay()]} {s.fecha} ·{" "}
                {horaLocal(s.startsAt)}
              </Link>
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
