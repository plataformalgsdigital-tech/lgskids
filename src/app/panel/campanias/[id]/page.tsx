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

/** Lo que devuelve el PREVIO del fin del programa (no escribe nada). */
interface Impacto {
  finActual: string;
  finNuevo: string;
  salones: { nombre: string; ahora: number; despues: number }[];
  totalAhora: number;
  totalDespues: number;
  conAsistencia: number;
  cerradas: number;
}

const campoFecha: React.CSSProperties = {
  padding: "0.45rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontFamily: "inherit",
  fontSize: "0.9rem",
};

/**
 * Borrar la campaña se lleva sus cursos, sus niveles y sus salones con todas
 * sus sesiones. Se pide escribir el NOMBRE: es lo único que distingue un clic
 * decidido de uno por inercia, y no hay botón para deshacerlo.
 */
function ConfirmarBorrado(props: {
  campania: string;
  salones: number;
  ocupado: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const [escrito, setEscrito] = useState("");
  const boton: React.CSSProperties = {
    padding: "0.45rem 1rem",
    borderRadius: "0.6rem",
    border: "1px solid #e3e7f0",
    background: "white",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-borrar"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 50,
      }}
      onClick={props.onCancelar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "0.9rem",
          padding: "1.25rem 1.4rem",
          maxWidth: "32rem",
          width: "100%",
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.25)",
        }}
      >
        <h2 id="titulo-borrar" style={{ fontSize: "1.1rem", margin: 0, color: "#c62828" }}>
          🗑 Eliminar {props.campania}
        </h2>
        <ul style={{ fontSize: "0.88rem", paddingLeft: "1.1rem", lineHeight: 1.55 }}>
          <li>
            Se borran sus <strong>cursos, niveles, lecciones y cuestionarios</strong>.
          </li>
          <li>
            Y sus <strong>{props.salones} salones</strong> con todas sus sesiones, horarios y
            suspensiones.
          </li>
          <li>
            <strong>No se puede deshacer.</strong> Para solo cerrarla, deja pasar su fin: el estado
            se deriva de la fecha.
          </li>
        </ul>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>
          Escribe <code>{props.campania}</code> para confirmar
          <input
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            style={{ ...campoFecha, width: "100%", marginTop: "0.25rem" }}
          />
        </label>
        <div
          style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}
        >
          <button style={boton} onClick={props.onCancelar} disabled={props.ocupado}>
            Cancelar
          </button>
          <button
            style={{ ...boton, borderColor: "#c62828", background: "#c62828", color: "white" }}
            onClick={props.onConfirmar}
            disabled={props.ocupado || escrito.trim() !== props.campania}
          >
            Eliminar definitivamente
          </button>
        </div>
      </div>
    </div>
  );
}

/** Estado que tendría la campaña con esas fechas (mismo criterio que el servidor). */
function estadoCon(finalVenta: string, fin: string): Estado {
  const hoy = new Date().toISOString().slice(0, 10);
  if (hoy <= finalVenta) return "EN_MATRICULA";
  return hoy <= fin ? "ACTIVA" : "CERRADA";
}

/**
 * Cambiar estas dos fechas no es guardar un campo: una mueve las clases de
 * todos los salones y la otra decide si la campaña sigue vendiéndose. Se dice
 * ANTES, con números, porque el efecto no se ve en esta pantalla.
 */
function ConfirmarFechas(props: {
  campania: string;
  finActual: string;
  finNuevo: string;
  ventaActual: string;
  ventaNueva: string;
  estadoActual: Estado;
  estadoNuevo: Estado;
  impacto: Impacto | null;
  ocupado: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const cambiaFin = props.finActual !== props.finNuevo;
  const cambiaVenta = props.ventaActual !== props.ventaNueva;
  const cambiaEstado = props.estadoActual !== props.estadoNuevo;
  const bloqueado =
    props.impacto !== null && (props.impacto.conAsistencia > 0 || props.impacto.cerradas > 0);
  const delta = props.impacto === null ? 0 : props.impacto.totalDespues - props.impacto.totalAhora;

  const boton: React.CSSProperties = {
    padding: "0.45rem 1rem",
    borderRadius: "0.6rem",
    border: "1px solid #e3e7f0",
    background: "white",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-fechas"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 50,
      }}
      onClick={props.onCancelar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "0.9rem",
          padding: "1.25rem 1.4rem",
          maxWidth: "36rem",
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.25)",
        }}
      >
        <h2 id="titulo-fechas" style={{ fontSize: "1.1rem", margin: 0 }}>
          ⚠ Cambiar las fechas de {props.campania}
        </h2>

        {cambiaVenta && (
          <div style={{ marginTop: "0.8rem" }}>
            <strong style={{ fontSize: "0.9rem" }}>Cierre de ventas</strong>
            <p style={{ margin: "0.2rem 0", fontSize: "0.88rem" }}>
              {props.ventaActual} → <strong>{props.ventaNueva}</strong>
            </p>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
              {cambiaEstado ? (
                <>
                  La campaña pasa de <strong>{ESTADO_CAMPANIA[props.estadoActual].texto}</strong> a{" "}
                  <strong>{ESTADO_CAMPANIA[props.estadoNuevo].texto}</strong>. En matrícula es la
                  única que se ofrece en el wizard de contratos y en las reservas de LGS.
                </>
              ) : (
                <>
                  El estado sigue siendo <strong>{ESTADO_CAMPANIA[props.estadoNuevo].texto}</strong>
                  . No se tocan sesiones.
                </>
              )}
            </p>
          </div>
        )}

        {cambiaFin && props.impacto !== null && (
          <div style={{ marginTop: "0.9rem" }}>
            <strong style={{ fontSize: "0.9rem" }}>Fin del programa</strong>
            <p style={{ margin: "0.2rem 0", fontSize: "0.88rem" }}>
              {props.impacto.finActual} → <strong>{props.impacto.finNuevo}</strong>
            </p>
            {bloqueado ? (
              <p
                style={{
                  margin: "0.4rem 0",
                  fontSize: "0.85rem",
                  color: "#c62828",
                  background: "#ffebee",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "0.6rem",
                }}
              >
                <strong>No se puede mover.</strong> Ya hay {props.impacto.conAsistencia} sesión(es)
                con asistencia y {props.impacto.cerradas} cerrada(s). Regenerar las borra —la
                asistencia cuelga de la sesión—, así que con el curso andando se alarga o recorta
                con una <strong>sesión extra</strong> o una <strong>suspensión</strong>, no con la
                ventana entera. El cierre de ventas sí se puede cambiar.
              </p>
            ) : (
              <>
                <p style={{ margin: "0.2rem 0", fontSize: "0.88rem" }}>
                  Sesiones: {props.impacto.totalAhora} →{" "}
                  <strong>{props.impacto.totalDespues}</strong>{" "}
                  <span style={{ color: delta >= 0 ? "#1b5e20" : "#c62828", fontWeight: 700 }}>
                    ({delta >= 0 ? "+" : ""}
                    {delta})
                  </span>{" "}
                  en {props.impacto.salones.length} salones.
                </p>
                <ul
                  style={{
                    margin: "0.3rem 0",
                    paddingLeft: "1.1rem",
                    fontSize: "0.82rem",
                    color: "var(--texto-suave)",
                    maxHeight: "9rem",
                    overflowY: "auto",
                  }}
                >
                  {props.impacto.salones.map((s) => (
                    <li key={s.nombre}>
                      {s.nombre}: {s.ahora} → {s.despues}
                    </li>
                  ))}
                </ul>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--texto-suave)" }}>
                  Las sesiones se BORRAN y se vuelven a crear desde el horario, respetando feriados
                  y suspensiones. Los eventos sueltos (talleres, clases extra) no se tocan.
                </p>
              </>
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            justifyContent: "flex-end",
            marginTop: "1rem",
          }}
        >
          <button style={boton} onClick={props.onCancelar} disabled={props.ocupado}>
            Cancelar
          </button>
          <button
            style={{
              ...boton,
              borderColor: "var(--lgs-verde)",
              background: "var(--lgs-verde)",
              color: "#1b2a10",
            }}
            onClick={props.onConfirmar}
            disabled={props.ocupado || (bloqueado && !cambiaVenta)}
          >
            {bloqueado && cambiaVenta ? "Guardar solo el cierre de ventas" : "Sí, guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  // Edición: el nombre y el inicio comercial son la ficha; el inicio y el fin
  // del PROGRAMA mueven SESIONES y el cierre de ventas mueve el ESTADO, así que
  // ninguno de esos dos se guarda sin enseñar qué pasa.
  const [nombreEdit, setNombreEdit] = useState("");
  const [inicioEdit, setInicioEdit] = useState("");
  const [programaEdit, setProgramaEdit] = useState("");
  const [finEdit, setFinEdit] = useState("");
  const [ventaEdit, setVentaEdit] = useState("");
  const [impacto, setImpacto] = useState<Impacto | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);

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
      setNombreEdit(campania.nombre);
      setInicioEdit(campania.inicio);
      setFinEdit(campania.fin);
      setVentaEdit(campania.finalVenta);
      // Los cursos comparten ventana; basta el primero.
      setProgramaEdit(campania.courses[0]?.inicio ?? "");
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

  /** ¿Cambió la ventana que GENERA sesiones (inicio o fin del programa)? */
  function ventanaCambio(): boolean {
    return finEdit !== (detalle?.fin ?? "") || programaEdit !== (detalle?.courses[0]?.inicio ?? "");
  }

  /** Pide el PREVIO y abre la confirmación. No escribe nada todavía. */
  async function revisarCambio() {
    if (detalle === null) return;
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      if (!ventanaCambio()) {
        // Nombre, inicio comercial o cierre de ventas: no se tocan sesiones.
        setImpacto(null);
        setConfirmando(true);
        return;
      }
      const res = await apiFetch(
        `/api/scheduling/campaigns/${params.id}/fin-programa?fin=${finEdit}&inicio=${programaEdit}`,
      );
      const data: Impacto & { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo calcular el impacto.");
        return;
      }
      setImpacto(data);
      setConfirmando(true);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Guarda: primero las fechas de la campaña (estado derivado y ventana de
   * venta) y, si cambió el fin del programa, mueve las sesiones.
   */
  async function guardarFechas() {
    if (detalle === null) return;
    setConfirmando(false);
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      // Con historia, la ventana del programa NO se mueve: se guarda el resto.
      // Mandar el fin igual dejaría la campaña diciendo que termina en una
      // fecha que sus sesiones no reflejan.
      const bloqueado = impacto !== null && (impacto.conAsistencia > 0 || impacto.cerradas > 0);
      const mueveVentana = ventanaCambio() && !bloqueado;
      const fin = bloqueado ? detalle.fin : finEdit;
      if (bloqueado) {
        setFinEdit(detalle.fin);
        setProgramaEdit(detalle.courses[0]?.inicio ?? "");
      }

      const res = await apiFetch(`/api/catalog/campaigns/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombreEdit.trim(),
          inicio: inicioEdit,
          fin,
          finalVenta: ventaEdit,
        }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo guardar la campaña.");
        return;
      }
      let extra = "";
      if (mueveVentana) {
        const r2 = await apiFetch(`/api/scheduling/campaigns/${params.id}/fin-programa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fin: finEdit, inicio: programaEdit }),
        });
        const d2: { salones?: number; sesiones?: number; error?: { message: string } } =
          await r2.json();
        if (!r2.ok) {
          // Los datos de la campaña YA cambiaron; las sesiones no. Se dice.
          setError(
            `${d2.error?.message ?? "No se pudieron regenerar las sesiones."} Los demás datos de la campaña sí se guardaron.`,
          );
          await cargar();
          return;
        }
        extra = ` ${String(d2.sesiones ?? 0)} sesiones regeneradas en ${String(d2.salones ?? 0)} salones.`;
      }
      setAviso(`Campaña actualizada.${extra}`);
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Borra la campaña con sus cursos y salones. Se pide escribir el NOMBRE: es
   * lo que se borra y no hay botón para deshacerlo.
   */
  async function eliminarCampania() {
    if (detalle === null) return;
    setBorrando(false);
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/catalog/campaigns/${params.id}`, { method: "DELETE" });
      const data: { salones?: number; error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo eliminar la campaña.");
        return;
      }
      router.replace("/panel/campanias");
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginTop: "0.5rem",
        }}
      >
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
        Campaña: {detalle.inicio} → {detalle.fin} (12 meses) · Cierre de ventas:{" "}
        {detalle.finalVenta}
      </p>

      {/* ── Editar fechas de la campaña ───────────────────────── */}
      <section
        style={{
          marginTop: "1rem",
          padding: "1rem 1.1rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          display: "flex",
          gap: "0.8rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <strong style={{ width: "100%", fontSize: "0.95rem" }}>Editar campaña</strong>
        <label
          style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 13rem" }}
        >
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Nombre Campaña</span>
          <input
            value={nombreEdit}
            onChange={(e) => setNombreEdit(e.target.value)}
            maxLength={80}
            style={campoFecha}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Inicio de campaña</span>
          <input
            type="date"
            value={inicioEdit}
            onChange={(e) => setInicioEdit(e.target.value)}
            style={campoFecha}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Inicio del Programa</span>
          <input
            type="date"
            value={programaEdit}
            onChange={(e) => setProgramaEdit(e.target.value)}
            style={campoFecha}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Fin del Programa</span>
          <input
            type="date"
            value={finEdit}
            onChange={(e) => setFinEdit(e.target.value)}
            style={campoFecha}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Cierre de Ventas</span>
          <input
            type="date"
            value={ventaEdit}
            onChange={(e) => setVentaEdit(e.target.value)}
            style={campoFecha}
          />
        </label>
        <button
          onClick={() => void revisarCambio()}
          disabled={
            ocupado ||
            (nombreEdit.trim() === detalle.nombre &&
              inicioEdit === detalle.inicio &&
              ventaEdit === detalle.finalVenta &&
              !ventanaCambio())
          }
          style={{
            padding: "0.5rem 1.1rem",
            borderRadius: "0.6rem",
            border: "1px solid var(--lgs-verde)",
            background: "var(--lgs-verde)",
            color: "#1b2a10",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Revisar cambio →
        </button>
        <button
          onClick={() => setBorrando(true)}
          disabled={ocupado}
          style={{
            padding: "0.5rem 1.1rem",
            borderRadius: "0.6rem",
            border: "1px solid #ef9a9a",
            background: "white",
            color: "#c62828",
            fontWeight: 700,
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          🗑 Eliminar campaña
        </button>
        <p
          style={{
            width: "100%",
            margin: 0,
            fontSize: "0.78rem",
            color: "var(--texto-suave)",
          }}
        >
          El <strong>inicio</strong> y el <strong>fin del programa</strong> alargan, recortan o
          corren las sesiones de <strong>todos los salones</strong> de la campaña; el{" "}
          <strong>cierre de ventas</strong> decide hasta cuándo se ofrece (su estado). El nombre y
          el inicio de campaña no tocan el calendario. Antes de guardar se muestra qué cambia.
        </p>
      </section>

      {borrando && (
        <ConfirmarBorrado
          campania={detalle.nombre}
          salones={filas.length}
          ocupado={ocupado}
          onCancelar={() => setBorrando(false)}
          onConfirmar={() => void eliminarCampania()}
        />
      )}

      {confirmando && (
        <ConfirmarFechas
          campania={detalle.nombre}
          finActual={detalle.fin}
          finNuevo={finEdit}
          ventaActual={detalle.finalVenta}
          ventaNueva={ventaEdit}
          estadoActual={detalle.estado}
          estadoNuevo={estadoCon(ventaEdit, finEdit)}
          impacto={impacto}
          ocupado={ocupado}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => void guardarFechas()}
        />
      )}

      {aviso !== null && (
        <p
          style={{
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
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
              href="/panel/calendario"
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
            <Link href="/panel/calendario">Salones</Link>.
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
                  <th style={th}>Cierre ventas</th>
                  <th style={th}>Cupos</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ curso, salon }) => {
                  const lleno = salon.ocupados >= salon.cupo;
                  return (
                    <tr
                      key={salon.id}
                      style={{
                        borderBottom: "1px solid #edf0f6",
                        opacity: salon.activo ? 1 : 0.55,
                      }}
                    >
                      <td style={{ ...td, fontWeight: 700, color: "var(--lgs-azul-oscuro)" }}>
                        {curso.tipo}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {etiquetaSalon(salon.nombre, curso.tipo)}
                      </td>
                      <td style={{ ...td, whiteSpace: "normal" }}>
                        {salon.guia ?? (
                          <span style={{ color: "var(--texto-suave)" }}>— sin guía —</span>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: "normal" }}>
                        {resumenHorario(salon.horario)}
                      </td>
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
                        <span
                          style={{ display: "inline-flex", gap: "0.6rem", alignItems: "center" }}
                        >
                          <Link href={`/panel/calendario/${salon.id}`} title="Editar salón">
                            ✏️
                          </Link>
                          <button
                            type="button"
                            onClick={() => void eliminarSalon(salon)}
                            disabled={ocupado}
                            title="Eliminar salón"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "0.95rem",
                            }}
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
                    <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", fontWeight: 700 }}>
                      🏅 Level Up
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </section>
    </main>
  );
}
