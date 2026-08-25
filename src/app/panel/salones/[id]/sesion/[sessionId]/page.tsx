"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Fila {
  childPersonId: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  paisContrato: string;
  feriadoEnSuPais: boolean;
  marca: { estado: "PRESENTE" | "AUSENTE" | "JUSTIFICADO"; justificacion: string | null } | null;
}

interface Lista {
  sesion: {
    id: string;
    classroomId: string;
    courseId: string;
    salon: string;
    tipo: string;
    fecha: string;
    numero: number;
    meetingUrl: string | null;
  };
  lista: Fila[];
}

interface Quiz {
  id: string;
  tipo: string;
  titulo: string;
  nivel: string;
  nivelOrden: number;
  leccionOrden: number | null;
}

type Estado = "PRESENTE" | "AUSENTE" | "JUSTIFICADO";

const boton: CSSProperties = {
  padding: "0.35rem 0.7rem",
  borderRadius: "0.5rem",
  border: "1px solid #e3e7f0",
  background: "white",
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
};

const COLOR_ESTADO: Record<Estado, { bg: string; fg: string }> = {
  PRESENTE: { bg: "#e8f5e9", fg: "#1b5e20" },
  AUSENTE: { bg: "#ffebee", fg: "#c62828" },
  JUSTIFICADO: { bg: "#fff8e1", fg: "#8a6d00" },
};

export default function SesionPage() {
  const params = useParams<{ id: string; sessionId: string }>();
  const [lista, setLista] = useState<Lista | null>(null);
  const [marcas, setMarcas] = useState<Map<string, { estado: Estado; justificacion: string }>>(
    new Map(),
  );
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizPara, setQuizPara] = useState<string | null>(null); // childPersonId
  const [quizId, setQuizId] = useState("");
  const [score, setScore] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/attendance/sessions/${params.sessionId}`);
    if (!res.ok) return;
    const data = (await res.json()) as Lista;
    setLista(data);
    const iniciales = new Map<string, { estado: Estado; justificacion: string }>();
    for (const fila of data.lista) {
      if (fila.marca !== null) {
        iniciales.set(fila.childPersonId, {
          estado: fila.marca.estado,
          justificacion: fila.marca.justificacion ?? "",
        });
      }
    }
    setMarcas(iniciales);
    const resQ = await apiFetch(`/api/catalog/courses/${data.sesion.courseId}/quizzes`);
    if (resQ.ok) {
      const dataQ: { cuestionarios: Quiz[] } = await resQ.json();
      setQuizzes(dataQ.cuestionarios);
    }
  }, [params.sessionId]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  function setEstado(childId: string, estado: Estado) {
    setMarcas((prev) => {
      const nuevo = new Map(prev);
      const actual = nuevo.get(childId);
      nuevo.set(childId, { estado, justificacion: actual?.justificacion ?? "" });
      return nuevo;
    });
  }

  function setJustificacion(childId: string, justificacion: string) {
    setMarcas((prev) => {
      const nuevo = new Map(prev);
      const actual = nuevo.get(childId);
      if (actual) nuevo.set(childId, { ...actual, justificacion });
      return nuevo;
    });
  }

  async function guardar() {
    if (lista === null) return;
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const payload = [...marcas.entries()].map(([childPersonId, m]) => ({
        childPersonId,
        estado: m.estado,
        justificacion: m.estado === "JUSTIFICADO" ? m.justificacion : null,
      }));
      if (payload.length === 0) {
        setError("Marca al menos un niño.");
        return;
      }
      const res = await apiFetch(`/api/attendance/sessions/${params.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcas: payload }),
      });
      const data: { marcadas?: number; error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo guardar.");
        return;
      }
      setAviso(`Asistencia guardada (${data.marcadas} marcas).`);
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function registrarQuiz() {
    if (quizPara === null || quizId === "" || score === "") return;
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch("/api/assessment/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childPersonId: quizPara, quizId, score: Number(score) }),
      });
      const data: { aprobado?: boolean; tipo?: string; error?: { message: string } } =
        await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo registrar el intento.");
        return;
      }
      setAviso(
        data.aprobado === true
          ? `✅ Aprobado con ${score}/100${data.tipo === "LEVEL_UP" ? " — ¡Level Up!" : ""}`
          : `Registrado: ${score}/100 (no aprobado, puede reintentar)`,
      );
      setQuizPara(null);
      setQuizId("");
      setScore("");
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  if (lista === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando sesión…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "58rem", margin: "0 auto" }}>
      <Link href={`/panel/salones/${params.id}`} style={{ fontSize: "0.9rem" }}>
        ← Volver al salón
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>
        {lista.sesion.tipo === "CLUB" ? "Club" : `Sesión ${lista.sesion.numero}`} ·{" "}
        {lista.sesion.salon}
      </h1>
      <p style={{ color: "var(--texto-suave)" }}>{lista.sesion.fecha}</p>
      {lista.sesion.meetingUrl !== null && (
        <a
          href={lista.sesion.meetingUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            marginTop: "0.4rem",
            padding: "0.5rem 1rem",
            borderRadius: "0.6rem",
            background: "var(--lgs-azul)",
            color: "white",
            fontWeight: 700,
            fontSize: "0.9rem",
          }}
        >
          🎥 Ir a Zoom
        </a>
      )}

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

      <section
        style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        {lista.lista.length === 0 && (
          <p style={{ color: "var(--texto-suave)" }}>Este salón no tiene alumnos matriculados.</p>
        )}
        {lista.lista.map((fila) => {
          const marca = marcas.get(fila.childPersonId);
          return (
            <div
              key={fila.childPersonId}
              style={{
                padding: "0.7rem 1rem",
                border: "1px solid #e3e7f0",
                borderRadius: "0.7rem",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.6rem",
              }}
            >
              <div style={{ flex: "1 1 14rem" }}>
                <strong>
                  {fila.apellidos}, {fila.nombres}
                </strong>{" "}
                <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  {fila.paisContrato}
                  {fila.username !== null && ` · ${fila.username}`}
                </span>
                {fila.feriadoEnSuPais && (
                  <div
                    style={{
                      marginTop: "0.2rem",
                      fontSize: "0.78rem",
                      color: "#8a6d00",
                      background: "#fff8e1",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "0.9rem",
                      display: "inline-block",
                    }}
                  >
                    🎉 Feriado en {fila.paisContrato}: la ausencia puede justificarse
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.3rem" }}>
                {(["PRESENTE", "AUSENTE", "JUSTIFICADO"] as Estado[]).map((estado) => {
                  const activo = marca?.estado === estado;
                  const color = COLOR_ESTADO[estado];
                  return (
                    <button
                      key={estado}
                      onClick={() => setEstado(fila.childPersonId, estado)}
                      style={{
                        ...boton,
                        background: activo ? color.bg : "white",
                        color: activo ? color.fg : "inherit",
                        borderColor: activo ? color.fg : "#e3e7f0",
                      }}
                    >
                      {estado === "PRESENTE"
                        ? "✔ Presente"
                        : estado === "AUSENTE"
                          ? "✘ Ausente"
                          : "📝 Justificado"}
                    </button>
                  );
                })}
                <button
                  title="Registrar cuestionario"
                  style={boton}
                  onClick={() => {
                    setQuizPara(quizPara === fila.childPersonId ? null : fila.childPersonId);
                    setQuizId("");
                    setScore("");
                  }}
                >
                  🧠 Quiz
                </button>
              </div>
              {marca?.estado === "JUSTIFICADO" && (
                <input
                  placeholder="Justificación (obligatoria)…"
                  value={marca.justificacion}
                  onChange={(e) => setJustificacion(fila.childPersonId, e.target.value)}
                  style={{
                    flexBasis: "100%",
                    padding: "0.45rem 0.65rem",
                    borderRadius: "0.5rem",
                    border: "1.5px solid #d8dce6",
                    fontSize: "0.85rem",
                  }}
                />
              )}
              {quizPara === fila.childPersonId && (
                <div
                  style={{
                    flexBasis: "100%",
                    display: "flex",
                    gap: "0.4rem",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <select
                    value={quizId}
                    onChange={(e) => setQuizId(e.target.value)}
                    style={{
                      padding: "0.4rem",
                      borderRadius: "0.5rem",
                      border: "1.5px solid #d8dce6",
                      fontSize: "0.85rem",
                      flex: "1 1 16rem",
                    }}
                  >
                    <option value="">— Elegir cuestionario —</option>
                    {quizzes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.nivel} · {q.tipo === "LEVEL_UP" ? "🏅 Level Up" : q.titulo}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0-100"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    style={{
                      width: "6rem",
                      padding: "0.4rem",
                      borderRadius: "0.5rem",
                      border: "1.5px solid #d8dce6",
                      fontSize: "0.85rem",
                    }}
                  />
                  <button
                    style={{ ...boton, borderColor: "var(--lgs-verde)" }}
                    disabled={ocupado || quizId === "" || score === ""}
                    onClick={() => void registrarQuiz()}
                  >
                    Registrar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {lista.lista.length > 0 && (
        <button
          onClick={() => void guardar()}
          disabled={ocupado}
          style={{
            marginTop: "1.25rem",
            padding: "0.7rem 1.6rem",
            borderRadius: "0.7rem",
            border: "none",
            background: ocupado ? "#9e9e9e" : "var(--lgs-verde)",
            color: "#1b2a10",
            fontWeight: 700,
            fontSize: "1rem",
            cursor: ocupado ? "wait" : "pointer",
          }}
        >
          {ocupado ? "Guardando…" : "💾 Guardar asistencia"}
        </button>
      )}
    </main>
  );
}
