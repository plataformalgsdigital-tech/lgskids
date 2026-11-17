"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { ConOpcion } from "@/ui/ConOpcion";
import { horaEnZona, referenciaHoraria } from "@/ui/hora-paises";
import { SoloSi } from "@/ui/SoloSi";

/**
 * Gestión Festivos (Académica › Sesiones). El calendario de feriados es del SALÓN: si
 * el día es feriado en su país, la clase no se dicta y se corre al final del curso.
 * Pero el salón tiene niños de OTRO país, que ese día no es feriado para ellos: se
 * quedan sin clase. Aquí se ven ANTES y coordinación puede pasarlos, solo ese día, a
 * la clase de otro salón. Aprobar es AGENDAR: lo mismo que "Agendar" de la ficha.
 */

interface Salon {
  id: string;
  nombre: string;
  curso: string;
  campania: string;
  hora: string;
  ninosOtroPais: number;
  ninosMismoPais: number;
}
interface Alumno {
  childPersonId: string;
  nombre: string;
  documento: string;
  pais: string;
  classroomId: string;
  salon: string;
  curso: string;
  campania: string;
  startsAt: string;
  agendado: {
    id: string;
    salon: string;
    campania: string;
    curso: string;
    startsAt: string;
    motivo: string | null;
  } | null;
}
interface Festivo {
  pais: string;
  fecha: string;
  nombre: string;
  diaSemana: number;
  salones: Salon[];
  cursos: string[];
  alumnos: Alumno[];
  propios: number;
}
interface Leccion {
  nivel: string;
  leccion: string;
  n: number;
}
interface Opcion {
  id: string;
  startsAt: string;
  duracionMin: number;
  salon: string;
  campania: string | null;
  campaignId: string | null;
  curso: string | null;
  guia: string | null;
  limite: number;
  ocupados: number;
  lleno: boolean;
  enSuLista: boolean;
  choque: string | null;
  timezone: string | null;
  leccion: Leccion | null;
  diferenciaMin: number;
  mismaLeccion: boolean | null;
  recomendada: boolean;
}
interface Sugerencias {
  leccionPerdida: Leccion | null;
  opciones: Opcion[];
  diagnostico: {
    fechaPasada: boolean;
    calendariosActivos: string[];
    calendariosConFeriado: string[];
  };
}

const PAIS: Record<string, string> = { CL: "Chile", CO: "Colombia", EC: "Ecuador", PE: "Perú" };
const CURSO: Record<string, string> = { JUNIOR: "Junior", YOUNGSTER: "Youngster" };
const NIVEL: Record<string, string> = {
  ROOKIE: "Rookie",
  CHAMPION: "Champion",
  ELITE: "Elite",
  LEGENDARY: "Legendary",
  ULTIMATE: "Ultimate Stage",
};

const btn: CSSProperties = {
  padding: "0.35rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.8rem",
  cursor: "pointer",
};
const btnPrimario: CSSProperties = {
  ...btn,
  border: "none",
  background: "var(--lgs-azul)",
  color: "white",
};
const input: CSSProperties = {
  padding: "0.4rem 0.55rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.85rem",
};
const caja: CSSProperties = {
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  background: "white",
};

function fechaLarga(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "17:00 Chile · 15:00 Col/Ecu/Perú" de un instante. */
function horas(instante: string): string {
  const r = referenciaHoraria(instante);
  return `${r.chile} Chile · ${r.colombia} Col/Ecu/Perú`;
}

async function mensaje(res: Response, porDefecto: string): Promise<string> {
  try {
    const d = (await res.json()) as { error?: { message?: string } };
    return d.error?.message ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

/** Por qué no hay a dónde pasar al niño (y qué hacer), en vez de una lista vacía sin explicación. */
function SinClases(props: { datos: Sugerencias; amplio: boolean; hayFiltros: boolean }) {
  const { diagnostico: d } = props.datos;
  const nombres = (l: string[]) => l.map((p) => PAIS[p] ?? p).join(" y ");
  let texto: string;
  if (props.hayFiltros && props.datos.opciones.length > 0) {
    texto = "Ninguna clase de ese día coincide con esos filtros: quita alguno para ver las demás.";
  } else if (d.fechaPasada) {
    texto = "La clase que se pierde ya empezó: no hay a dónde pasarlo.";
  } else if (
    d.calendariosActivos.length > 0 &&
    d.calendariosConFeriado.length === d.calendariosActivos.length
  ) {
    texto = `Ese día ningún salón activo dicta clase: es feriado en ${nombres(d.calendariosConFeriado)}, que son los calendarios de todos los salones. No hay una clase a la que pasarlo; solo se podría con una sesión extra en otro calendario.`;
  } else {
    texto = props.amplio
      ? "Ese día no hay clases con cupo en ninguna campaña, curso o salón."
      : "No hay clases ese día en su campaña y curso. Marca “Elegir otra campaña, curso o salón” para ver las demás.";
  }
  return <p style={{ margin: "0.6rem 0 0", color: "#8a5a00", fontWeight: 600 }}>{texto}</p>;
}

/** Las opciones para UN niño en UN feriado, con el cambio de campaña/curso/salón. */
function PanelAlumno(props: {
  festivo: Festivo;
  alumno: Alumno;
  puedeAprobar: boolean;
  puedeSobrecupo: boolean;
  onAprobado: () => void;
}) {
  const { festivo, alumno } = props;
  const [amplio, setAmplio] = useState(false);
  const [datos, setDatos] = useState<Sugerencias | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fCampania, setFCampania] = useState("");
  const [fCurso, setFCurso] = useState("");
  const [fSalon, setFSalon] = useState("");
  const [elegida, setElegida] = useState<Opcion | null>(null);
  const [sobrecupo, setSobrecupo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      setDatos(null);
      setError(null);
      const qs = new URLSearchParams({
        childPersonId: alumno.childPersonId,
        classroomId: alumno.classroomId,
        fecha: festivo.fecha,
        perdidaStartsAt: alumno.startsAt,
        amplio: amplio ? "1" : "0",
      });
      const res = await apiFetch(`/api/scheduling/festivos/sugerencias?${qs.toString()}`);
      if (!vigente) return;
      if (!res.ok) {
        setError(await mensaje(res, "No se pudieron cargar las opciones."));
        return;
      }
      setDatos((await res.json()) as Sugerencias);
    })();
    return () => {
      vigente = false;
    };
  }, [alumno, festivo.fecha, amplio]);

  const campanias = useMemo(
    () => [...new Set((datos?.opciones ?? []).map((o) => o.campania ?? ""))].filter(Boolean),
    [datos],
  );
  const cursos = useMemo(
    () => [
      ...new Set(
        (datos?.opciones ?? [])
          .filter((o) => fCampania === "" || o.campania === fCampania)
          .map((o) => o.curso ?? ""),
      ),
    ],
    [datos, fCampania],
  );
  const salones = useMemo(
    () => [
      ...new Set(
        (datos?.opciones ?? [])
          .filter(
            (o) =>
              (fCampania === "" || o.campania === fCampania) &&
              (fCurso === "" || o.curso === fCurso),
          )
          .map((o) => o.salon),
      ),
    ],
    [datos, fCampania, fCurso],
  );
  const visibles = (datos?.opciones ?? []).filter(
    (o) =>
      (fCampania === "" || o.campania === fCampania) &&
      (fCurso === "" || o.curso === fCurso) &&
      (fSalon === "" || o.salon === fSalon),
  );

  async function aprobar() {
    if (elegida === null) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch("/api/scheduling/festivos/aprobar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childPersonId: alumno.childPersonId,
          pais: festivo.pais,
          fecha: festivo.fecha,
          sessionId: elegida.id,
          amplio,
          autorizarSobrecupo: elegida.lleno && sobrecupo,
        }),
      });
      if (!res.ok) {
        setError(await mensaje(res, "No se pudo aprobar el cambio."));
        return;
      }
      props.onAprobado();
    } finally {
      setOcupado(false);
    }
  }

  const otroCurso = elegida !== null && elegida.curso !== null && elegida.curso !== alumno.curso;

  return (
    <div style={{ background: "#f8faff", borderTop: "1px solid #e3e7f0", padding: "0.8rem 1rem" }}>
      <div style={{ fontSize: "0.82rem", color: "var(--texto-suave)", marginBottom: "0.5rem" }}>
        Sin clase: <strong>{horas(alumno.startsAt)}</strong> en {alumno.salon}
        {datos?.leccionPerdida != null &&
          ` · le tocaba ${NIVEL[datos.leccionPerdida.nivel] ?? datos.leccionPerdida.nivel} · ${datos.leccionPerdida.leccion}`}
        . Su salón la retoma al final del curso.
      </div>

      <SoloSi op="op.sesiones.festivos_aprobar">
        <label
          style={{
            display: "flex",
            gap: "0.4rem",
            alignItems: "center",
            fontSize: "0.82rem",
            fontWeight: 700,
          }}
        >
          <input
            type="checkbox"
            checked={amplio}
            onChange={(e) => {
              setAmplio(e.target.checked);
              setElegida(null);
              setFCampania("");
              setFCurso("");
              setFSalon("");
            }}
          />
          Elegir otra campaña, curso o salón (no solo la sugerida)
        </label>
      </SoloSi>

      {amplio && datos !== null && datos.opciones.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "0.6rem 0" }}>
          <select
            value={fCampania}
            onChange={(e) => {
              setFCampania(e.target.value);
              setFCurso("");
              setFSalon("");
            }}
            style={input}
            aria-label="Campaña"
          >
            <option value="">Campaña: todas</option>
            {campanias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={fCurso}
            onChange={(e) => {
              setFCurso(e.target.value);
              setFSalon("");
            }}
            style={input}
            aria-label="Curso"
          >
            <option value="">Curso: todos</option>
            {cursos.map((c) => (
              <option key={c} value={c}>
                {CURSO[c] ?? c}
              </option>
            ))}
          </select>
          <select
            value={fSalon}
            onChange={(e) => setFSalon(e.target.value)}
            style={input}
            aria-label="Salón"
          >
            <option value="">Salón: todos</option>
            {salones.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {datos === null && error === null && (
        <p style={{ margin: "0.6rem 0 0", color: "var(--texto-suave)" }}>Buscando clases…</p>
      )}
      {error !== null && (
        <p role="alert" style={{ margin: "0.6rem 0 0", color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {datos !== null && visibles.length === 0 && (
        <SinClases
          datos={datos}
          amplio={amplio}
          hayFiltros={fCampania !== "" || fCurso !== "" || fSalon !== ""}
        />
      )}

      {visibles.length > 0 && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.6rem" }}
        >
          {visibles.map((o) => {
            const libre = o.choque === null && !o.enSuLista;
            const activa = elegida?.id === o.id;
            return (
              <div
                key={o.id}
                style={{
                  ...caja,
                  padding: "0.55rem 0.75rem",
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                  borderColor: activa ? "var(--lgs-azul)" : o.recomendada ? "#2e7d32" : "#e3e7f0",
                  borderWidth: activa || o.recomendada ? 2 : 1,
                }}
              >
                <div style={{ flex: "1 1 16rem", minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: "0.88rem" }}>
                    {o.salon}
                    {o.recomendada && (
                      <span style={{ color: "#2e7d32", marginLeft: "0.4rem", fontSize: "0.72rem" }}>
                        ★ Recomendada
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                    {o.campania} · {CURSO[o.curso ?? ""] ?? o.curso} ·{" "}
                    {o.timezone !== null ? horaEnZona(o.startsAt, o.timezone) : ""} (hora del salón)
                    · {horas(o.startsAt)}
                  </div>
                  <div style={{ fontSize: "0.78rem", marginTop: "0.15rem" }}>
                    {o.leccion !== null ? (
                      <span
                        style={{
                          color: o.mismaLeccion === true ? "#2e7d32" : "#8a5a00",
                          fontWeight: 600,
                        }}
                      >
                        {NIVEL[o.leccion.nivel] ?? o.leccion.nivel} · {o.leccion.leccion}
                        {o.mismaLeccion === true
                          ? " (la misma que le tocaba)"
                          : o.mismaLeccion === false
                            ? " (distinta a la que le tocaba)"
                            : ""}
                      </span>
                    ) : (
                      <span style={{ color: "var(--texto-suave)" }}>Lección por asignar</span>
                    )}
                    {o.guia !== null && ` · ${o.guia}`}
                    {o.diferenciaMin > 0 && ` · ${String(o.diferenciaMin)} min de diferencia`}
                  </div>
                </div>
                <div style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                  {String(o.ocupados)}/{String(o.limite)}
                  {o.lleno && <strong style={{ color: "#c62828" }}> · llena</strong>}
                  {o.choque !== null && (
                    <div style={{ color: "#c62828", fontWeight: 700 }}>⚠ Choca: {o.choque}</div>
                  )}
                  {o.enSuLista && <div style={{ color: "#2e7d32" }}>✓ ya está en su lista</div>}
                </div>
                {props.puedeAprobar && !o.enSuLista && o.choque === null && (
                  <button
                    type="button"
                    style={activa ? btnPrimario : btn}
                    onClick={() => {
                      setElegida(activa ? null : o);
                      setSobrecupo(false);
                    }}
                    disabled={!libre && !props.puedeSobrecupo && o.lleno}
                  >
                    {activa ? "Elegida" : "Elegir"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {elegida !== null && (
        <div
          style={{
            marginTop: "0.8rem",
            padding: "0.75rem 0.9rem",
            borderRadius: "0.7rem",
            background: "#eef5ff",
            border: "1px solid #bfd8ff",
            fontSize: "0.86rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          <strong>Resumen del cambio temporal</strong>
          <span>
            {alumno.nombre} ({PAIS[alumno.pais] ?? alumno.pais}) tomará la clase de{" "}
            <strong>{elegida.salon}</strong> ({elegida.campania}) el{" "}
            <strong>{fechaLarga(festivo.fecha)}</strong>, {horas(elegida.startsAt)}. Solo ese día:
            su salón ({alumno.salon}) no cambia y retoma esa clase al final del curso.
          </span>
          {otroCurso && (
            <span style={{ color: "#8a5a00", fontWeight: 700 }}>
              ⚠ Es de otro curso ({CURSO[elegida.curso ?? ""] ?? elegida.curso}) que el del niño (
              {CURSO[alumno.curso] ?? alumno.curso}): el contenido y la edad pueden no coincidir.
            </span>
          )}
          {elegida.mismaLeccion === false && (
            <span style={{ color: "#8a5a00" }}>
              ⚠ La lección es distinta a la que le tocaba: puede repetir o saltarse una.
            </span>
          )}
          {elegida.lleno && props.puedeSobrecupo && (
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={sobrecupo}
                onChange={(e) => setSobrecupo(e.target.checked)}
              />
              Autorizo el sobrecupo (la clase está llena)
            </label>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              style={btnPrimario}
              onClick={() => void aprobar()}
              disabled={ocupado || (elegida.lleno && !sobrecupo)}
            >
              {ocupado ? "Aprobando…" : "Aprobar cambio temporal"}
            </button>
            <button type="button" style={btn} onClick={() => setElegida(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TarjetaFestivo(props: {
  festivo: Festivo;
  /** Instante de referencia (fijado al abrir la pantalla) para "en N días". */
  ahora: number;
  abierto: boolean;
  puedeAprobar: boolean;
  puedeSobrecupo: boolean;
  onAlternar: () => void;
  onCambio: () => void;
}) {
  const { festivo: f, ahora } = props;
  const [alumnoAbierto, setAlumnoAbierto] = useState<string | null>(null);
  const pendientes = f.alumnos.filter((a) => a.agendado === null).length;
  const estado =
    f.salones.length === 0
      ? { texto: "Sin impacto", color: "#5a6172", fondo: "#eef0f5" }
      : f.alumnos.length === 0
        ? { texto: "Sin niños de otro país", color: "#2e7d32", fondo: "#e8f5e9" }
        : pendientes > 0
          ? { texto: `${String(pendientes)} por resolver`, color: "#b26a00", fondo: "#fff3e0" }
          : { texto: "Todo resuelto", color: "#2e7d32", fondo: "#e8f5e9" };
  const dias = Math.round((new Date(`${f.fecha}T12:00:00`).getTime() - ahora) / (24 * 60 * 60_000));

  return (
    <div style={caja}>
      <button
        type="button"
        onClick={props.onAlternar}
        aria-expanded={props.abierto}
        style={{
          all: "unset",
          boxSizing: "border-box",
          width: "100%",
          cursor: "pointer",
          padding: "0.9rem 1.1rem",
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 18rem", minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1rem" }}>
            🎉 {f.nombre}{" "}
            <span style={{ color: "var(--texto-suave)", fontWeight: 600 }}>
              · {PAIS[f.pais] ?? f.pais}
            </span>
          </div>
          <div
            style={{
              fontSize: "0.82rem",
              color: "var(--texto-suave)",
              textTransform: "capitalize",
            }}
          >
            {fechaLarga(f.fecha)}
            <span style={{ textTransform: "none" }}>
              {" "}
              · {dias <= 0 ? "hoy" : dias === 1 ? "mañana" : `en ${String(dias)} días`}
            </span>
          </div>
        </div>
        <div style={{ fontSize: "0.82rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span>
            <strong>Cursos:</strong>{" "}
            {f.cursos.length === 0 ? "—" : f.cursos.map((c) => CURSO[c] ?? c).join(" y ")}
          </span>
          <span>
            <strong>Salones:</strong> {f.salones.length}
          </span>
          <span>
            <strong>Niños de otro país:</strong> {f.alumnos.length}
          </span>
        </div>
        <span
          style={{
            padding: "0.25rem 0.7rem",
            borderRadius: "999px",
            fontSize: "0.76rem",
            fontWeight: 800,
            color: estado.color,
            background: estado.fondo,
          }}
        >
          {estado.texto}
        </span>
        <span aria-hidden>{props.abierto ? "▾" : "▸"}</span>
      </button>

      {props.abierto && (
        <div style={{ borderTop: "1px solid #e3e7f0" }}>
          {f.salones.length === 0 ? (
            <p style={{ margin: 0, padding: "0.9rem 1.1rem", color: "var(--texto-suave)" }}>
              Ningún salón con calendario de {PAIS[f.pais] ?? f.pais} tiene clase ese día.
            </p>
          ) : (
            <>
              <div style={{ padding: "0.7rem 1.1rem", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--texto-suave)" }}>
                      <th style={{ padding: "0.25rem 0.5rem" }}>Campaña</th>
                      <th style={{ padding: "0.25rem 0.5rem" }}>Curso</th>
                      <th style={{ padding: "0.25rem 0.5rem" }}>Salón</th>
                      <th style={{ padding: "0.25rem 0.5rem" }}>Clase que no se dicta</th>
                      <th style={{ padding: "0.25rem 0.5rem" }}>Del festivo</th>
                      <th style={{ padding: "0.25rem 0.5rem" }}>De otro país</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.salones.map((s) => (
                      <tr key={s.id} style={{ borderTop: "1px solid #edf0f6" }}>
                        <td style={{ padding: "0.3rem 0.5rem" }}>{s.campania}</td>
                        <td style={{ padding: "0.3rem 0.5rem" }}>{CURSO[s.curso] ?? s.curso}</td>
                        <td style={{ padding: "0.3rem 0.5rem", fontWeight: 700 }}>{s.nombre}</td>
                        <td style={{ padding: "0.3rem 0.5rem" }}>{s.hora} (hora del salón)</td>
                        <td style={{ padding: "0.3rem 0.5rem" }}>{s.ninosMismoPais}</td>
                        <td style={{ padding: "0.3rem 0.5rem", fontWeight: 700 }}>
                          {s.ninosOtroPais}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p
                  style={{ fontSize: "0.78rem", color: "var(--texto-suave)", margin: "0.5rem 0 0" }}
                >
                  Esa clase se corre al final del curso: nadie pierde clases. Los {f.propios} niños
                  de {PAIS[f.pais] ?? f.pais} están de feriado y no necesitan nada; los de otro país
                  no, y pueden tomar la clase de otro salón solo ese día.
                </p>
              </div>

              {f.alumnos.length > 0 && (
                <div style={{ borderTop: "1px solid #edf0f6" }}>
                  {f.alumnos.map((a) => {
                    const abierto = alumnoAbierto === a.childPersonId;
                    return (
                      <div key={a.childPersonId} style={{ borderTop: "1px solid #edf0f6" }}>
                        <div
                          style={{
                            padding: "0.6rem 1.1rem",
                            display: "flex",
                            gap: "0.8rem",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ flex: "1 1 14rem", minWidth: 0 }}>
                            <Link
                              href={`/panel/personas/${a.childPersonId}`}
                              style={{ fontWeight: 800, fontSize: "0.88rem" }}
                            >
                              {a.nombre}
                            </Link>
                            <div style={{ fontSize: "0.76rem", color: "var(--texto-suave)" }}>
                              {PAIS[a.pais] ?? a.pais} · doc. {a.documento} · {a.salon} ·{" "}
                              {a.campania} · {CURSO[a.curso] ?? a.curso}
                            </div>
                          </div>
                          {a.agendado !== null ? (
                            <span style={{ fontSize: "0.8rem", color: "#2e7d32", fontWeight: 700 }}>
                              ✓ Tomará la clase de {a.agendado.salon} ({a.agendado.campania}) ·{" "}
                              {horas(a.agendado.startsAt)}
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "#b26a00", fontWeight: 700 }}>
                              Sin clase ese día
                            </span>
                          )}
                          {a.agendado === null && (
                            <button
                              type="button"
                              style={abierto ? btnPrimario : btn}
                              onClick={() => setAlumnoAbierto(abierto ? null : a.childPersonId)}
                            >
                              {abierto ? "Cerrar" : "Ver opciones"}
                            </button>
                          )}
                        </div>
                        {abierto && a.agendado === null && (
                          <PanelAlumno
                            festivo={f}
                            alumno={a}
                            puedeAprobar={props.puedeAprobar}
                            puedeSobrecupo={props.puedeSobrecupo}
                            onAprobado={() => {
                              setAlumnoAbierto(null);
                              props.onCambio();
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function GestionFestivosContenido() {
  const [dias, setDias] = useState(60);
  const [festivos, setFestivos] = useState<Festivo[] | null>(null);
  const [puedeAprobar, setPuedeAprobar] = useState(false);
  const [puedeSobrecupo, setPuedeSobrecupo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [soloImpacto, setSoloImpacto] = useState(true);
  const [ahora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/scheduling/festivos?dias=${String(dias)}`);
    if (!res.ok) {
      setError(await mensaje(res, "No se pudieron cargar los festivos."));
      return;
    }
    const d = (await res.json()) as {
      festivos: Festivo[];
      puedeAprobar: boolean;
      puedeSobrecupo: boolean;
    };
    setError(null);
    setFestivos(d.festivos);
    setPuedeAprobar(d.puedeAprobar);
    setPuedeSobrecupo(d.puedeSobrecupo);
  }, [dias]);

  useEffect(() => {
    async function run() {
      await cargar();
    }
    void run();
  }, [cargar]);

  const visibles = (festivos ?? []).filter((f) => !soloImpacto || f.salones.length > 0);
  const porResolver = (festivos ?? []).reduce(
    (n, f) => n + f.alumnos.filter((a) => a.agendado === null).length,
    0,
  );

  return (
    <main style={{ padding: "2rem", maxWidth: "62rem", margin: "0 auto" }}>
      <Link href="/panel/sesiones" style={{ fontSize: "0.9rem" }}>
        ← Sesiones
      </Link>
      <h1 style={{ fontSize: "1.5rem", margin: "0.5rem 0 0" }}>Gestión Festivos</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", maxWidth: "46rem" }}>
        Los feriados que vienen y los niños que quedan sin clase porque su salón sigue el calendario
        de otro país. Esa clase se corre al final del curso; aquí puedes pasar al niño a la clase de
        otro salón solo ese día.
      </p>

      <div style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: "0.82rem", fontWeight: 700 }}>
          Mirar los próximos{" "}
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={input}>
            {[30, 60, 90, 180].map((d) => (
              <option key={d} value={d}>
                {d} días
              </option>
            ))}
          </select>
        </label>
        <label
          style={{ fontSize: "0.82rem", display: "flex", gap: "0.35rem", alignItems: "center" }}
        >
          <input
            type="checkbox"
            checked={soloImpacto}
            onChange={(e) => setSoloImpacto(e.target.checked)}
          />
          Solo los que afectan salones
        </label>
        {festivos !== null && (
          <strong style={{ fontSize: "0.85rem", color: porResolver > 0 ? "#b26a00" : "#2e7d32" }}>
            {porResolver > 0 ? `${String(porResolver)} niño(s) por resolver` : "Nada por resolver"}
          </strong>
        )}
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
        {festivos === null && error === null && (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        )}
        {festivos !== null && visibles.length === 0 && (
          <p style={{ color: "var(--texto-suave)" }}>
            No hay feriados {soloImpacto ? "que afecten salones " : ""}en los próximos {dias} días.
          </p>
        )}
        {visibles.map((f) => {
          const clave = `${f.pais}|${f.fecha}`;
          return (
            <TarjetaFestivo
              key={clave}
              festivo={f}
              ahora={ahora}
              abierto={abierto === clave}
              puedeAprobar={puedeAprobar}
              puedeSobrecupo={puedeSobrecupo}
              onAlternar={() => setAbierto(abierto === clave ? null : clave)}
              onCambio={() => void cargar()}
            />
          );
        })}
      </div>
    </main>
  );
}

/** La página es una opción de Roles: sin ella, "No tienes acceso". */
export default function GestionFestivosPage() {
  return (
    <ConOpcion op="op.sesiones.festivos" volver="/panel/sesiones">
      <GestionFestivosContenido />
    </ConOpcion>
  );
}
