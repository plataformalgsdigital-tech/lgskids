"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Crear un evento suelto en el calendario: sesión extra, club o taller.
 *
 * Solo administración (`eventos.crear`). El enlace de Zoom NO se escribe: se
 * hereda del guía asignado, porque un guía dicta siempre desde su propia sala
 * y copiarlo a mano acabaría con enlaces desactualizados.
 *
 * Los selectores en cascada (campaña → país → curso → salón) se arman con la
 * lista de salones que la pantalla ya tiene cargada: no hacen falta llamadas
 * nuevas por cada paso.
 */

const MAX_COMPARTIDOS = 3;

export interface SalonOpcion {
  id: string;
  nombre: string;
  curso: string;
  campania: string;
  holidayCountry: string;
  cupo: number;
}

interface Guia {
  id: string;
  username: string;
  zoomUrl: string | null;
}

const NIVELES = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"] as const;

/** Aforo por defecto del evento interno: no cuelga de un salón del que heredar cupo. */
const LIMITE_ADMIN_DEFECTO = 25;
/** Tipos de una clase: la dicta un salón. */
const TIPOS_ACADEMICO = [
  { valor: "SESION", etiqueta: "Sesión" },
  { valor: "CLUB", etiqueta: "Club" },
  { valor: "TALLER", etiqueta: "Taller" },
] as const;

interface TipoAdmin {
  valor: string;
  etiqueta: string;
}

/** Horas enteras entre dos duraciones en minutos, ambas incluidas. */
function horasEntre(minMin: number, maxMin: number): number[] {
  const horas: number[] = [];
  for (let h = Math.ceil(minMin / 60); h <= Math.floor(maxMin / 60); h++) horas.push(h);
  return horas;
}

const campo: CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.92rem",
  fontFamily: "inherit",
};
const rotulo: CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 700,
  marginBottom: "0.2rem",
};
const boton: CSSProperties = {
  padding: "0.55rem 1.1rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
};

export function NuevoEventoModal({
  salones,
  modo,
  onCerrar,
  onCreado,
}: {
  salones: SalonOpcion[];
  /**
   * "academico" crea sesiones en salones (los ven los alumnos matriculados).
   * "administrativo" crea un evento interno cuya audiencia son GUÍAS elegidos.
   */
  modo: "academico" | "administrativo";
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const esAdmin = modo === "administrativo";
  const [guias, setGuias] = useState<Guia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const hoy = new Date();
  const [fecha, setFecha] = useState(
    `${String(hoy.getFullYear())}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`,
  );
  const [hora, setHora] = useState("16:00");
  const [duracion, setDuracion] = useState(60);
  // En modo administrativo arranca vacío y toma el primer tipo que sirva la
  // API: fijar un literal aquí sería una cuarta copia del vocabulario.
  const [tipo, setTipo] = useState<string>(esAdmin ? "" : "SESION");
  const [campania, setCampania] = useState("");
  const [pais, setPais] = useState("");
  const [curso, setCurso] = useState("");
  const [salonPrincipal, setSalonPrincipal] = useState("");
  const [nivel, setNivel] = useState("");
  const [limite, setLimite] = useState(esAdmin ? String(LIMITE_ADMIN_DEFECTO) : "");
  const [guiaUserId, setGuiaUserId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [compartir, setCompartir] = useState(false);
  const [extras, setExtras] = useState<string[]>([]);
  // Audiencia del evento administrativo: qué guías lo verán.
  const [titulo, setTitulo] = useState("");
  const [audiencia, setAudiencia] = useState<string[]>([]);
  // Vocabulario y rangos del dominio, servidos por la API.
  const [tiposAdmin, setTiposAdmin] = useState<TipoAdmin[]>([]);
  const [horasAdmin, setHorasAdmin] = useState<number[]>([]);
  const [horasTaller, setHorasTaller] = useState<number[]>([]);

  const cargarGuias = useCallback(async () => {
    const res = await apiFetch("/api/scheduling/eventos");
    if (!res.ok) return;
    const d = (await res.json()) as {
      guias: Guia[];
      tiposAdmin: TipoAdmin[];
      duracionAdmin: { min: number; max: number };
      duracionesTaller: number[];
    };
    setGuias(d.guias);
    setTiposAdmin(d.tiposAdmin);
    if (esAdmin && d.tiposAdmin.length > 0) {
      setTipo((actual) =>
        d.tiposAdmin.some((x) => x.valor === actual) ? actual : (d.tiposAdmin[0]?.valor ?? ""),
      );
    }
    setHorasAdmin(horasEntre(d.duracionAdmin.min, d.duracionAdmin.max));
    setHorasTaller(d.duracionesTaller.map((m) => m / 60));
  }, [esAdmin]);

  useEffect(() => {
    async function inicial() {
      await cargarGuias();
    }
    void inicial();
  }, [cargarGuias]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // Cascada: cada nivel del filtro se calcula sobre el anterior.
  // El evento ADMINISTRATIVO no se dicta en un salón: campaña, curso, salón y
  // nivel son contexto, y dejarlos vacíos significa TODOS. En el académico la
  // cascada sí obliga, porque la clase ocurre en UN salón concreto.
  const libre = (valor: string) => esAdmin && valor === "";
  const campanias = [...new Set(salones.map((s) => s.campania))];
  const paises = [
    ...new Set(
      salones
        .filter((s) => libre(campania) || s.campania === campania)
        .map((s) => s.holidayCountry),
    ),
  ];
  const cursos = [
    ...new Set(
      salones
        .filter(
          (s) =>
            (libre(campania) || s.campania === campania) &&
            (libre(pais) || s.holidayCountry === pais),
        )
        .map((s) => s.curso),
    ),
  ];
  const salonesFiltrados = salones.filter(
    (s) =>
      (libre(campania) || s.campania === campania) &&
      (libre(pais) || s.holidayCountry === pais) &&
      (libre(curso) || s.curso === curso),
  );
  // Para compartir se ofrecen los salones de la MISMA campaña y país, de
  // cualquier curso: compartir entre cursos es justo el caso de uso.
  const salonesCompartibles = salones.filter(
    (s) => s.campania === campania && s.holidayCountry === pais && s.id !== salonPrincipal,
  );

  const guia = guias.find((g) => g.id === guiaUserId) ?? null;
  const seleccionados = [salonPrincipal, ...(compartir ? extras : [])].filter((x) => x !== "");
  const listo = esAdmin
    ? fecha !== "" && hora !== "" && audiencia.length > 0
    : fecha !== "" && hora !== "" && salonPrincipal !== "" && guiaUserId !== "";

  async function crear() {
    setOcupado(true);
    setError(null);
    try {
      const cuerpo = esAdmin
        ? {
            tipo,
            titulo: titulo.trim() === "" ? null : titulo,
            fecha,
            horaLocal: hora,
            duracionMin: duracion,
            zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
            pais: pais === "" ? null : pais,
            campania: campania === "" ? null : campania,
            curso: curso === "" ? null : curso,
            classroomId: salonPrincipal === "" ? null : salonPrincipal,
            nivel: nivel === "" ? null : nivel,
            limiteUsuarios: limite === "" ? null : Number(limite),
            observaciones: observaciones.trim() === "" ? null : observaciones,
            guiaUserIds: audiencia,
          }
        : {
            classroomIds: seleccionados,
            tipo,
            fecha,
            horaLocal: hora,
            duracionMin: duracion,
            nivel: nivel === "" ? null : nivel,
            limiteUsuarios: limite === "" ? null : Number(limite),
            guiaUserId,
            observaciones: observaciones.trim() === "" ? null : observaciones,
          };
      const res = await apiFetch(
        esAdmin ? "/api/scheduling/eventos-admin" : "/api/scheduling/eventos",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        },
      );
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo crear el evento.");
        return;
      }
      onCreado();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Crear evento"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(8,11,24,0.6)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "1.5rem 1rem",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "44rem",
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #e3e7f0",
          }}
        >
          <h2 style={{ fontSize: "1.2rem", fontWeight: 800 }}>
            {esAdmin ? "🏛️ Evento administrativo" : "🎓 Evento académico"}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            style={{ ...boton, borderRadius: "50%", width: "2.2rem", height: "2.2rem", padding: 0 }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            padding: "1.1rem 1.25rem 1.3rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.8rem",
          }}
        >
          {error !== null && (
            <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
              {error}
            </p>
          )}

          {esAdmin && (
            <div>
              <label style={rotulo} htmlFor="ev-titulo">
                Título del evento
              </label>
              <input
                id="ev-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Reunión de coordinación, capacitación…"
                style={campo}
              />
            </div>
          )}

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.7rem" }}
            className="ev-tres"
          >
            <div>
              <label style={rotulo} htmlFor="ev-fecha">
                Fecha *
              </label>
              <input
                id="ev-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                style={campo}
              />
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-hora">
                Hora *
              </label>
              <input
                id="ev-hora"
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                style={campo}
              />
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-dur">
                Duración {esAdmin || tipo === "TALLER" ? "" : "(min)"}
              </label>
              {esAdmin || tipo === "TALLER" ? (
                <select
                  id="ev-dur"
                  value={duracion}
                  onChange={(e) => setDuracion(Number(e.target.value))}
                  style={campo}
                >
                  {(esAdmin ? horasAdmin : horasTaller).map((h) => (
                    <option key={h} value={h * 60}>
                      {h} hora{h === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="ev-dur"
                  type="number"
                  min={15}
                  max={300}
                  value={duracion}
                  onChange={(e) => setDuracion(Number(e.target.value))}
                  style={campo}
                />
              )}
            </div>
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}
            className="ev-dos"
          >
            <div>
              <label style={rotulo} htmlFor="ev-tipo">
                Tipo de evento *
              </label>
              <select
                id="ev-tipo"
                value={tipo}
                onChange={(e) => {
                  const nuevo = e.target.value;
                  setTipo(nuevo);
                  if (nuevo === "TALLER" && duracion !== 60 && duracion !== 120) setDuracion(60);
                }}
                style={campo}
              >
                {(esAdmin ? tiposAdmin : TIPOS_ACADEMICO).map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-camp">
                Campaña {esAdmin ? "" : "*"}
              </label>
              <select
                id="ev-camp"
                value={campania}
                onChange={(e) => {
                  setCampania(e.target.value);
                  setPais("");
                  setCurso("");
                  setSalonPrincipal("");
                  setExtras([]);
                }}
                style={campo}
              >
                <option value="">{esAdmin ? "Todas las campañas" : "Seleccionar campaña"}</option>
                {campanias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-pais">
                País {esAdmin ? "" : "*"}
              </label>
              <select
                id="ev-pais"
                value={pais}
                disabled={!esAdmin && campania === ""}
                onChange={(e) => {
                  setPais(e.target.value);
                  setCurso("");
                  setSalonPrincipal("");
                  setExtras([]);
                }}
                style={campo}
              >
                <option value="">{esAdmin ? "Todos los países" : "Seleccionar país"}</option>
                {paises.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-curso">
                Curso {esAdmin ? "" : "*"}
              </label>
              <select
                id="ev-curso"
                value={curso}
                disabled={!esAdmin && pais === ""}
                onChange={(e) => {
                  setCurso(e.target.value);
                  setSalonPrincipal("");
                }}
                style={campo}
              >
                <option value="">{esAdmin ? "Todos los cursos" : "Seleccionar curso"}</option>
                {cursos.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-salon">
                Salón {esAdmin ? "" : "*"}
              </label>
              <select
                id="ev-salon"
                value={salonPrincipal}
                disabled={!esAdmin && curso === ""}
                onChange={(e) => setSalonPrincipal(e.target.value)}
                style={campo}
              >
                <option value="">{esAdmin ? "Todos los salones" : "Seleccionar salón"}</option>
                {salonesFiltrados.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-nivel">
                Nivel
              </label>
              <select
                id="ev-nivel"
                value={nivel}
                onChange={(e) => setNivel(e.target.value)}
                style={campo}
              >
                <option value="">{esAdmin ? "Todos los niveles" : "Sin nivel"}</option>
                {NIVELES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-limite">
                Límite de usuarios
              </label>
              <input
                id="ev-limite"
                type="number"
                min={1}
                max={200}
                value={limite}
                placeholder={
                  esAdmin
                    ? String(LIMITE_ADMIN_DEFECTO)
                    : (salonesFiltrados.find((s) => s.id === salonPrincipal)?.cupo.toString() ??
                      "cupo del salón")
                }
                onChange={(e) => setLimite(e.target.value)}
                style={campo}
              />
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-guia">
                Guía {esAdmin ? "(sala de Zoom)" : "*"}
              </label>
              <select
                id="ev-guia"
                value={guiaUserId}
                onChange={(e) => setGuiaUserId(e.target.value)}
                style={campo}
              >
                <option value="">Seleccionar guía</option>
                {guias.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* El Zoom no se escribe: se hereda del guía. */}
          <div
            style={{
              padding: "0.6rem 0.8rem",
              borderRadius: "0.6rem",
              background: "#fafbfe",
              fontSize: "0.85rem",
            }}
          >
            <span style={{ fontWeight: 700 }}>🔗 Link de Zoom:</span>{" "}
            {guia === null ? (
              <span style={{ color: "var(--texto-suave)" }}>elige un guía para verlo</span>
            ) : guia.zoomUrl !== null && guia.zoomUrl !== "" ? (
              <span>{guia.zoomUrl}</span>
            ) : (
              <span style={{ color: "#b57a00" }}>
                {guia.username} todavía no tiene sala configurada. El evento se crea igual, pero sin
                enlace.
              </span>
            )}
            <div style={{ fontSize: "0.75rem", color: "var(--texto-suave)", marginTop: "0.2rem" }}>
              Se toma de la ficha del guía, no se escribe aquí.
            </div>
          </div>

          {/* Compartir entre cursos: solo tiene sentido en el evento académico. */}
          {!esAdmin && (
            <div
              style={{
                padding: "0.8rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #e3e7f0",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={compartir}
                  onChange={(e) => {
                    setCompartir(e.target.checked);
                    if (!e.target.checked) setExtras([]);
                  }}
                />
                Evento compartido entre cursos
              </label>
              <p
                style={{ fontSize: "0.78rem", color: "var(--texto-suave)", margin: "0.25rem 0 0" }}
              >
                La misma clase en hasta {MAX_COMPARTIDOS - 1} salones adicionales (misma hora, guía
                y Zoom). Para el guía cuenta como una sola hora.
              </p>
              {compartir && (
                <div
                  style={{
                    marginTop: "0.6rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.3rem",
                    maxHeight: "10rem",
                    overflowY: "auto",
                  }}
                >
                  {salonesCompartibles.length === 0 ? (
                    <span style={{ fontSize: "0.82rem", color: "var(--texto-suave)" }}>
                      Elige campaña y país para ver salones disponibles.
                    </span>
                  ) : (
                    salonesCompartibles.map((s) => {
                      const marcado = extras.includes(s.id);
                      const tope = extras.length >= MAX_COMPARTIDOS - 1;
                      return (
                        <label
                          key={s.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.45rem",
                            fontSize: "0.85rem",
                            opacity: !marcado && tope ? 0.5 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={marcado}
                            disabled={!marcado && tope}
                            onChange={(e) => {
                              setExtras((prev) =>
                                e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                              );
                            }}
                          />
                          {s.curso} · {s.nombre}
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* Audiencia: quiénes verán el evento en su calendario. */}
          {esAdmin && (
            <div
              style={{
                padding: "0.8rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #e3e7f0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                  Guías que verán este evento * ({audiencia.length}/{guias.length})
                </span>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    type="button"
                    style={{ ...boton, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                    onClick={() => setAudiencia(guias.map((g) => g.id))}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    style={{ ...boton, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                    onClick={() => setAudiencia([])}
                  >
                    Ninguno
                  </button>
                </div>
              </div>
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "var(--texto-suave)",
                  margin: "0.25rem 0 0.5rem",
                }}
              >
                Solo los seleccionados lo verán en su calendario. Sin ninguno, el evento no se puede
                crear.
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                  maxHeight: "12rem",
                  overflowY: "auto",
                }}
              >
                {guias.length === 0 ? (
                  <span style={{ fontSize: "0.82rem", color: "var(--texto-suave)" }}>
                    No hay guías activos.
                  </span>
                ) : (
                  guias.map((g) => (
                    <label
                      key={g.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={audiencia.includes(g.id)}
                        onChange={(e) => {
                          setAudiencia((prev) =>
                            e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id),
                          );
                        }}
                      />
                      {g.username}
                      {(g.zoomUrl === null || g.zoomUrl === "") && (
                        <span style={{ fontSize: "0.72rem", color: "#b57a00" }}>· sin Zoom</span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div>
            <label style={rotulo} htmlFor="ev-obs">
              Observaciones
            </label>
            <textarea
              id="ev-obs"
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas adicionales sobre el evento"
              style={campo}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem",
              borderTop: "1px solid #eef1f7",
              paddingTop: "0.9rem",
            }}
          >
            <button type="button" onClick={onCerrar} style={boton} disabled={ocupado}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void crear()}
              disabled={ocupado || !listo}
              style={{
                ...boton,
                border: "none",
                background: listo ? "var(--lgs-purpura)" : "#c9c6d8",
                color: "white",
              }}
            >
              {ocupado
                ? "Creando…"
                : esAdmin
                  ? `Crear evento (${String(audiencia.length)} guías)`
                  : `Crear evento${seleccionados.length > 1 ? ` (${String(seleccionados.length)} salones)` : ""}`}
            </button>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 760px) { .ev-dos, .ev-tres { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
