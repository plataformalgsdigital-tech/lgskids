"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { descargarCsv } from "@/ui/csv";

/**
 * Servicio › Asistencia: los niños que NO asistieron a sus sesiones. Abre en el
 * día ANTERIOR (en el reloj de quien mira), que es la lista que servicio llama
 * cada mañana. Las fechas son las locales de cada salón.
 */

interface Fila {
  attendanceId: string;
  sessionId: string;
  fecha: string;
  hora: string;
  tipoSesion: string;
  estado: "AUSENTE" | "JUSTIFICADO";
  justificacion: string | null;
  childPersonId: string;
  nombre: string;
  documento: string;
  username: string | null;
  pais: string;
  campania: string | null;
  curso: string | null;
  salon: string;
  guia: string | null;
  apoderado: string | null;
  telefono: string | null;
}

interface Salon {
  id: string;
  nombre: string;
  curso: string;
  campania: string;
}

interface Campania {
  id: string;
  nombre: string;
}

const TIPO: Record<string, string> = { SESION: "Sesión", CLUB: "Club", TALLER: "Taller" };

const campo: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  width: "100%",
};
const rotulo: CSSProperties = { fontSize: "0.75rem", fontWeight: 700 };
const celda: CSSProperties = {
  padding: "0.5rem 0.6rem",
  borderBottom: "1px solid #eef1f7",
  verticalAlign: "top",
};

/** Fecha local de hoy + `delta` días, YYYY-MM-DD. */
function diaLocal(delta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ServicioAsistenciaPage() {
  const ayer = diaLocal(-1);
  const [desde, setDesde] = useState(ayer);
  const [hasta, setHasta] = useState(ayer);
  const [buscar, setBuscar] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [curso, setCurso] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [estado, setEstado] = useState("");
  const [campanias, setCampanias] = useState<Campania[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [tope, setTope] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function catalogos() {
      const [rc, rs] = await Promise.all([
        apiFetch("/api/catalog/campaigns"),
        apiFetch("/api/scheduling/classrooms"),
      ]);
      if (rc.ok) setCampanias(((await rc.json()) as { campanias: Campania[] }).campanias);
      if (rs.ok) setSalones(((await rs.json()) as { salones: Salon[] }).salones);
    }
    void catalogos();
  }, []);

  const cargar = useCallback(async () => {
    setError(null);
    const qs = new URLSearchParams({ desde, hasta });
    if (buscar.trim() !== "") qs.set("buscar", buscar.trim());
    if (campaignId !== "") qs.set("campaignId", campaignId);
    if (curso !== "") qs.set("curso", curso);
    if (classroomId !== "") qs.set("classroomId", classroomId);
    if (estado !== "") qs.set("estado", estado);
    const res = await apiFetch(`/api/attendance/inasistencias?${qs.toString()}`);
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar la consulta.");
      setFilas([]);
      return;
    }
    const d = (await res.json()) as { inasistencias: Fila[]; tope: number };
    setFilas(d.inasistencias);
    setTope(d.tope);
  }, [desde, hasta, buscar, campaignId, curso, classroomId, estado]);

  useEffect(() => {
    // La búsqueda espera a que se deje de escribir.
    const t = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  // Cascada: los salones se acotan por la campaña y el curso elegidos.
  const nombreCampania = campanias.find((c) => c.id === campaignId)?.nombre;
  const salonesFiltrados = salones.filter(
    (s) =>
      (nombreCampania === undefined || s.campania === nombreCampania) &&
      (curso === "" || s.curso === curso),
  );

  function exportar() {
    if (filas === null) return;
    descargarCsv(
      `inasistencias-${desde}${hasta !== desde ? `_${hasta}` : ""}`,
      [
        "fecha",
        "hora",
        "tipo",
        "estado",
        "justificacion",
        "nino",
        "documento",
        "usuario",
        "pais",
        "campania",
        "curso",
        "salon",
        "guia",
        "apoderado",
        "telefono",
      ],
      filas.map((f) => [
        f.fecha,
        f.hora,
        TIPO[f.tipoSesion] ?? f.tipoSesion,
        f.estado === "AUSENTE" ? "Ausente" : "Justificado",
        f.justificacion,
        f.nombre,
        f.documento,
        f.username,
        f.pais,
        f.campania,
        f.curso,
        f.salon,
        f.guia,
        f.apoderado,
        f.telefono,
      ]),
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "84rem", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Asistencia</h1>
          <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
            Niños que no asistieron a sus sesiones (ausentes y justificados). Por defecto, las del
            día anterior; la fecha es la del salón.
          </p>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={filas === null || filas.length === 0}
          style={{
            padding: "0.55rem 1rem",
            borderRadius: "0.6rem",
            border: "1px solid #e3e7f0",
            background: "white",
            fontWeight: 700,
            cursor: filas !== null && filas.length > 0 ? "pointer" : "default",
          }}
        >
          ⬇ Descargar CSV
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
          gap: "0.7rem",
          margin: "1.1rem 0",
        }}
      >
        <label style={{ gridColumn: "span 2" }}>
          <span style={rotulo}>Usuario</span>
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="ID (documento), nombre o usuario"
            style={campo}
          />
        </label>
        <label>
          <span style={rotulo}>Campaña</span>
          <select
            value={campaignId}
            onChange={(e) => {
              setCampaignId(e.target.value);
              setClassroomId("");
            }}
            style={campo}
          >
            <option value="">Todas</option>
            {campanias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={rotulo}>Curso</span>
          <select
            value={curso}
            onChange={(e) => {
              setCurso(e.target.value);
              setClassroomId("");
            }}
            style={campo}
          >
            <option value="">Todos</option>
            <option value="JUNIOR">JUNIOR</option>
            <option value="YOUNGSTER">YOUNGSTER</option>
          </select>
        </label>
        <label>
          <span style={rotulo}>Salón</span>
          <select
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            style={campo}
          >
            <option value="">Todos</option>
            {salonesFiltrados.map((s) => (
              <option key={s.id} value={s.id}>
                {nombreCampania === undefined ? `${s.campania} · ` : ""}
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={rotulo}>Fecha inicial</span>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            style={campo}
          />
        </label>
        <label>
          <span style={rotulo}>Fecha final</span>
          <input
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => setHasta(e.target.value)}
            style={campo}
          />
        </label>
        <label>
          <span style={rotulo}>Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={campo}>
            <option value="">Ausentes y justificados</option>
            <option value="AUSENTE">Solo ausentes</option>
            <option value="JUSTIFICADO">Solo justificados</option>
          </select>
        </label>
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}

      {filas === null ? (
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      ) : filas.length === 0 ? (
        <p style={{ color: "var(--texto-suave)" }}>
          Nadie faltó en esas fechas con estos filtros. 🎉
        </p>
      ) : (
        <>
          <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)", margin: "0 0 0.5rem" }}>
            {filas.length} inasistencia{filas.length === 1 ? "" : "s"}
            {filas.length >= tope
              ? ` (se muestran las primeras ${String(tope)}: acota el filtro)`
              : ""}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f5f7fb" }}>
                  <th style={celda}>Fecha</th>
                  <th style={celda}>Niño</th>
                  <th style={celda}>Programa</th>
                  <th style={celda}>Guía</th>
                  <th style={celda}>Estado</th>
                  <th style={celda}>Apoderado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.attendanceId}>
                    <td style={{ ...celda, whiteSpace: "nowrap" }}>
                      {f.fecha}
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.hora} · {TIPO[f.tipoSesion] ?? f.tipoSesion}
                      </div>
                    </td>
                    <td style={celda}>
                      <Link href={`/panel/personas/${f.childPersonId}`} style={{ fontWeight: 700 }}>
                        {f.nombre}
                      </Link>
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.documento} · {f.username ?? "sin usuario"} · {f.pais}
                      </div>
                    </td>
                    <td style={celda}>
                      {f.campania ?? "—"}
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.salon}
                      </div>
                    </td>
                    <td style={celda}>{f.guia ?? "—"}</td>
                    <td style={celda}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: f.estado === "AUSENTE" ? "#c62828" : "#b57a00",
                        }}
                      >
                        {f.estado === "AUSENTE" ? "Ausente" : "Justificado"}
                      </span>
                      {f.justificacion !== null && (
                        <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                          {f.justificacion}
                        </div>
                      )}
                    </td>
                    <td style={celda}>
                      {f.apoderado ?? "—"}
                      {f.telefono !== null && f.telefono !== "" && (
                        <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                          {f.telefono}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
