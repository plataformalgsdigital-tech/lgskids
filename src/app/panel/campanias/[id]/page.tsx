"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Detalle {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  estado: "EN_MATRICULA" | "ACTIVA" | "CERRADA";
  courses: {
    id: string;
    tipo: "JUNIOR" | "YOUNGSTER";
    inicio: string;
    finalCurso: string;
    niveles: {
      id: string;
      codigo: string;
      nombre: string;
      orden: number;
      lecciones: { id: string; orden: number; titulo: string }[];
      cuestionarios: { id: string; tipo: string; titulo: string; leccionOrden: number | null }[];
    }[];
  }[];
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
  sesiones: number;
  primeraSesion: string | null;
  ultimaSesion: string | null;
}

const COLOR_NIVEL: Record<string, string> = {
  ROOKIE: "var(--lgs-verde)",
  CHAMPION: "var(--lgs-cian)",
  ELITE: "var(--lgs-amarillo)",
  LEGENDARY: "var(--lgs-magenta)",
};

const NOMBRE_TIPO: Record<string, string> = {
  JUNIOR: "Junior (6–9 años)",
  YOUNGSTER: "Youngster (10–13 años)",
};

const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Resume los slots de un salón: agrupa por hora los días (p. ej. "LUN-MIÉ 16:00"). */
function resumenHorario(horario: SlotResumen[]): string {
  if (horario.length === 0) return "—";
  const porHora = new Map<string, number[]>();
  for (const s of horario) {
    const dias = porHora.get(s.horaLocal) ?? [];
    dias.push(s.diaSemana);
    porHora.set(s.horaLocal, dias);
  }
  return [...porHora.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hora, dias]) => {
      const etiquetas = dias
        .sort((a, b) => a - b)
        .map((d) => DIAS_CORTO[d]?.toUpperCase() ?? "?")
        .join("-");
      return `${etiquetas} ${hora}`;
    })
    .join(" · ");
}

export default function DetalleCampaniaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [salonesPorCurso, setSalonesPorCurso] = useState<Record<string, Salon[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
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
        // Salones de cada curso (permiso salones.ver; si falta, la sección queda vacía).
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
    }
    void cargar();
  }, [params.id, router]);

  if (error !== null) {
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

  return (
    <main style={{ padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <Link href="/panel/campanias" style={{ fontSize: "0.9rem" }}>
        ← Volver a campañas
      </Link>
      <h1 style={{ fontSize: "1.6rem", marginTop: "0.5rem" }}>{detalle.nombre}</h1>
      <p style={{ color: "var(--texto-suave)" }}>
        {detalle.inicio} → {detalle.fin} (fin nominal — el fin real lo definirá la última sesión)
      </p>

      {detalle.courses.map((curso) => (
        <section
          key={curso.id}
          style={{
            marginTop: "1.5rem",
            border: "1px solid #e3e7f0",
            borderRadius: "0.9rem",
            padding: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: "1.2rem", color: "var(--lgs-azul-oscuro)" }}>
            {NOMBRE_TIPO[curso.tipo] ?? curso.tipo}
          </h2>
          <div
            style={{
              marginTop: "0.9rem",
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
                <ul style={{ margin: "0.5rem 0 0 1rem", fontSize: "0.85rem" }}>
                  {nivel.lecciones.map((leccion) => (
                    <li key={leccion.id}>
                      {leccion.titulo}
                      <span style={{ color: "var(--texto-suave)" }}> · práctica</span>
                    </li>
                  ))}
                </ul>
                <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", fontWeight: 700 }}>
                  🏅 Level Up
                </p>
              </div>
            ))}
          </div>

          <SalonesDelCurso salones={salonesPorCurso[curso.id]} />
        </section>
      ))}
    </main>
  );
}

/** Lista los salones de un curso (nombre, guía, horario, ocupación, sesiones). */
function SalonesDelCurso({ salones }: { salones: Salon[] | undefined }) {
  return (
    <div style={{ marginTop: "1.25rem" }}>
      <h3 style={{ fontSize: "1rem", margin: "0 0 0.6rem" }}>
        Salones{salones !== undefined ? ` (${salones.length})` : ""}
      </h3>
      {salones === undefined ? (
        <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>Cargando salones…</p>
      ) : salones.length === 0 ? (
        <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>
          Este curso aún no tiene salones. Agrégalos en{" "}
          <Link href="/panel/salones">Salones</Link>.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--texto-suave)" }}>
                <th style={{ padding: "0.4rem 0.5rem" }}>Salón</th>
                <th style={{ padding: "0.4rem 0.5rem" }}>Guía</th>
                <th style={{ padding: "0.4rem 0.5rem" }}>Horario</th>
                <th style={{ padding: "0.4rem 0.5rem" }}>Cupo</th>
                <th style={{ padding: "0.4rem 0.5rem" }}>Sesiones</th>
                <th style={{ padding: "0.4rem 0.5rem" }} />
              </tr>
            </thead>
            <tbody>
              {salones.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid #edf0f6" }}>
                  <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600 }}>{s.nombre}</td>
                  <td style={{ padding: "0.45rem 0.5rem" }}>
                    {s.guia ?? <span style={{ color: "var(--texto-suave)" }}>— sin guía —</span>}
                  </td>
                  <td style={{ padding: "0.45rem 0.5rem" }}>{resumenHorario(s.horario)}</td>
                  <td style={{ padding: "0.45rem 0.5rem" }}>
                    {s.ocupados}/{s.cupo}
                  </td>
                  <td style={{ padding: "0.45rem 0.5rem" }}>{s.sesiones}</td>
                  <td style={{ padding: "0.45rem 0.5rem" }}>
                    <Link href={`/panel/salones/${s.id}`}>ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
