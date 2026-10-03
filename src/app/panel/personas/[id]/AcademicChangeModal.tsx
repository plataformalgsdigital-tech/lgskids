"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * ACADEMIC CHANGE. Cada opción llama al camino que YA existe y cuida sus
 * invariantes; este modal no escribe nada por su cuenta:
 *  - Curso › otro salón del mismo curso → POST /api/enrollment/[id]/move
 *  - Curso › promover / degradar        → POST /api/contracts/[id]/curso (+ ubicación)
 *  - Ajuste de nivel / lección          → POST /api/progression/children/[id]/ubicacion
 * Siempre: elegir → ver el RESUMEN → confirmar.
 */

interface Nivel {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
  totalLecciones: number;
}
interface Salon {
  id: string;
  nombre: string;
  tipo: string;
  courseId: string;
  campania: string;
  cupo: number;
  ocupados: number;
  guia: string | null;
  sugerencia: { levelId: string; nivel: string; lecciones: number } | null;
}
interface Opciones {
  actual: {
    contractId: string;
    childPersonId: string;
    tipoCurso: string;
    contratoEstado: string;
    enrollmentId: string | null;
    classroomId: string | null;
    salon: string | null;
    courseId: string | null;
    campania: string | null;
  };
  salones: Salon[];
  niveles: Record<string, Nivel[]>;
}

type Opcion = "CURSO" | "AJUSTE";
type Movimiento = "SALON" | "PROMOVER" | "DEGRADAR";

const CURSO_UI: Record<string, string> = { JUNIOR: "Junior (6–9)", YOUNGSTER: "Youngster (10–13)" };

const boton: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.6rem",
  border: "1px solid #d8dce6",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.88rem",
};
const botonPrimario: CSSProperties = {
  ...boton,
  border: "none",
  background: "var(--lgs-azul)",
  color: "white",
};
const campo: CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label
      style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem" }}
    >
      <span style={{ fontWeight: 700, color: "var(--texto-suave)" }}>{etiqueta}</span>
      {children}
    </label>
  );
}

async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  try {
    const d = (await res.json()) as { error?: { message?: string } };
    return d.error?.message ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

export function AcademicChangeModal(props: {
  contractId: string;
  childPersonId: string;
  nombre: string;
  /** Ubicación actual del niño en su curso, para comparar en el resumen. */
  nivelActual: string | null;
  leccionActual: number | null;
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const [op, setOp] = useState<Opciones | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opcion, setOpcion] = useState<Opcion | null>(null);
  const [mov, setMov] = useState<Movimiento>("SALON");
  const [salonId, setSalonId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [lecciones, setLecciones] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [resumen, setResumen] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const res = await apiFetch(`/api/contracts/${props.contractId}/academico`);
      if (!vigente) return;
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudieron cargar las opciones."));
        return;
      }
      setOp((await res.json()) as Opciones);
    })();
    return () => {
      vigente = false;
    };
  }, [props.contractId]);

  const actual = op?.actual ?? null;
  const tipoDestino =
    mov === "PROMOVER" ? "YOUNGSTER" : mov === "DEGRADAR" ? "JUNIOR" : (actual?.tipoCurso ?? "");

  // Salones elegibles según el movimiento: del MISMO curso (cambio de salón)
  // o del otro tipo (promover/degradar). Con cupo libre, o el actual.
  const salonesElegibles = useMemo(() => {
    if (op === null || actual === null) return [];
    return op.salones.filter((s) =>
      mov === "SALON"
        ? s.courseId === actual.courseId && s.id !== actual.classroomId
        : s.tipo === tipoDestino,
    );
  }, [op, actual, mov, tipoDestino]);

  const salon = op?.salones.find((s) => s.id === salonId) ?? null;
  const salonActual = op?.salones.find((s) => s.id === actual?.classroomId) ?? null;
  // Niveles del curso donde quedará el niño: el del salón elegido (curso) o el
  // actual (ajuste).
  const courseIdNiveles =
    opcion === "AJUSTE" ? (actual?.courseId ?? null) : (salon?.courseId ?? null);
  const niveles = courseIdNiveles !== null ? (op?.niveles[courseIdNiveles] ?? []) : [];
  const nivel = niveles.find((n) => n.id === levelId) ?? null;
  const conUbicacion = opcion === "AJUSTE" || (opcion === "CURSO" && mov !== "SALON");

  function aplicarSugerencia(s: Salon | null) {
    if (s?.sugerencia == null) return;
    setLevelId(s.sugerencia.levelId);
    setLecciones(s.sugerencia.lecciones);
  }

  function elegirSalon(id: string) {
    setSalonId(id);
    // En promover/degradar, se propone el punto en que va el salón destino:
    // el niño queda alineado con su grupo nuevo.
    if (mov !== "SALON") aplicarSugerencia(op?.salones.find((s) => s.id === id) ?? null);
  }

  function cambiarMov(m: Movimiento) {
    setMov(m);
    setSalonId("");
    setLevelId("");
    setLecciones(0);
    setResumen(false);
  }

  function elegirOpcion(o: Opcion) {
    setOpcion(o);
    setResumen(false);
    setError(null);
    setSalonId("");
    setLevelId("");
    setLecciones(0);
    if (o === "AJUSTE") aplicarSugerencia(salonActual);
  }

  const faltante = (() => {
    if (opcion === "CURSO" && salonId === "") return "Elige el salón.";
    if (conUbicacion && levelId === "") return "Elige el nivel.";
    if (motivo.trim().length < 5) return "Escribe el motivo (mínimo 5 caracteres).";
    return null;
  })();

  async function confirmar() {
    if (actual === null) return;
    setOcupado(true);
    setError(null);
    try {
      let res: Response;
      let hecho: string;
      if (opcion === "AJUSTE") {
        res = await apiFetch(`/api/progression/children/${props.childPersonId}/ubicacion`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ levelId, lecciones, motivo: motivo.trim() }),
        });
        hecho = `Ajuste aplicado: ${nivel?.nombre ?? ""}, ${String(lecciones)} lección(es) cursadas.`;
      } else if (mov === "SALON") {
        if (actual.enrollmentId === null) {
          setError("El niño no tiene matrícula activa.");
          return;
        }
        res = await apiFetch(`/api/enrollment/${actual.enrollmentId}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nuevoClassroomId: salonId, motivo: motivo.trim() }),
        });
        hecho = `Cambiado al salón ${salon?.nombre ?? ""}.`;
      } else {
        res = await apiFetch(`/api/contracts/${actual.contractId}/curso`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipoCurso: tipoDestino,
            classroomId: salonId,
            ubicacion: { levelId, lecciones },
            motivo: motivo.trim(),
          }),
        });
        hecho = `${mov === "PROMOVER" ? "Promovido" : "Degradado"} a ${CURSO_UI[tipoDestino] ?? tipoDestino}, ${salon?.nombre ?? ""}.`;
      }
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo aplicar el cambio."));
        return;
      }
      // El cambio de curso avisa si la edad no cuadra; no bloquea.
      const data = (await res.json().catch(() => ({}))) as { advertencia?: string | null };
      props.onHecho(data.advertencia ? `${hecho} ⚠ ${data.advertencia}` : hecho);
    } finally {
      setOcupado(false);
    }
  }

  const tituloOpcion = (o: Opcion, texto: string, desc: string) => (
    <button
      type="button"
      onClick={() => elegirOpcion(o)}
      style={{
        ...boton,
        textAlign: "left",
        flex: 1,
        minWidth: "14rem",
        borderColor: opcion === o ? "var(--lgs-azul)" : "#d8dce6",
        background: opcion === o ? "#e8f1fd" : "white",
      }}
    >
      <div>{texto}</div>
      <div style={{ fontWeight: 400, fontSize: "0.78rem", color: "var(--texto-suave)" }}>
        {desc}
      </div>
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-academic-change"
      onClick={() => !ocupado && props.onCerrar()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "2rem 1rem",
        zIndex: 50,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "0.9rem",
          padding: "1.25rem 1.4rem",
          maxWidth: "44rem",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "0.9rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="titulo-academic-change" style={{ fontSize: "1.2rem", margin: 0 }}>
            Academic Change · {props.nombre}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={props.onCerrar}
            style={{ ...boton, borderRadius: "50%", width: "2.1rem", height: "2.1rem", padding: 0 }}
          >
            ✕
          </button>
        </div>

        {actual !== null && (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
            Hoy: <strong>{CURSO_UI[actual.tipoCurso] ?? actual.tipoCurso}</strong> ·{" "}
            {actual.salon ?? "sin salón"}
            {props.nivelActual !== null &&
              ` · ${props.nivelActual}${props.leccionActual !== null ? `, lección ${String(props.leccionActual)}` : ""}`}
          </p>
        )}
        {error !== null && (
          <p role="alert" style={{ margin: 0, color: "#c62828", fontWeight: 600 }}>
            {error}
          </p>
        )}
        {op === null && error === null && <p style={{ margin: 0 }}>Cargando opciones…</p>}

        {op !== null && actual !== null && actual.enrollmentId === null && (
          <p style={{ margin: 0, color: "#8a5a00" }}>
            El niño no tiene matrícula activa: primero hay que matricularlo en un salón (ficha del
            contrato).
          </p>
        )}

        {op !== null && actual !== null && actual.enrollmentId !== null && !resumen && (
          <>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              {tituloOpcion(
                "CURSO",
                "1. Curso",
                "Otro salón del mismo curso, o promover / degradar de curso.",
              )}
              {tituloOpcion(
                "AJUSTE",
                "2. Ajuste",
                "Otro nivel o lección en su mismo curso y salón (p. ej. alinear a quien entró tarde).",
              )}
            </div>

            {opcion === "CURSO" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                <div
                  style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.88rem" }}
                >
                  {(
                    [
                      ["SALON", "Cambiar de salón (mismo curso)", true],
                      ["PROMOVER", "Promover a Youngster", actual.tipoCurso === "JUNIOR"],
                      ["DEGRADAR", "Degradar a Junior", actual.tipoCurso === "YOUNGSTER"],
                    ] as const
                  ).map(([m, texto, habilitado]) => (
                    <label
                      key={m}
                      style={{
                        display: "flex",
                        gap: "0.35rem",
                        alignItems: "center",
                        opacity: habilitado ? 1 : 0.45,
                      }}
                    >
                      <input
                        type="radio"
                        name="movimiento"
                        checked={mov === m}
                        disabled={!habilitado}
                        onChange={() => cambiarMov(m)}
                      />
                      {texto}
                    </label>
                  ))}
                </div>
                <Campo etiqueta="Salón destino">
                  <select
                    value={salonId}
                    onChange={(e) => elegirSalon(e.target.value)}
                    style={campo}
                  >
                    <option value="">— Elige el salón —</option>
                    {salonesElegibles.map((s) => (
                      <option key={s.id} value={s.id} disabled={s.ocupados >= s.cupo}>
                        {s.campania} · {s.nombre} · {String(s.ocupados)}/{String(s.cupo)}
                        {s.ocupados >= s.cupo ? " (sin cupo)" : ""}
                        {s.sugerencia !== null &&
                          ` · va en ${s.sugerencia.nivel}${s.sugerencia.lecciones > 0 ? ` (${String(s.sugerencia.lecciones)} lecc.)` : ""}`}
                      </option>
                    ))}
                  </select>
                </Campo>
                {salonesElegibles.length === 0 && (
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "#8a5a00" }}>
                    No hay salones disponibles para este movimiento.
                  </p>
                )}
                {mov === "SALON" && (
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                    Mismo curso: su avance no cambia, solo pasa a la lista del otro salón.
                  </p>
                )}
              </div>
            )}

            {conUbicacion && (opcion === "AJUSTE" || salonId !== "") && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
                  gap: "0.7rem",
                  alignItems: "end",
                }}
              >
                <Campo etiqueta={opcion === "AJUSTE" ? "Nuevo nivel" : "Nivel en el curso nuevo"}>
                  <select
                    value={levelId}
                    onChange={(e) => {
                      setLevelId(e.target.value);
                      setLecciones(0);
                    }}
                    style={campo}
                  >
                    <option value="">— Elige el nivel —</option>
                    {niveles.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Lecciones ya cursadas en ese nivel">
                  <select
                    value={lecciones}
                    onChange={(e) => setLecciones(Number(e.target.value))}
                    style={campo}
                    disabled={nivel === null}
                  >
                    {Array.from({ length: (nivel?.totalLecciones ?? 0) + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0
                          ? nivel?.orden === 1
                            ? "0 · desde el Welcome"
                            : "0 · empieza el nivel"
                          : `${String(i)} · sigue en la lección ${String(Math.min(i + 1, nivel?.totalLecciones ?? i))}`}
                      </option>
                    ))}
                  </select>
                </Campo>
                {opcion === "AJUSTE" && salonActual?.sugerencia != null && (
                  <button
                    type="button"
                    style={boton}
                    onClick={() => aplicarSugerencia(salonActual)}
                    title="Lo deja donde va su salón: para quien entró tarde"
                  >
                    ↪ Alinear con el salón ({salonActual.sugerencia.nivel},{" "}
                    {String(salonActual.sugerencia.lecciones)} lecc.)
                  </button>
                )}
              </div>
            )}

            {opcion !== null && (
              <Campo etiqueta="Motivo (queda en la auditoría)">
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={300}
                  placeholder="Ej.: entró tarde al curso; el salón va en Champion"
                  style={campo}
                />
              </Campo>
            )}

            {opcion !== null && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
                {faltante !== null && (
                  <span
                    style={{ alignSelf: "center", fontSize: "0.8rem", color: "var(--texto-suave)" }}
                  >
                    {faltante}
                  </span>
                )}
                <button
                  type="button"
                  style={{ ...botonPrimario, opacity: faltante === null ? 1 : 0.5 }}
                  disabled={faltante !== null}
                  onClick={() => setResumen(true)}
                >
                  Ver resumen →
                </button>
              </div>
            )}
          </>
        )}

        {op !== null && actual !== null && resumen && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Resumen del cambio</h3>
            <table style={{ borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--texto-suave)" }}>
                  <th style={{ padding: "0.3rem 0.5rem" }}></th>
                  <th style={{ padding: "0.3rem 0.5rem" }}>Antes</th>
                  <th style={{ padding: "0.3rem 0.5rem" }}>Después</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Curso",
                    CURSO_UI[actual.tipoCurso] ?? actual.tipoCurso,
                    CURSO_UI[tipoDestino] ?? tipoDestino,
                  ],
                  [
                    "Salón",
                    actual.salon ?? "—",
                    opcion === "AJUSTE" ? (actual.salon ?? "—") : (salon?.nombre ?? "—"),
                  ],
                  ...(conUbicacion
                    ? [
                        ["Nivel", props.nivelActual ?? "—", nivel?.nombre ?? "—"],
                        [
                          "Lección",
                          props.leccionActual !== null ? String(props.leccionActual) : "—",
                          `${String(Math.min(lecciones + 1, nivel?.totalLecciones ?? lecciones + 1))} (${String(lecciones)} cursadas)`,
                        ],
                      ]
                    : []),
                ].map(([k, a, d]) => (
                  <tr key={k} style={{ borderTop: "1px solid #edf0f6" }}>
                    <td style={{ padding: "0.35rem 0.5rem", fontWeight: 700 }}>{k}</td>
                    <td style={{ padding: "0.35rem 0.5rem" }}>{a}</td>
                    <td
                      style={{
                        padding: "0.35rem 0.5rem",
                        fontWeight: a !== d ? 800 : 400,
                        color: a !== d ? "var(--lgs-azul)" : "inherit",
                      }}
                    >
                      {d}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem", color: "#5a6172" }}>
              {opcion === "CURSO" && mov !== "SALON" && (
                <li>
                  Cada curso tiene su propio avance: en el curso nuevo, los niveles anteriores al
                  elegido quedan <strong>convalidados</strong> (sin medalla).
                </li>
              )}
              {opcion === "AJUSTE" && (
                <li>
                  Los niveles anteriores al elegido quedan <strong>convalidados</strong> (sin
                  medalla). Es un punto de partida: lo que ya aprobó en sus evaluaciones no se
                  pierde, aunque el ajuste quede por debajo.
                </li>
              )}
              {conUbicacion && (
                <li>El Level Up de cada nivel no se convalida: lo tiene que aprobar.</li>
              )}
              <li>
                Motivo: <em>{motivo.trim()}</em>
              </li>
            </ul>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
              <button
                type="button"
                style={boton}
                disabled={ocupado}
                onClick={() => setResumen(false)}
              >
                ← Volver
              </button>
              <button
                type="button"
                style={{ ...botonPrimario, background: "var(--lgs-verde)", color: "#1b2a10" }}
                disabled={ocupado}
                onClick={() => void confirmar()}
              >
                {ocupado ? "Aplicando…" : "Confirmar cambio"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
