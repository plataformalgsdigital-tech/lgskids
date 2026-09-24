"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Evento del calendario en MODAL (antes era una página aparte).
 *
 * Reparto de poder, tal como lo pidió el negocio:
 *  - El nombre del guía SIEMPRE se ve. Lo que se oculta al guía es el botón de
 *    CAMBIARLO, y suspender el día: ambos son de coordinación.
 *  - El guía sí puede registrar la sesión (cerrarla) y SOLICITAR repetirla.
 *
 * La ficha del alumno se guarda por el MISMO camino que la asistencia
 * (`POST /api/attendance/sessions/[id]`), que es el que dispara la progresión.
 * No se abre un segundo camino de escritura (regla 4).
 */

type EstadoAsistencia = "PRESENTE" | "AUSENTE" | "JUSTIFICADO";

interface Marca {
  estado: EstadoAsistencia;
  justificacion: string | null;
  participo: boolean;
  comentarioUsuario: string | null;
  notaPrivada: string | null;
  requiereAtencion: boolean;
}
interface Fila {
  childPersonId: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  paisContrato: string;
  feriadoEnSuPais: boolean;
  marca: Marca | null;
}
interface Sesion {
  id: string;
  classroomId: string;
  salon: string;
  tipo: string;
  fecha: string;
  startsAt: string;
  numero: number;
  guia: string | null;
  meetingUrl: string | null;
  cerradaEn: string | null;
  campania: string | null;
  cursoTipo: string | null;
  cupo: number;
}
interface Enlace {
  nombre?: string;
  enlace?: string;
  url?: string;
}
interface CursoRef {
  id: string;
  nivel: string;
  unidad: number;
  leccion: number;
  material_usuario: Enlace[] | null;
  material_guia: Enlace[] | null;
  recursos: Enlace[] | null;
}
interface Repeticion {
  id: string;
  motivo: string;
  repetirLeccion: boolean;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  solicitante: string | null;
  createdAt: string;
}

const caja: CSSProperties = {
  background: "white",
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1rem 1.1rem",
};
const boton: CSSProperties = {
  padding: "0.5rem 0.9rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.85rem",
};
const botonPrimario: CSSProperties = {
  ...boton,
  border: "none",
  background: "var(--lgs-azul)",
  color: "white",
};

/** Una unidad abierta a un niño (la misión de su libro). */
interface Mision {
  childPersonId: string;
  curso: string;
  nivel: string;
  parada: number;
  etiqueta: string;
  autorizadoEn: string;
  autorizadoPor: string | null;
}

interface Parada {
  parada: number;
  etiqueta: string;
}

/** Ficha en blanco: al guardar se vuelve a este estado. */
const FICHA_VACIA = {
  estado: "PRESENTE" as EstadoAsistencia,
  justificacion: "",
  participo: false,
  comentarioUsuario: "",
  notaPrivada: "",
  requiereAtencion: false,
};

export function SesionModal({
  sessionId,
  puedeGestionarSalones,
  onCerrar,
}: {
  sessionId: string;
  /** `salones.gestionar`: solo coordinación cambia guía y suspende. */
  puedeGestionarSalones: boolean;
  onCerrar: () => void;
}) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [lista, setLista] = useState<Fila[]>([]);
  const [repeticiones, setRepeticiones] = useState<Repeticion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Alumno abierto en la segunda caja + su ficha en edición.
  const [alumno, setAlumno] = useState<Fila | null>(null);
  const [ficha, setFicha] = useState({ ...FICHA_VACIA });
  const [pidiendoRepeticion, setPidiendoRepeticion] = useState(false);
  // Cambiar guía / suspender: solo coordinación llega hasta aquí.
  const [guias, setGuias] = useState<{ id: string; username: string }[]>([]);
  const [cambiandoGuia, setCambiandoGuia] = useState(false);
  const [nuevoGuia, setNuevoGuia] = useState("");
  // Registrar sesión: hora (sugerida = ahora), nota y confirmación.
  const [registrando, setRegistrando] = useState(false);
  const [horaReal, setHoraReal] = useState("");
  const [notaSesion, setNotaSesion] = useState("");
  const [confirmoSinNadie, setConfirmoSinNadie] = useState(false);
  const [suspendiendo, setSuspendiendo] = useState(false);
  const [motivoSuspension, setMotivoSuspension] = useState("");
  // Contenido del curso: libros, material y recursos.
  const [contenido, setContenido] = useState<CursoRef[] | null>(null);
  const [pestana, setPestana] = useState<"material_usuario" | "material_guia" | "recursos" | null>(
    null,
  );
  const [motivo, setMotivo] = useState("");
  const [repetirLeccion, setRepetirLeccion] = useState(false);
  const [cursoRefId, setCursoRefId] = useState("");
  // Misiones: la unidad que el guía abre en clase (evaluación, juego y souvenir
  // del libro). El NIVEL se elige —el libro es uno por nivel— y se sugiere el
  // que trabaja la mayoría del grupo.
  const [misiones, setMisiones] = useState<Mision[]>([]);
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [niveles, setNiveles] = useState<{ codigo: string; nombre: string }[]>([]);
  /** El nivel que trabaja cada niño: para sugerir el de la clase y avisar. */
  const [nivelesNinos, setNivelesNinos] = useState<Record<string, string | null>>({});
  const [nivelElegido, setNivelElegido] = useState("");
  const [abriendoMision, setAbriendoMision] = useState(false);
  const [paradaElegida, setParadaElegida] = useState(1);
  /** Por defecto se abre a TODA la lista; aquí van los que el guía desmarca. */
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    try {
      const [rl, rr, rm] = await Promise.all([
        apiFetch(`/api/attendance/sessions/${sessionId}`),
        apiFetch(`/api/scheduling/sessions/${sessionId}/registro`),
        apiFetch(`/api/scheduling/sessions/${sessionId}/misiones`),
      ]);
      if (!rl.ok) {
        setError("No se pudo cargar la sesión.");
        return;
      }
      const datos = (await rl.json()) as { sesion: Sesion; lista: Fila[] };
      setSesion(datos.sesion);
      setLista(datos.lista);
      if (rr.ok) {
        setRepeticiones(((await rr.json()) as { repeticiones: Repeticion[] }).repeticiones);
      }
      if (rm.ok) {
        const d = (await rm.json()) as {
          misiones: Mision[];
          paradas: Parada[];
          niveles: { codigo: string; nombre: string }[];
        };
        setMisiones(d.misiones);
        setParadas(d.paradas);
        setNiveles(d.niveles);
      }
      setError(null);
    } catch {
      setError("Error de conexión.");
    }
  }, [sessionId]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  function abrirAlumno(f: Fila) {
    setAlumno(f);
    setFicha({
      estado: f.marca?.estado ?? "PRESENTE",
      justificacion: f.marca?.justificacion ?? "",
      participo: f.marca?.participo ?? false,
      comentarioUsuario: f.marca?.comentarioUsuario ?? "",
      notaPrivada: f.marca?.notaPrivada ?? "",
      requiereAtencion: f.marca?.requiereAtencion ?? false,
    });
  }

  /** Guarda la ficha de UN alumno y deja la caja en blanco para el siguiente. */
  async function guardarRegistro() {
    if (alumno === null) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/attendance/sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marcas: [
            {
              childPersonId: alumno.childPersonId,
              estado: ficha.estado,
              justificacion: ficha.justificacion.trim() === "" ? null : ficha.justificacion,
              participo: ficha.participo,
              comentarioUsuario:
                ficha.comentarioUsuario.trim() === "" ? null : ficha.comentarioUsuario,
              notaPrivada: ficha.notaPrivada.trim() === "" ? null : ficha.notaPrivada,
              requiereAtencion: ficha.requiereAtencion,
            },
          ],
        }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo guardar el registro.");
        return;
      }
      setAviso(`Registro de ${alumno.nombres} guardado.`);
      setAlumno(null);
      setFicha({ ...FICHA_VACIA });
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function accionRegistro(cuerpo: Record<string, unknown>, exito: string) {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/scheduling/sessions/${sessionId}/registro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo completar la acción.");
        return;
      }
      setAviso(exito);
      setRegistrando(false);
      setPidiendoRepeticion(false);
      setMotivo("");
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Al abrir el panel se pregunta el nivel que trabaja cada niño, y se sugiere
   * el más repetido: es el de la clase. El nivel IMPORTA porque el libro es uno
   * por nivel — abrir la Unidad 1 de Champion no abre nada en el de Rookie.
   */
  async function abrirPanelMision() {
    setAbriendoMision((v) => !v);
    if (Object.keys(nivelesNinos).length > 0) return;
    const res = await apiFetch(`/api/scheduling/sessions/${sessionId}/misiones?conNiveles=1`);
    if (!res.ok) return;
    const d = (await res.json()) as { ninos?: { childPersonId: string; nivel: string | null }[] };
    const porNino = Object.fromEntries((d.ninos ?? []).map((n) => [n.childPersonId, n.nivel]));
    setNivelesNinos(porNino);
    const cuenta = new Map<string, number>();
    for (const nivel of Object.values(porNino)) {
      if (nivel !== null) cuenta.set(nivel, (cuenta.get(nivel) ?? 0) + 1);
    }
    const masRepetido = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    setNivelElegido(masRepetido ?? niveles[0]?.codigo ?? "");
  }

  /** Abre la unidad elegida, en el nivel de la clase, a los niños marcados. */
  async function abrirMision() {
    const elegidos = lista.map((f) => f.childPersonId).filter((id) => !excluidos.has(id));
    if (elegidos.length === 0) {
      setError("Marca al menos un niño.");
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/scheduling/sessions/${sessionId}/misiones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parada: paradaElegida,
          nivel: nivelElegido === "" ? null : nivelElegido,
          childPersonIds: elegidos,
        }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo abrir la misión.");
        return;
      }
      const { resultados } = (await res.json()) as {
        resultados: { childPersonId: string; nivel: string | null; yaEstaba: boolean }[];
      };
      const abiertas = resultados.filter((r) => r.nivel !== null && !r.yaEstaba).length;
      const yaTenian = resultados.filter((r) => r.yaEstaba).length;
      const sinMatricula = resultados.filter((r) => r.nivel === null).length;
      const etiqueta = paradas.find((p) => p.parada === paradaElegida)?.etiqueta ?? "La unidad";
      setAviso(
        `${etiqueta}: abierta a ${String(abiertas)} niño(s)` +
          (yaTenian > 0 ? `, ${String(yaTenian)} ya la tenía(n)` : "") +
          (sinMatricula > 0 ? `. ${String(sinMatricula)} sin matrícula activa` : "") +
          ".",
      );
      setAbriendoMision(false);
      setExcluidos(new Set());
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  /** Cierra una unidad abierta por error: el niño deja de verla en su libro. */
  async function cerrarMision(m: Mision, nombre: string) {
    if (!window.confirm(`¿Cerrar ${m.etiqueta} de ${m.nivel} a ${nombre}?`)) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/scheduling/sessions/${sessionId}/misiones`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childPersonId: m.childPersonId,
          curso: m.curso,
          nivel: m.nivel,
          parada: m.parada,
        }),
      });
      if (!res.ok) {
        setError("No se pudo cerrar la misión.");
        return;
      }
      setAviso(`${m.etiqueta} cerrada a ${nombre}.`);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  /** Guías disponibles: se piden solo cuando se va a cambiar. */
  async function abrirCambioGuia() {
    setCambiandoGuia((v) => !v);
    if (guias.length === 0) {
      const res = await apiFetch("/api/identity/guides");
      if (res.ok)
        setGuias(((await res.json()) as { guias: { id: string; username: string }[] }).guias);
    }
  }

  async function cambiarGuia() {
    if (sesion === null) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/scheduling/classrooms/${sesion.classroomId}/guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guiaUserId: nuevoGuia === "" ? null : nuevoGuia }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo cambiar el guía.");
        return;
      }
      setAviso("Guía actualizado.");
      setCambiandoGuia(false);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function suspenderDia() {
    if (sesion === null) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/scheduling/classrooms/${sesion.classroomId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: sesion.fecha, motivo: motivoSuspension.trim() }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo suspender.");
        return;
      }
      setAviso("Día suspendido. La sesión se corrió al final del curso.");
      setSuspendiendo(false);
      setMotivoSuspension("");
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Referencia curricular del curso. La usan las pestañas de material y el
   * selector de lección al pedir un refuerzo. Se pide UNA vez por sesión.
   */
  async function cargarReferencia() {
    if (contenido !== null || sesion === null) return;
    const res = await apiFetch(`/api/catalog/curso?curso=${sesion.cursoTipo ?? ""}`);
    if (res.ok) setContenido(((await res.json()) as { referencias: CursoRef[] }).referencias ?? []);
    else setContenido([]);
  }

  /** Material del curso. Todavía sin nivel: llega cuando exista Niveles. */
  async function abrirContenido(cual: "material_usuario" | "material_guia" | "recursos") {
    if (pestana === cual) {
      setPestana(null);
      return;
    }
    setPestana(cual);
    await cargarReferencia();
  }

  /** Abre el registro proponiendo la hora actual del navegador. */
  function abrirRegistro() {
    if (registrando) {
      setRegistrando(false);
      return;
    }
    const ahora = new Date();
    setHoraReal(
      `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`,
    );
    setNotaSesion("");
    setConfirmoSinNadie(false);
    setRegistrando(true);
  }

  const cerrada = sesion?.cerradaEn != null;
  const sinNingunaMarca = lista.every((f) => f.marca === null);
  const pendiente = repeticiones.find((r) => r.estado === "PENDIENTE") ?? null;

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Evento del calendario"
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
          maxWidth: "68rem",
          background: "#f8f9fc",
          borderRadius: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #e3e7f0",
            background: "white",
          }}
        >
          <h2 style={{ fontSize: "1.2rem", fontWeight: 800 }}>
            🗓️{" "}
            {sesion === null
              ? "Cargando…"
              : `${sesion.tipo === "CLUB" ? "Club" : `Sesión ${String(sesion.numero)}`} · ${sesion.salon}`}
            {cerrada && (
              <span
                style={{
                  marginLeft: "0.6rem",
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  color: "#1b5e20",
                  background: "#e8f5e9",
                  padding: "0.15rem 0.55rem",
                  borderRadius: "999px",
                }}
              >
                REGISTRADA
              </span>
            )}
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
            padding: "1.1rem 1.25rem 1.4rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.9rem",
          }}
        >
          {error !== null && (
            <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
              {error}
            </p>
          )}
          {aviso !== null && <p style={{ color: "#1b5e20", fontWeight: 600 }}>{aviso}</p>}

          {/* ── Información del evento + guía ───────────────────── */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "0.9rem" }}
            className="ses-dos"
          >
            <section style={caja}>
              <h3 style={{ fontSize: "0.96rem", fontWeight: 800, marginBottom: "0.5rem" }}>
                Información del evento
              </h3>
              {sesion !== null && (
                <div
                  style={{
                    fontSize: "0.88rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.2rem",
                  }}
                >
                  <span>
                    📅{" "}
                    {new Date(`${sesion.fecha}T12:00:00`).toLocaleDateString("es", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <span>
                    🕐{" "}
                    {new Date(sesion.startsAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>
                    👥 Cupo {sesion.cupo} · {sesion.cursoTipo} · Campaña {sesion.campania}
                  </span>
                  {/* La LECCIÓN entra aquí cuando exista el módulo de Niveles. */}
                  <span style={{ color: "var(--texto-suave)" }}>
                    📘 Lección: se asignará desde Niveles
                  </span>
                  <span>🔗 {sesion.meetingUrl ?? "Sin enlace configurado"}</span>
                </div>
              )}
            </section>

            <section style={caja}>
              <h3 style={{ fontSize: "0.96rem", fontWeight: 800, marginBottom: "0.5rem" }}>Guía</h3>
              {/* El NOMBRE siempre se ve; cambiarlo es de coordinación. */}
              <p style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                {sesion?.guia ?? "Sin guía asignado"}
              </p>
              {puedeGestionarSalones && (
                <>
                  <button
                    type="button"
                    style={{ ...boton, marginTop: "0.6rem" }}
                    disabled={ocupado}
                    onClick={() => void abrirCambioGuia()}
                  >
                    🔀 Cambiar guía
                  </button>
                  {cambiandoGuia && (
                    <div
                      style={{
                        marginTop: "0.6rem",
                        display: "flex",
                        gap: "0.4rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <select
                        value={nuevoGuia}
                        onChange={(e) => setNuevoGuia(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: "9rem",
                          padding: "0.45rem",
                          borderRadius: "0.5rem",
                          border: "1.5px solid #d8dce6",
                        }}
                      >
                        <option value="">— Sin guía —</option>
                        {guias.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.username}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        style={botonPrimario}
                        disabled={ocupado}
                        onClick={() => void cambiarGuia()}
                      >
                        Guardar
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          {/* ── Acciones ────────────────────────────────────────── */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              style={botonPrimario}
              disabled={ocupado || cerrada}
              onClick={abrirRegistro}
            >
              ✔ Registrar sesión
            </button>
            {puedeGestionarSalones && cerrada && (
              <button
                type="button"
                style={boton}
                disabled={ocupado}
                onClick={() => void accionRegistro({ accion: "reabrir" }, "Sesión reabierta.")}
              >
                ↩ Reabrir
              </button>
            )}
            <button
              type="button"
              style={boton}
              disabled={ocupado || pendiente !== null}
              onClick={() => {
                setPidiendoRepeticion((v) => !v);
                void cargarReferencia();
              }}
            >
              🔁 {pendiente !== null ? "Repetición solicitada" : "Solicitar repetir sesión"}
            </button>
            <button
              type="button"
              style={{ ...boton, background: abriendoMision ? "#eef2ff" : "white" }}
              disabled={ocupado}
              onClick={() => void abrirPanelMision()}
            >
              🔓 Abrir misión
            </button>
            {puedeGestionarSalones && (
              <button
                type="button"
                style={boton}
                disabled={ocupado}
                onClick={() => setSuspendiendo((v) => !v)}
              >
                ⏸ Suspender este día
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              style={{ ...boton, background: pestana === "material_usuario" ? "#eef2ff" : "white" }}
              onClick={() => void abrirContenido("material_usuario")}
            >
              📚 Libros
            </button>
            <button
              type="button"
              style={{ ...boton, background: pestana === "material_guia" ? "#eef2ff" : "white" }}
              onClick={() => void abrirContenido("material_guia")}
            >
              📖 Material
            </button>
            <button
              type="button"
              style={{ ...boton, background: pestana === "recursos" ? "#eef2ff" : "white" }}
              onClick={() => void abrirContenido("recursos")}
            >
              🔗 Recursos
            </button>
          </div>

          {abriendoMision && (
            <section style={{ ...caja, borderColor: "var(--lgs-verde)" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 800, marginBottom: "0.35rem" }}>
                Abrir la misión de una unidad
              </h3>
              <p
                style={{
                  fontSize: "0.82rem",
                  color: "var(--texto-suave)",
                  marginBottom: "0.7rem",
                }}
              >
                En su libro se abre esa unidad: la evaluación, el juego y el souvenir. Cada niño la
                recibe en el nivel que está trabajando. Se puede cerrar después si te equivocas.
              </p>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  marginBottom: "0.7rem",
                }}
              >
                Nivel que trabaja la clase:
                <select
                  value={nivelElegido}
                  onChange={(e) => setNivelElegido(e.target.value)}
                  style={{
                    padding: "0.35rem 0.5rem",
                    borderRadius: "0.5rem",
                    border: "1.5px solid #d8dce6",
                    fontSize: "0.85rem",
                  }}
                >
                  {niveles.map((n) => (
                    <option key={n.codigo} value={n.codigo}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {paradas.map((p) => (
                  <button
                    key={p.parada}
                    type="button"
                    onClick={() => setParadaElegida(p.parada)}
                    style={{
                      ...boton,
                      borderRadius: "1.2rem",
                      background: paradaElegida === p.parada ? "var(--lgs-verde)" : "white",
                      color: paradaElegida === p.parada ? "#1b2a10" : "inherit",
                      fontWeight: paradaElegida === p.parada ? 800 : 600,
                    }}
                  >
                    {p.etiqueta}
                  </button>
                ))}
              </div>
              <p
                style={{
                  margin: "0.5rem 0 0",
                  fontSize: "0.78rem",
                  color: "var(--texto-suave)",
                }}
              >
                Abrir una unidad deja abierto todo lo anterior: el niño conserva el libro y el
                cuaderno de las unidades que ya pasó.
              </p>

              <div
                style={{
                  marginTop: "0.8rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3rem",
                  maxHeight: "16rem",
                  overflowY: "auto",
                }}
              >
                {lista.map((f) => {
                  const suyas = misiones.filter((m) => m.childPersonId === f.childPersonId);
                  const nombre = `${f.nombres} ${f.apellidos}`;
                  const suNivel = nivelesNinos[f.childPersonId];
                  // Va en otro nivel: se le abre igual, pero en el libro que
                  // abra la clase, no en el suyo. Mejor que lo sepa el guía.
                  const otroNivel =
                    suNivel !== undefined &&
                    suNivel !== null &&
                    nivelElegido !== "" &&
                    suNivel !== nivelElegido;
                  return (
                    <div
                      key={f.childPersonId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                        padding: "0.35rem 0.5rem",
                        borderRadius: "0.5rem",
                        background: "#f7f8fb",
                      }}
                    >
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!excluidos.has(f.childPersonId)}
                          onChange={(e) =>
                            setExcluidos((prev) => {
                              const s = new Set(prev);
                              if (e.target.checked) s.delete(f.childPersonId);
                              else s.add(f.childPersonId);
                              return s;
                            })
                          }
                        />
                        {nombre}
                      </label>
                      {otroNivel && (
                        <span
                          title={`Está trabajando ${suNivel ?? ""}`}
                          style={{ fontSize: "0.72rem", fontWeight: 700, color: "#b26a00" }}
                        >
                          ⚠ va en {suNivel}
                        </span>
                      )}
                      <span style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                        {suyas.map((m) => (
                          <span
                            key={`${m.nivel}-${String(m.parada)}`}
                            title={`${m.nivel} · abierta por ${m.autorizadoPor ?? "el equipo"}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "0.1rem 0.25rem 0.1rem 0.5rem",
                              borderRadius: "0.9rem",
                              background: "#e0f5ec",
                              color: "#1b6b47",
                            }}
                          >
                            {m.etiqueta}
                            <button
                              type="button"
                              aria-label={`Cerrar ${m.etiqueta} a ${nombre}`}
                              disabled={ocupado}
                              onClick={() => void cerrarMision(m, nombre)}
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: "#1b6b47",
                                fontWeight: 800,
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  style={botonPrimario}
                  disabled={ocupado}
                  onClick={() => void abrirMision()}
                >
                  🔓 Abrir a {String(lista.length - excluidos.size)} niño(s)
                </button>
                <button type="button" style={boton} onClick={() => setAbriendoMision(false)}>
                  Cancelar
                </button>
              </div>
            </section>
          )}

          {registrando && (
            <section style={{ ...caja, borderColor: "var(--lgs-azul)" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 800, marginBottom: "0.6rem" }}>
                Registrar la sesión
              </h3>

              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  marginBottom: "0.2rem",
                }}
              >
                ¿A qué hora se dictó?
              </label>
              <input
                type="time"
                value={horaReal}
                onChange={(e) => setHoraReal(e.target.value)}
                style={{
                  padding: "0.45rem 0.6rem",
                  borderRadius: "0.5rem",
                  border: "1.5px solid #d8dce6",
                  fontSize: "0.95rem",
                }}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--texto-suave)", marginTop: "0.2rem" }}>
                Se propuso la hora actual. Cámbiala si la clase fue a otra hora.
              </p>

              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  margin: "0.7rem 0 0.2rem",
                }}
              >
                Nota sobre la sesión
              </label>
              <textarea
                value={notaSesion}
                onChange={(e) => setNotaSesion(e.target.value)}
                rows={2}
                placeholder="¿Cómo fue la clase? (opcional)"
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "0.5rem",
                  border: "1.5px solid #d8dce6",
                  fontFamily: "inherit",
                  fontSize: "0.88rem",
                }}
              />

              {/* Sin ninguna marca: confirmar a propósito que no vino nadie. */}
              {sinNingunaMarca && (
                <div
                  style={{
                    marginTop: "0.7rem",
                    padding: "0.7rem 0.9rem",
                    borderRadius: "0.6rem",
                    background: "#fff8e1",
                    border: "1px solid var(--lgs-amarillo)",
                  }}
                >
                  <p style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                    ⚠️ No marcaste asistencia de ningún estudiante.
                  </p>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      fontSize: "0.85rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={confirmoSinNadie}
                      onChange={(e) => setConfirmoSinNadie(e.target.checked)}
                    />
                    Confirmo que <b>no asistió ningún estudiante</b> a esta sesión.
                  </label>
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.8rem" }}>
                <button
                  type="button"
                  style={botonPrimario}
                  disabled={ocupado || horaReal === "" || (sinNingunaMarca && !confirmoSinNadie)}
                  onClick={() =>
                    void accionRegistro(
                      {
                        accion: "cerrar",
                        horaReal,
                        nota: notaSesion,
                        sinAsistentes: confirmoSinNadie,
                      },
                      "Sesión registrada.",
                    )
                  }
                >
                  Confirmar registro
                </button>
                <button
                  type="button"
                  style={boton}
                  disabled={ocupado}
                  onClick={() => setRegistrando(false)}
                >
                  Cancelar
                </button>
              </div>
            </section>
          )}

          {suspendiendo && (
            <section style={{ ...caja, borderColor: "var(--lgs-magenta)" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 800, marginBottom: "0.5rem" }}>
                Suspender este día
              </h3>
              <p
                style={{ fontSize: "0.8rem", color: "var(--texto-suave)", marginBottom: "0.5rem" }}
              >
                La sesión se corre AL FINAL del curso: el total no cambia y `final_curso` no se
                reescribe.
              </p>
              <input
                value={motivoSuspension}
                onChange={(e) => setMotivoSuspension(e.target.value)}
                placeholder="Motivo (obligatorio)"
                style={{
                  width: "100%",
                  padding: "0.55rem",
                  borderRadius: "0.5rem",
                  border: "1.5px solid #d8dce6",
                  fontSize: "0.88rem",
                }}
              />
              <button
                type="button"
                style={{ ...botonPrimario, marginTop: "0.5rem", background: "var(--lgs-magenta)" }}
                disabled={ocupado || motivoSuspension.trim() === ""}
                onClick={() => void suspenderDia()}
              >
                Suspender
              </button>
            </section>
          )}

          {pestana !== null && (
            <section style={caja}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 800, marginBottom: "0.5rem" }}>
                {pestana === "material_usuario"
                  ? "📚 Libros del estudiante"
                  : pestana === "material_guia"
                    ? "📖 Material del guía"
                    : "🔗 Recursos"}
              </h3>
              {contenido === null ? (
                <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>Cargando…</p>
              ) : contenido.length === 0 ? (
                <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>
                  Todavía no hay contenido cargado para {sesion?.cursoTipo ?? "este curso"}. Se sube
                  en Mantenimiento Académico › Gestión de Contenido.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.3rem",
                    maxHeight: "16rem",
                    overflowY: "auto",
                  }}
                >
                  {contenido.map((c) => {
                    const items = c[pestana] ?? [];
                    if (items.length === 0) return null;
                    return (
                      <div
                        key={c.id}
                        style={{
                          padding: "0.4rem 0.6rem",
                          background: "#fafbfe",
                          borderRadius: "0.5rem",
                          fontSize: "0.84rem",
                        }}
                      >
                        <b>
                          {c.nivel} · Unidad {c.unidad} · Lección {c.leccion}
                        </b>
                        <ul style={{ margin: "0.25rem 0 0 1rem" }}>
                          {items.map((it, i) => (
                            <li key={i}>
                              {typeof it.enlace === "string" || typeof it.url === "string" ? (
                                <a href={it.enlace ?? it.url} target="_blank" rel="noreferrer">
                                  {it.nombre ?? it.enlace ?? it.url}
                                </a>
                              ) : (
                                (it.nombre ?? "—")
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {pidiendoRepeticion && (
            <section style={{ ...caja, borderColor: "var(--lgs-amarillo)" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 800, marginBottom: "0.5rem" }}>
                Solicitar repetición
              </h3>
              <p
                style={{ fontSize: "0.8rem", color: "var(--texto-suave)", marginBottom: "0.5rem" }}
              >
                La aprueba coordinación. Queda registrada en este evento.
              </p>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="¿Por qué hay que repetirla?"
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "0.5rem",
                  border: "1.5px solid #d8dce6",
                  fontFamily: "inherit",
                  fontSize: "0.88rem",
                }}
              />
              <label
                style={{
                  display: "block",
                  margin: "0.6rem 0 0.15rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                }}
                htmlFor="rep-leccion"
              >
                Lección a repetir <span style={{ fontWeight: 400 }}>(referencia)</span>
              </label>
              <select
                id="rep-leccion"
                value={cursoRefId}
                onChange={(e) => setCursoRefId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "0.5rem",
                  border: "1.5px solid #d8dce6",
                  fontFamily: "inherit",
                  fontSize: "0.85rem",
                  background: "white",
                }}
              >
                <option value="">Sin especificar</option>
                {(contenido ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.nivel, c.unidad, c.leccion]
                      .filter((x) => x !== null && x !== "")
                      .join(" · ")}
                  </option>
                ))}
              </select>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  margin: "0.5rem 0",
                  fontSize: "0.85rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={repetirLeccion}
                  onChange={(e) => setRepetirLeccion(e.target.checked)}
                />
                Repetir también la lección
              </label>
              <button
                type="button"
                style={botonPrimario}
                disabled={ocupado || motivo.trim().length < 5}
                onClick={() =>
                  void accionRegistro(
                    {
                      accion: "solicitar_repeticion",
                      motivo,
                      repetirLeccion,
                      cursoRefId: cursoRefId === "" ? null : cursoRefId,
                    },
                    "Solicitud enviada a coordinación.",
                  )
                }
              >
                Enviar solicitud
              </button>
            </section>
          )}

          {repeticiones.length > 0 && (
            <section style={caja}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 800, marginBottom: "0.5rem" }}>
                Solicitudes de repetición
              </h3>
              {repeticiones.map((r) => (
                <div
                  key={r.id}
                  style={{
                    fontSize: "0.84rem",
                    padding: "0.4rem 0",
                    borderBottom: "1px solid #eef1f7",
                  }}
                >
                  <b>{r.estado}</b> · {r.motivo}
                  {r.repetirLeccion && " (con lección)"}
                  <span style={{ color: "var(--texto-suave)" }}> — {r.solicitante ?? "—"}</span>
                </div>
              ))}
            </section>
          )}

          {/* ── Lista + ficha del alumno ────────────────────────── */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: "0.9rem" }}
            className="ses-dos"
          >
            {/* Caja 1: lista. La asistencia se marca en la ficha, no aquí. */}
            <section style={caja}>
              <h3 style={{ fontSize: "0.96rem", fontWeight: 800 }}>
                Estudiantes inscritos ({lista.length}/{sesion?.cupo ?? 0})
              </h3>
              <p
                style={{
                  fontSize: "0.76rem",
                  color: "var(--texto-suave)",
                  margin: "0.15rem 0 0.7rem",
                }}
              >
                Haz clic en un estudiante para marcar su asistencia y dejar su registro.
              </p>
              {lista.length === 0 ? (
                <p style={{ color: "var(--texto-suave)", fontSize: "0.88rem" }}>
                  Sin matrículas todavía. La lista se deriva de las matrículas activas.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {lista.map((f) => (
                    <div
                      key={f.childPersonId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        padding: "0.5rem 0.6rem",
                        borderRadius: "0.5rem",
                        background:
                          alumno?.childPersonId === f.childPersonId ? "#eef2ff" : "#fafbfe",
                        borderLeft: `3px solid ${f.marca === null ? "#e3e7f0" : f.marca.estado === "PRESENTE" ? "var(--lgs-verde)" : "var(--lgs-magenta)"}`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => abrirAlumno(f)}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          padding: 0,
                          font: "inherit",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {f.nombres} {f.apellidos}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: "0.72rem",
                            color: "var(--texto-suave)",
                          }}
                        >
                          {f.paisContrato}
                          {f.feriadoEnSuPais && " · feriado en su país"}
                        </span>
                      </button>
                      {f.marca?.participo === true && <span title="Participó">💬</span>}
                      {f.marca?.requiereAtencion === true && (
                        <span title="Requiere atención">⚠️</span>
                      )}
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 800,
                          padding: "0.15rem 0.5rem",
                          borderRadius: "999px",
                          whiteSpace: "nowrap",
                          color:
                            f.marca === null
                              ? "#9e9e9e"
                              : f.marca.estado === "PRESENTE"
                                ? "#1b5e20"
                                : f.marca.estado === "AUSENTE"
                                  ? "#c62828"
                                  : "#8a6d00",
                          background:
                            f.marca === null
                              ? "#f5f5f5"
                              : f.marca.estado === "PRESENTE"
                                ? "#e8f5e9"
                                : f.marca.estado === "AUSENTE"
                                  ? "#ffebee"
                                  : "#fff8e1",
                        }}
                      >
                        {f.marca === null
                          ? "sin marcar"
                          : f.marca.estado === "PRESENTE"
                            ? "✔ asistió"
                            : f.marca.estado === "AUSENTE"
                              ? "✘ ausente"
                              : "📝 justificado"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Caja 2: ficha del alumno seleccionado */}
            <section style={caja}>
              {alumno === null ? (
                <p style={{ color: "var(--texto-suave)", fontSize: "0.88rem" }}>
                  Haz clic en el nombre de un estudiante para abrir su registro.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 800 }}>
                    {alumno.nombres} {alumno.apellidos}
                  </h3>

                  <div>
                    <p
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        color: "var(--texto-suave)",
                      }}
                    >
                      ASISTENCIA
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.4rem",
                        flexWrap: "wrap",
                        marginTop: "0.35rem",
                      }}
                    >
                      {(["PRESENTE", "AUSENTE", "JUSTIFICADO"] as EstadoAsistencia[]).map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => setFicha((f) => ({ ...f, estado: e }))}
                          style={{
                            ...boton,
                            background: ficha.estado === e ? "var(--lgs-azul)" : "white",
                            color: ficha.estado === e ? "white" : "inherit",
                            border: ficha.estado === e ? "none" : boton.border,
                          }}
                        >
                          {e === "PRESENTE"
                            ? "✔ Asistió"
                            : e === "AUSENTE"
                              ? "✘ Ausente"
                              : "📝 Justificado"}
                        </button>
                      ))}
                    </div>
                    {ficha.estado === "JUSTIFICADO" && (
                      <input
                        value={ficha.justificacion}
                        onChange={(e) => setFicha((f) => ({ ...f, justificacion: e.target.value }))}
                        placeholder="Justificación (obligatoria)"
                        style={{
                          width: "100%",
                          marginTop: "0.4rem",
                          padding: "0.5rem",
                          borderRadius: "0.5rem",
                          border: "1.5px solid #d8dce6",
                          fontSize: "0.88rem",
                        }}
                      />
                    )}
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ficha.participo}
                      onChange={(e) => setFicha((f) => ({ ...f, participo: e.target.checked }))}
                    />
                    Participó activamente
                  </label>

                  <div>
                    <p
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        color: "var(--texto-suave)",
                        marginBottom: "0.3rem",
                      }}
                    >
                      💬 COMENTARIOS PARA EL USUARIO
                    </p>
                    <textarea
                      value={ficha.comentarioUsuario}
                      rows={3}
                      onChange={(e) =>
                        setFicha((f) => ({ ...f, comentarioUsuario: e.target.value }))
                      }
                      placeholder="Lo verá el estudiante en su panel…"
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        borderRadius: "0.5rem",
                        border: "1.5px solid #d8dce6",
                        fontFamily: "inherit",
                        fontSize: "0.88rem",
                      }}
                    />
                  </div>

                  <div>
                    <p
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        color: "var(--texto-suave)",
                        marginBottom: "0.3rem",
                      }}
                    >
                      📄 ANOTACIONES PRIVADAS
                    </p>
                    <textarea
                      value={ficha.notaPrivada}
                      rows={3}
                      onChange={(e) => setFicha((f) => ({ ...f, notaPrivada: e.target.value }))}
                      placeholder="Solo lo ve el equipo. El estudiante nunca lo lee."
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        borderRadius: "0.5rem",
                        border: "1.5px solid #d8dce6",
                        fontFamily: "inherit",
                        fontSize: "0.88rem",
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setFicha((f) => ({ ...f, requiereAtencion: !f.requiereAtencion }))
                    }
                    style={{
                      ...boton,
                      alignSelf: "flex-start",
                      background: ficha.requiereAtencion ? "#ffebee" : "white",
                      borderColor: ficha.requiereAtencion ? "#c62828" : "#e3e7f0",
                      color: ficha.requiereAtencion ? "#c62828" : "inherit",
                    }}
                  >
                    ⚠️ {ficha.requiereAtencion ? "Marcado: requiere atención" : "Requiere atención"}
                  </button>

                  <button
                    type="button"
                    style={botonPrimario}
                    disabled={ocupado}
                    onClick={() => void guardarRegistro()}
                  >
                    💾 Guardar registro
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 900px) { .ses-dos { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
