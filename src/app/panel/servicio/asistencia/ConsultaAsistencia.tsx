"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { descargarCsv } from "@/ui/csv";
import {
  FiltrosServicio,
  botonServicio,
  campoServicio,
  celdaServicio,
  diaLocal,
  qsFiltros,
  rotuloServicio,
  type FiltrosBase,
} from "../FiltrosServicio";
import {
  JustificarInasistencia,
  WhatsAppInasistencia,
  type LineaInasistencia,
} from "./AccionesInasistencia";
import { SoloSi } from "@/ui/SoloSi";

/**
 * La consulta de asistencia de Servicio, en dos modos:
 *  - "asistencia": quién no asistió (o, con el filtro, quién sí). Abre en el día
 *    ANTERIOR, que es la lista que servicio llama cada mañana.
 *  - "justificacion": las faltas de la ÚLTIMA SEMANA pendientes de justificar,
 *    para anexar el soporte que manda la familia y justificarlas.
 * Las fechas son las locales de cada salón.
 */

interface Fila {
  attendanceId: string;
  sessionId: string;
  fecha: string;
  hora: string;
  tipoSesion: string;
  estado: "AUSENTE" | "JUSTIFICADO" | "PRESENTE";
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
  tieneSoporte: boolean;
}

const TIPO: Record<string, string> = { SESION: "Sesión", CLUB: "Club", TALLER: "Taller" };
const ESTADO: Record<Fila["estado"], { texto: string; color: string }> = {
  AUSENTE: { texto: "Ausente", color: "#c62828" },
  JUSTIFICADO: { texto: "Justificado", color: "#b57a00" },
  PRESENTE: { texto: "Asistió", color: "#2e7d32" },
};
const botonLinea: CSSProperties = {
  padding: "0.3rem 0.55rem",
  borderRadius: "0.5rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.76rem",
  whiteSpace: "nowrap",
};

const MODOS = {
  asistencia: {
    titulo: "Asistencia",
    descripcion:
      "Niños que no asistieron a sus sesiones (o, con el filtro de estado, los que sí). Por defecto, las del día anterior; la fecha es la del salón. A cada ausente se le puede escribir a la familia por WhatsApp o justificar la inasistencia.",
    desde: -1,
    hasta: -1,
    estado: "",
    estados: [
      { valor: "", texto: "Ausentes y justificados" },
      { valor: "AUSENTE", texto: "Solo ausentes" },
      { valor: "JUSTIFICADO", texto: "Solo justificados" },
      { valor: "PRESENTE", texto: "Asistentes" },
    ],
    archivo: "inasistencias",
  },
  justificacion: {
    titulo: "Justificación falta",
    descripcion:
      "Las faltas de la última semana que siguen sin justificar. Anexa el soporte que mandó la familia (certificado, nota) y escribe el motivo: la falta pasa a justificada. Con el filtro de estado ves las ya justificadas y su soporte.",
    desde: -7,
    hasta: 0,
    estado: "AUSENTE",
    estados: [
      { valor: "AUSENTE", texto: "Pendientes de justificar" },
      { valor: "JUSTIFICADO", texto: "Ya justificadas" },
    ],
    archivo: "justificaciones",
  },
} as const;

export function ConsultaAsistencia({ modo }: { modo: keyof typeof MODOS }) {
  const m = MODOS[modo];
  const [filtros, setFiltros] = useState<FiltrosBase>(() => ({
    buscar: "",
    campaignId: "",
    curso: "",
    classroomId: "",
    desde: diaLocal(m.desde),
    hasta: diaLocal(m.hasta),
  }));
  const [estado, setEstado] = useState<string>(m.estado);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [tope, setTope] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [puedeJustificar, setPuedeJustificar] = useState(false);
  const [puedeEnviar, setPuedeEnviar] = useState(false);
  const [accion, setAccion] = useState<{
    tipo: "whatsapp" | "justificar";
    linea: LineaInasistencia;
  } | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const res = await apiFetch(`/api/attendance/inasistencias?${qsFiltros(filtros, { estado })}`);
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar la consulta.");
      setFilas([]);
      return;
    }
    const d = (await res.json()) as {
      inasistencias: Fila[];
      tope: number;
      puedeJustificar: boolean;
      puedeEnviar: boolean;
    };
    setFilas(d.inasistencias);
    setTope(d.tope);
    setPuedeJustificar(d.puedeJustificar);
    setPuedeEnviar(d.puedeEnviar);
  }, [filtros, estado]);

  useEffect(() => {
    // La búsqueda espera a que se deje de escribir.
    const t = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  function exportar() {
    if (filas === null) return;
    descargarCsv(
      `${m.archivo}-${filtros.desde}${filtros.hasta !== filtros.desde ? `_${filtros.hasta}` : ""}`,
      [
        "fecha",
        "hora",
        "tipo",
        "estado",
        "justificacion",
        "soporte",
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
        ESTADO[f.estado].texto,
        f.justificacion,
        f.tieneSoporte,
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

  const conAcciones = puedeEnviar || puedeJustificar;

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
        <div style={{ flex: "1 1 30rem" }}>
          <h1 style={{ fontSize: "1.6rem", margin: 0 }}>{m.titulo}</h1>
          <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
            {m.descripcion}
          </p>
        </div>
        <SoloSi op="op.servicio.asistencia_csv">
          <button
            type="button"
            onClick={exportar}
            disabled={filas === null || filas.length === 0}
            style={botonServicio}
          >
            ⬇ Descargar CSV
          </button>
        </SoloSi>
      </div>

      <FiltrosServicio filtros={filtros} onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}>
        <label>
          <span style={rotuloServicio}>Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={campoServicio}>
            {m.estados.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.texto}
              </option>
            ))}
          </select>
        </label>
      </FiltrosServicio>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {aviso !== null && <p style={{ color: "#1b5e20", fontWeight: 600 }}>{aviso}</p>}

      {filas === null ? (
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      ) : filas.length === 0 ? (
        <p style={{ color: "var(--texto-suave)" }}>
          {estado === "PRESENTE"
            ? "Nadie registró asistencia en esas fechas con estos filtros."
            : modo === "justificacion" && estado === "AUSENTE"
              ? "No hay faltas pendientes de justificar con estos filtros. 🎉"
              : "Nadie faltó en esas fechas con estos filtros. 🎉"}
        </p>
      ) : (
        <>
          <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)", margin: "0 0 0.5rem" }}>
            {filas.length}{" "}
            {estado === "PRESENTE"
              ? `asistencia${filas.length === 1 ? "" : "s"}`
              : `inasistencia${filas.length === 1 ? "" : "s"}`}
            {filas.length >= tope
              ? ` (se muestran las primeras ${String(tope)}: acota el filtro)`
              : ""}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f5f7fb" }}>
                  <th style={celdaServicio}>Fecha</th>
                  <th style={celdaServicio}>Niño</th>
                  <th style={celdaServicio}>Programa</th>
                  <th style={celdaServicio}>Guía</th>
                  <th style={celdaServicio}>Estado</th>
                  <th style={celdaServicio}>Apoderado</th>
                  {conAcciones && <th style={celdaServicio}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.attendanceId}>
                    <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                      {f.fecha}
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.hora} · {TIPO[f.tipoSesion] ?? f.tipoSesion}
                      </div>
                    </td>
                    <td style={celdaServicio}>
                      <Link href={`/panel/personas/${f.childPersonId}`} style={{ fontWeight: 700 }}>
                        {f.nombre}
                      </Link>
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.documento} · {f.username ?? "sin usuario"} · {f.pais}
                      </div>
                    </td>
                    <td style={celdaServicio}>
                      {f.campania ?? "—"}
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.salon}
                      </div>
                    </td>
                    <td style={celdaServicio}>{f.guia ?? "—"}</td>
                    <td style={celdaServicio}>
                      <span style={{ fontWeight: 700, color: ESTADO[f.estado].color }}>
                        {ESTADO[f.estado].texto}
                      </span>
                      {f.justificacion !== null && (
                        <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                          {f.justificacion}
                        </div>
                      )}
                      {f.tieneSoporte && (
                        <a
                          href={`/api/attendance/inasistencias/${f.attendanceId}/soporte`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "0.78rem", fontWeight: 700 }}
                        >
                          📎 Ver soporte
                        </a>
                      )}
                    </td>
                    <td style={celdaServicio}>
                      {f.apoderado ?? "—"}
                      {f.telefono !== null && f.telefono !== "" && (
                        <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                          {f.telefono}
                        </div>
                      )}
                    </td>
                    {conAcciones && (
                      <td style={celdaServicio}>
                        {/* Solo el AUSENTE tiene acciones: el justificado ya
                            tiene su motivo y el que asistió no necesita aviso. */}
                        {f.estado === "AUSENTE" && (
                          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                            {puedeJustificar && (
                              <button
                                type="button"
                                style={{
                                  ...botonLinea,
                                  ...(modo === "justificacion"
                                    ? { borderColor: "var(--lgs-azul)", color: "var(--lgs-azul)" }
                                    : {}),
                                }}
                                onClick={() => {
                                  setAviso(null);
                                  setAccion({ tipo: "justificar", linea: f });
                                }}
                              >
                                ✍️ {modo === "justificacion" ? "Anexar y justificar" : "Justificar"}
                              </button>
                            )}
                            {puedeEnviar && (
                              <button
                                type="button"
                                style={{ ...botonLinea, color: "#128c4b" }}
                                onClick={() => {
                                  setAviso(null);
                                  setAccion({ tipo: "whatsapp", linea: f });
                                }}
                              >
                                📲 WhatsApp
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {accion?.tipo === "whatsapp" && (
        <WhatsAppInasistencia
          linea={accion.linea}
          onCerrar={() => setAccion(null)}
          onEnviado={(texto) => {
            setAccion(null);
            setAviso(texto);
          }}
        />
      )}
      {accion?.tipo === "justificar" && (
        <JustificarInasistencia
          linea={accion.linea}
          onCerrar={() => setAccion(null)}
          onJustificado={(texto) => {
            setAccion(null);
            setAviso(texto);
            void cargar();
          }}
        />
      )}
    </main>
  );
}
