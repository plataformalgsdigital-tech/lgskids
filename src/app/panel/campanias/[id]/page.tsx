"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/ui/api-fetch";

type Estado = "EN_MATRICULA" | "ACTIVA" | "CERRADA";

interface Curso {
  id: string;
  tipo: "JUNIOR" | "YOUNGSTER";
  inicio: string;
  finalCurso: string;
  niveles: {
    id: string;
    codigo: string;
    nombre: string;
    orden: number;
    duracionMeses: number;
    lecciones: { id: string; orden: number; titulo: string }[];
    cuestionarios: { id: string; tipo: string; titulo: string; leccionOrden: number | null }[];
  }[];
}

interface Detalle {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  finalVenta: string;
  estado: Estado;
  courses: Curso[];
}

interface SlotResumen {
  tipo: string;
  diaSemana: number;
  horaLocal: string;
  duracionMin: number;
}

interface Salon {
  id: string;
  nombre: string;
  guia: string | null;
  horario: SlotResumen[];
  cupo: number;
  ocupados: number;
  activo: boolean;
}

const COLOR_NIVEL: Record<string, string> = {
  ROOKIE: "var(--lgs-verde)",
  CHAMPION: "var(--lgs-cian)",
  ELITE: "var(--lgs-amarillo)",
  LEGENDARY: "var(--lgs-magenta)",
  ULTIMATE: "var(--lgs-purpura)",
};

const NOMBRE_TIPO: Record<string, string> = {
  JUNIOR: "Junior (6–9 años)",
  YOUNGSTER: "Youngster (10–13 años)",
};

const ESTADO_CAMPANIA: Record<Estado, { texto: string; color: string; fondo: string }> = {
  EN_MATRICULA: { texto: "En matrícula", color: "#0d47a1", fondo: "#e3f2fd" },
  ACTIVA: { texto: "Activa", color: "#1b5e20", fondo: "#e8f5e9" },
  CERRADA: { texto: "Inactiva", color: "#5a6172", fondo: "#eceff1" },
};

const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "17:00" + 60 min → "18:00" (reloj de pared, sin zona). */
function horaFin(inicio: string, dur: number): string {
  const [h, m] = inicio.split(":").map(Number);
  const t = (h ?? 0) * 60 + (m ?? 0) + dur;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Agrupa por hora los días: "LUN-MIÉ 17:00-18:00 · SÁB 09:00-11:00 (Club)". */
function resumenHorario(horario: SlotResumen[]): string {
  if (horario.length === 0) return "—";
  const porClave = new Map<string, { dias: number[]; dur: number; tipo: string }>();
  for (const s of horario) {
    const clave = `${s.horaLocal}|${s.tipo}`;
    const g = porClave.get(clave) ?? { dias: [], dur: s.duracionMin, tipo: s.tipo };
    g.dias.push(s.diaSemana);
    porClave.set(clave, g);
  }
  return [...porClave.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, g]) => {
      const hora = clave.split("|")[0]!;
      const etiquetas = g.dias
        .sort((a, b) => a - b)
        .map((d) => DIAS_CORTO[d]?.toUpperCase() ?? "?")
        .join("-");
      return `${etiquetas} ${hora}-${horaFin(hora, g.dur)}${g.tipo === "CLUB" ? " (Club)" : ""}`;
    })
    .join(" · ");
}

/** Quita el prefijo del tipo del nombre del salón ("JUNIOR Salón 01" → "Salón 01"). */
function etiquetaSalon(nombre: string, tipo: string): string {
  return nombre.replace(new RegExp(`^${tipo}\\s+`, "i"), "");
}

export default function DetalleCampaniaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [salonesPorCurso, setSalonesPorCurso] = useState<Record<string, Salon[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [verEstructura, setVerEstructura] = useState(false);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/catalog/campaigns/${params.id}`);
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data: { campania?: Detalle; error?: { message: string } } = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "No se pudo cargar la campaña.");
      return;
    }
    const campania = data.campania ?? null;
    setDetalle(campania);
    if (campania !== null) {
      const entradas = await Promise.all(
        campania.courses.map(async (curso) => {
          const r = await apiFetch(`/api/scheduling/classrooms?courseId=${curso.id}`);
          if (!r.ok) return [curso.id, []] as const;
          const d: { salones: Salon[] } = await r.json();
          return [curso.id, d.salones] as const;
        }),
      );
      setSalonesPorCurso(Object.fromEntries(entradas));
    }
  }, [params.id, router]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  async function generarSalones() {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/scheduling/campaigns/${params.id}/generate`, {
        method: "POST",
      });
      const data: { creados?: number; omitidos?: number; error?: { message: string } } =
        await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudieron generar los salones.");
        return;
      }
      setAviso(
        `Salones generados: ${data.creados} nuevos${
          (data.omitidos ?? 0) > 0 ? `, ${data.omitidos} ya existían` : ""
        }. La guía queda pendiente de asignar.`,
      );
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function eliminarSalon(s: Salon) {
    if (!window.confirm(`¿Eliminar el salón "${s.nombre}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/scheduling/classrooms/${s.id}`, { method: "DELETE" });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo eliminar el salón.");
        return;
      }
      setAviso("Salón eliminado.");
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
        <Link href="/panel/campanias">← Volver a campañas</Link>
      </main>
    );
  }

  if (detalle === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando campaña…</p>
      </main>
    );
  }

  // Filas de la tabla: todos los salones de todos los cursos, con su contexto.
  const filas = detalle.courses.flatMap((curso) =>
    (salonesPorCurso[curso.id] ?? []).map((salon) => ({ curso, salon })),
  );
  const cargandoSalones = Object.keys(salonesPorCurso).length === 0;
  const est = ESTADO_CAMPANIA[detalle.estado];

  const th: React.CSSProperties = {
    padding: "0.5rem 0.6rem",
    textAlign: "left",
    fontWeight: 600,
    color: "var(--texto-suave)",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = { padding: "0.55rem 0.6rem", whiteSpace: "nowrap" };

  return (
    <main style={{ padding: "2rem", maxWidth: "72rem", margin: "0 auto" }}>
      <Link href="/panel/campanias" style={{ fontSize: "0.9rem" }}>
        ← Volver a campañas
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>{detalle.nombre}</h1>
        <span
          style={{
            padding: "0.25rem 0.7rem",
            borderRadius: "1rem",
            fontSize: "0.8rem",
            fontWeight: 700,
            color: est.color,
            background: est.fondo,
          }}
        >
          {est.texto}
        </span>
      </div>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Campaña: {detalle.inicio} → {detalle.fin} (12 meses) · Cierre de matrícula:{" "}
        {detalle.finalVenta}
      </p>

      {aviso !== null && (
        <p style={{ color: "#1b5e20", background: "#e8f5e9", padding: "0.5rem 0.8rem", borderRadius: "0.6rem" }}>
          {aviso}
        </p>
      )}
      {error !== null && (
        <p role="alert" style={{ color: "#c62828" }}>
          {error}
        </p>
      )}

      <section
        style={{
          marginTop: "1rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "1.1rem 1.25rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>
            Cursos de {detalle.nombre} ({filas.length} {filas.length === 1 ? "salón" : "salones"})
          </h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void generarSalones()}
              disabled={ocupado}
              title="Crea los salones de la campaña a partir del catálogo de horarios (guía pendiente)"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.6rem",
                border: "1.5px solid var(--lgs-azul)",
                background: "white",
                color: "var(--lgs-azul-oscuro)",
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: ocupado ? "wait" : "pointer",
              }}
            >
              {ocupado ? "Generando…" : "⚙️ Generar salones del catálogo"}
            </button>
            <Link
              href="/panel/salones"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.6rem",
                background: "var(--lgs-azul)",
                color: "white",
                fontWeight: 700,
                fontSize: "0.85rem",
              }}
            >
              + Agregar salón
            </Link>
          </div>
        </div>

        {cargandoSalones ? (
          <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>Cargando salones…</p>
        ) : filas.length === 0 ? (
          <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>
            Esta campaña aún no tiene salones. Agrégalos en{" "}
            <Link href="/panel/salones">Salones</Link>.
          </p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid #e3e7f0" }}>
                  <th style={th}>Tipo</th>
                  <th style={th}>Salón</th>
                  <th style={th}>Guía</th>
                  <th style={th}>Horario</th>
                  <th style={th}>Inicio curso</th>
                  <th style={th}>Final curso</th>
                  <th style={th}>Cierre matríc.</th>
                  <th style={th}>Cupos</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ curso, salon }) => {
                  const lleno = salon.ocupados >= salon.cupo;
                  return (
                    <tr key={salon.id} style={{ borderBottom: "1px solid #edf0f6", opacity: salon.activo ? 1 : 0.55 }}>
                      <td style={{ ...td, fontWeight: 700, color: "var(--lgs-azul-oscuro)" }}>{curso.tipo}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{etiquetaSalon(salon.nombre, curso.tipo)}</td>
                      <td style={{ ...td, whiteSpace: "normal" }}>
                        {salon.guia ?? <span style={{ color: "var(--texto-suave)" }}>— sin guía —</span>}
                      </td>
                      <td style={{ ...td, whiteSpace: "normal" }}>{resumenHorario(salon.horario)}</td>
                      <td style={td}>{curso.inicio}</td>
                      <td style={td}>{curso.finalCurso}</td>
                      <td style={td}>{detalle.finalVenta}</td>
                      <td style={td}>
                        <span
                          style={{
                            fontWeight: 700,
                            padding: "0.15rem 0.5rem",
                            borderRadius: "0.9rem",
                            background: lleno ? "#fff8e1" : "#e8f5e9",
                            color: lleno ? "#8a6d00" : "#1b5e20",
                          }}
                        >
                          {salon.ocupados}/{salon.cupo}
                        </span>
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            fontWeight: 700,
                            padding: "0.15rem 0.5rem",
                            borderRadius: "0.9rem",
                            background: salon.activo ? "#e8f5e9" : "#ffebee",
                            color: salon.activo ? "#1b5e20" : "#c62828",
                          }}
                        >
                          {salon.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td style={td}>
                        <span style={{ display: "inline-flex", gap: "0.6rem", alignItems: "center" }}>
                          <Link href={`/panel/salones/${salon.id}`} title="Editar salón">
                            ✏️
                          </Link>
                          <button
                            type="button"
                            onClick={() => void eliminarSalon(salon)}
                            disabled={ocupado}
                            title="Eliminar salón"
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.95rem" }}
                          >
                            🗑️
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Estructura curricular (niveles/lecciones) — secundaria, colapsable */}
      <section style={{ marginTop: "1.25rem" }}>
        <button
          type="button"
          onClick={() => setVerEstructura((v) => !v)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "1.05rem",
            fontWeight: 700,
            color: "var(--lgs-azul-oscuro)",
            padding: 0,
          }}
        >
          {verEstructura ? "▾" : "▸"} Estructura curricular (niveles y lecciones)
        </button>
        {verEstructura &&
          detalle.courses.map((curso) => (
            <div key={curso.id} style={{ marginTop: "1rem" }}>
              <h3 style={{ fontSize: "1.05rem", color: "var(--lgs-azul-oscuro)" }}>
                {NOMBRE_TIPO[curso.tipo] ?? curso.tipo}
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {curso.niveles.map((nivel) => (
                  <div
                    key={nivel.id}
                    style={{
                      border: "1px solid #edf0f6",
                      borderTop: `4px solid ${COLOR_NIVEL[nivel.codigo] ?? "var(--lgs-azul)"}`,
                      borderRadius: "0.7rem",
                      padding: "0.9rem",
                    }}
                  >
                    <strong>
                      {nivel.orden}. {nivel.nombre}
                    </strong>
                    <span style={{ color: "var(--texto-suave)", fontSize: "0.8rem" }}>
                      {" "}
                      · {nivel.duracionMeses} {nivel.duracionMeses === 1 ? "mes" : "meses"}
                    </span>
                    <ul style={{ margin: "0.5rem 0 0 1rem", fontSize: "0.85rem" }}>
                      {nivel.lecciones.map((leccion) => (
                        <li key={leccion.id}>
                          {leccion.titulo}
                          <span style={{ color: "var(--texto-suave)" }}> · práctica</span>
                        </li>
                      ))}
                    </ul>
                    <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", fontWeight: 700 }}>🏅 Level Up</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </section>
    </main>
  );
}
