"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Campania {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  finalVenta: string;
  cursoInicio: string | null;
  estado: "EN_MATRICULA" | "ACTIVA" | "CERRADA";
  cursos: number;
}

/** Suma meses calendario a una fecha YYYY-MM-DD (UTC puro). "" si vacía. */
function sumarMeses(fecha: string, meses: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "";
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCMonth(dt.getUTCMonth() + meses);
  return dt.toISOString().slice(0, 10);
}

/** Suma días a una fecha YYYY-MM-DD (UTC puro). "" si vacía. */
function sumarDias(fecha: string, dias: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "";
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!) + dias * 86400000).toISOString().slice(0, 10);
}

interface Guia {
  id: string;
  nombre: string | null;
  username: string;
}

type TipoCurso = "JUNIOR" | "YOUNGSTER";

interface SlotForm {
  tipo: "SESION" | "CLUB";
  diaSemana: number; // 0=domingo … 6=sábado
  horaLocal: string; // HH:MM
  duracionMin: number;
}

interface SalonForm {
  nombre: string;
  tipo: TipoCurso;
  guiaUserId: string; // "" = sin guía
  cupo: string;
  pais: string; // CL/CO/EC/PE → deriva zona y feriados
  meetingUrl: string;
  slots: SlotForm[];
}

interface ProgresoSalon {
  estado: "pendiente" | "creando" | "ok" | "error";
  mensaje?: string;
}

const ESTILO_ESTADO: Record<Campania["estado"], { texto: string; color: string; fondo: string }> = {
  EN_MATRICULA: { texto: "En matrícula", color: "#0d47a1", fondo: "#e3f2fd" },
  ACTIVA: { texto: "Activa", color: "#1b5e20", fondo: "#e8f5e9" },
  CERRADA: { texto: "Inactiva", color: "#5a6172", fondo: "#eceff1" },
};

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const PAISES = ["CL", "CO", "EC", "PE"];
const TZ_POR_PAIS: Record<string, string> = {
  CL: "America/Santiago",
  CO: "America/Bogota",
  EC: "America/Guayaquil",
  PE: "America/Lima",
};

const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

const btnPrimario: CSSProperties = {
  padding: "0.65rem 1.5rem",
  borderRadius: "0.7rem",
  border: "none",
  background: "var(--lgs-verde)",
  color: "#1b2a10",
  fontWeight: 700,
  cursor: "pointer",
};

/** Un horario del catálogo (/panel/horarios): fuente de los salones a crear. */
interface CatHorario {
  id: string;
  tipoCurso: TipoCurso;
  grupoPais: string; // 01=Chile; 02=Colombia/Ecuador/Perú
  salonNumero: string; // 01..12
  etiqueta: string;
  activo: boolean;
  slots: SlotForm[];
}

const GRUPOS_SALON: { codigo: string; nombre: string; pais: string }[] = [
  { codigo: "01", nombre: "Chile", pais: "CL" },
  { codigo: "02", nombre: "Colombia · Ecuador · Perú", pais: "CO" },
];
const PAIS_DE_GRUPO: Record<string, string> = { "01": "CL", "02": "CO" };

/**
 * Salones a crear DESDE EL CATÁLOGO: un salón por horario del catálogo del
 * tipo y grupo elegidos (JUNIOR/YOUNGSTER Salón 01..06). El horario (bloques)
 * y el país salen del catálogo; guía y cupo se ajustan aquí.
 */
function salonesDesdeCatalogo(
  tipo: TipoCurso,
  grupo: string,
  catalogo: CatHorario[],
): SalonForm[] {
  return catalogo
    .filter((h) => h.tipoCurso === tipo && h.grupoPais === grupo && h.activo)
    .sort((a, b) => a.salonNumero.localeCompare(b.salonNumero))
    .map((h) => ({
      nombre: `${tipo} Salón ${h.salonNumero}`,
      tipo,
      guiaUserId: "",
      cupo: "15",
      pais: PAIS_DE_GRUPO[grupo] ?? "CL",
      meetingUrl: "",
      slots: h.slots.map((s) => ({ ...s })),
    }));
}

type SetLista = React.Dispatch<React.SetStateAction<SalonForm[]>>;

function patchSalon(setLista: SetLista, i: number, patch: Partial<SalonForm>) {
  setLista((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
}

/** Tarjeta editable de un salón (sin selector de curso: la página es de un solo tipo). */
function SalonCard(props: {
  salon: SalonForm;
  guias: Guia[];
  creando: boolean;
  prog: ProgresoSalon | undefined;
  onPatch: (patch: Partial<SalonForm>) => void;
  onRemove: () => void;
}) {
  const { salon, guias, creando, prog, onPatch, onRemove } = props;
  const borde =
    prog?.estado === "ok"
      ? "#66bb6a"
      : prog?.estado === "error"
        ? "#e57373"
        : prog?.estado === "creando"
          ? "var(--lgs-azul)"
          : "#e3e7f0";

  function setSlot(j: number, patch: Partial<SlotForm>) {
    onPatch({ slots: salon.slots.map((sl, k) => (k === j ? { ...sl, ...patch } : sl)) });
  }

  return (
    <div
      style={{
        border: `1.5px solid ${borde}`,
        borderRadius: "0.7rem",
        padding: "0.8rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.55rem",
      }}
    >
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.15rem", flex: "1 1 12rem" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>Nombre</span>
          <input
            value={salon.nombre}
            onChange={(e) => onPatch({ nombre: e.target.value })}
            required
            minLength={2}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.15rem", flex: "1 1 11rem" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>Guía</span>
          <select
            value={salon.guiaUserId}
            onChange={(e) => onPatch({ guiaUserId: e.target.value })}
            style={inputStyle}
          >
            <option value="">— Sin guía —</option>
            {guias.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre ?? g.username}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.15rem", width: "4.5rem" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>Cupo</span>
          <input
            type="number"
            min={1}
            max={50}
            value={salon.cupo}
            onChange={(e) => onPatch({ cupo: e.target.value })}
            required
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.15rem", width: "5rem" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>País</span>
          <select
            value={salon.pais}
            onChange={(e) => onPatch({ pais: e.target.value })}
            style={inputStyle}
          >
            {PAISES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onRemove}
          disabled={creando}
          title="Quitar salón"
          style={{ ...inputStyle, cursor: "pointer", color: "#c62828" }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--texto-suave)" }}>
          Horario:
        </span>
        {salon.slots.map((slot, j) => (
          <div key={j} style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
            <select
              value={slot.diaSemana}
              onChange={(e) => setSlot(j, { diaSemana: Number(e.target.value) })}
              style={{ ...inputStyle, padding: "0.35rem 0.45rem" }}
            >
              {DIAS.map((d, idx) => (
                <option key={d} value={idx}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={slot.horaLocal}
              onChange={(e) => setSlot(j, { horaLocal: e.target.value })}
              required
              style={{ ...inputStyle, padding: "0.35rem 0.45rem" }}
            />
            {salon.slots.length > 1 && (
              <button
                type="button"
                onClick={() => onPatch({ slots: salon.slots.filter((_, k) => k !== j) })}
                style={{ ...inputStyle, padding: "0.3rem 0.5rem", cursor: "pointer" }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {salon.slots.length < 4 && (
          <button
            type="button"
            onClick={() =>
              onPatch({
                slots: [
                  ...salon.slots,
                  { tipo: "SESION", diaSemana: 1, horaLocal: "18:00", duracionMin: 50 },
                ],
              })
            }
            style={{ ...inputStyle, padding: "0.3rem 0.6rem", cursor: "pointer" }}
          >
            + bloque
          </button>
        )}
        {prog?.mensaje !== undefined && (
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: prog.estado === "error" ? "#c62828" : "#1b5e20",
            }}
          >
            {prog.estado === "ok" ? "✓ " : prog.estado === "error" ? "✕ " : ""}
            {prog.mensaje}
          </span>
        )}
      </div>
    </div>
  );
}

export default function CampaniasPage() {
  const router = useRouter();
  const [campanias, setCampanias] = useState<Campania[] | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [puedeSalones, setPuedeSalones] = useState(false);
  const [guias, setGuias] = useState<Guia[]>([]);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);

  // Paso 1 — campaña
  const [nombre, setNombre] = useState("");
  const [inicio, setInicio] = useState(""); // inicio de campaña (comercial)
  const [cursoInicio, setCursoInicio] = useState(""); // inicio del curso (arranque de clases)
  const [fin, setFin] = useState(""); // vigencia; se autocompleta a inicio + 12 meses (editable)
  const [finTocado, setFinTocado] = useState(false); // si el usuario editó el fin a mano

  // Pasos 2 y 3 — salones por tipo, generados DESDE EL CATÁLOGO
  const [catalogo, setCatalogo] = useState<CatHorario[]>([]);
  const [grupoSalones, setGrupoSalones] = useState("01");
  const [salonesJr, setSalonesJr] = useState<SalonForm[]>([]);
  const [salonesYg, setSalonesYg] = useState<SalonForm[]>([]);

  // Estado de creación (la campaña nace una sola vez, en el paso 2).
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [courseByTipo, setCourseByTipo] = useState<Record<string, string>>({});
  const [juniorHecho, setJuniorHecho] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoSalon[] | null>(null);

  const cargar = useCallback(async () => {
    const res = await apiFetch("/api/catalog/campaigns");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (res.ok) {
      const data: { campanias: Campania[] } = await res.json();
      setCampanias(data.campanias);
    }
  }, [router]);

  useEffect(() => {
    async function inicial() {
      await cargar();
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const me: { permisos: { code: string }[] } = await res.json();
        const codes = new Set(me.permisos.map((p) => p.code));
        setPuedeGestionar(codes.has("catalogo.gestionar"));
        setPuedeSalones(codes.has("salones.gestionar"));
        if (codes.has("salones.gestionar")) {
          const [g, h] = await Promise.all([
            apiFetch("/api/identity/guides"),
            apiFetch("/api/scheduling/horarios?activos=1"),
          ]);
          if (g.ok) {
            const data: { guias: Guia[] } = await g.json();
            setGuias(data.guias);
          }
          if (h.ok) {
            const data: { horarios: CatHorario[] } = await h.json();
            setCatalogo(data.horarios);
            setSalonesJr(salonesDesdeCatalogo("JUNIOR", "01", data.horarios));
            setSalonesYg(salonesDesdeCatalogo("YOUNGSTER", "01", data.horarios));
          }
        }
      }
    }
    void inicial();
  }, [cargar]);

  /** Cambia el grupo país y reconstruye ambas listas desde el catálogo. */
  function cambiarGrupoSalones(grupo: string) {
    setGrupoSalones(grupo);
    setSalonesJr(salonesDesdeCatalogo("JUNIOR", grupo, catalogo));
    setSalonesYg(salonesDesdeCatalogo("YOUNGSTER", grupo, catalogo));
  }

  function resetForm() {
    setPaso(1);
    setNombre("");
    setInicio("");
    setCursoInicio("");
    setFin("");
    setFinTocado(false);
    setGrupoSalones("01");
    setSalonesJr(salonesDesdeCatalogo("JUNIOR", "01", catalogo));
    setSalonesYg(salonesDesdeCatalogo("YOUNGSTER", "01", catalogo));
    setCampaignId(null);
    setCourseByTipo({});
    setJuniorHecho(false);
    setError(null);
    setProgreso(null);
  }

  /** Crea la campaña (una sola vez) y devuelve su id + el mapa tipo→courseId. */
  async function asegurarCampania(): Promise<{ id: string; byTipo: Record<string, string> } | null> {
    if (campaignId !== null) return { id: campaignId, byTipo: courseByTipo };
    const resC = await apiFetch("/api/catalog/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, inicio, cursoInicio, fin: fin || undefined }),
    });
    const dataC: { campania?: { id: string }; error?: { message: string } } = await resC.json();
    if (!resC.ok || dataC.campania === undefined) {
      setError(dataC.error?.message ?? "No se pudo crear la campaña.");
      return null;
    }
    const id = dataC.campania.id;
    const resD = await apiFetch(`/api/catalog/campaigns/${id}`);
    const dataD: { campania: { courses: { id: string; tipo: string }[] } } = await resD.json();
    const byTipo = Object.fromEntries(dataD.campania.courses.map((c) => [c.tipo, c.id]));
    setCampaignId(id);
    setCourseByTipo(byTipo);
    return { id, byTipo };
  }

  /** Crea en secuencia los salones de un tipo; devuelve true si hubo algún error. */
  async function crearSalones(
    lista: SalonForm[],
    tipo: TipoCurso,
    byTipo: Record<string, string>,
  ): Promise<boolean> {
    let algunError = false;
    for (let i = 0; i < lista.length; i += 1) {
      const salon = lista[i]!;
      setProgreso((prev) => prev!.map((p, j) => (j === i ? { estado: "creando" } : p)));
      const courseId = byTipo[tipo];
      if (courseId === undefined) {
        algunError = true;
        setProgreso((prev) =>
          prev!.map((p, j) => (j === i ? { estado: "error", mensaje: `Sin curso ${tipo}` } : p)),
        );
        continue;
      }
      try {
        const res = await apiFetch("/api/scheduling/classrooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId,
            nombre: salon.nombre,
            guiaUserId: salon.guiaUserId || null,
            cupo: Number(salon.cupo),
            meetingUrl: salon.meetingUrl || null,
            timezone: TZ_POR_PAIS[salon.pais] ?? "America/Santiago",
            holidayCountry: salon.pais,
            slots: salon.slots,
          }),
        });
        const data: { sesionesGeneradas?: number; error?: { message: string } } = await res.json();
        if (!res.ok) {
          algunError = true;
          setProgreso((prev) =>
            prev!.map((p, j) =>
              j === i ? { estado: "error", mensaje: data.error?.message ?? "falló" } : p,
            ),
          );
        } else {
          setProgreso((prev) =>
            prev!.map((p, j) =>
              j === i ? { estado: "ok", mensaje: `${data.sesionesGeneradas ?? 0} sesiones` } : p,
            ),
          );
        }
      } catch {
        algunError = true;
        setProgreso((prev) =>
          prev!.map((p, j) => (j === i ? { estado: "error", mensaje: "error de conexión" } : p)),
        );
      }
    }
    return algunError;
  }

  function validarLista(lista: SalonForm[]): string | null {
    // Se permite 0 salones (la campaña se crea igual; los salones se pueden
    // agregar luego). Solo se validan los bloques de los que sí haya.
    for (const s of lista) {
      if (s.slots.length < 1) return `El salón "${s.nombre}" necesita al menos un bloque de horario.`;
    }
    return null;
  }

  function avanzarDesdePaso1(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!puedeSalones) {
      void crearSoloCampania();
      return;
    }
    setPaso(2);
  }

  async function crearSoloCampania() {
    setCreando(true);
    try {
      const creada = await asegurarCampania();
      if (creada === null) return;
      await cargar();
      setMostrarForm(false);
      resetForm();
      router.push(`/panel/campanias/${creada.id}`);
    } finally {
      setCreando(false);
    }
  }

  /** Paso 2 → crea la campaña + los salones Junior, luego avanza a Youngster. */
  async function submitJunior() {
    setError(null);
    const err = validarLista(salonesJr);
    if (err !== null) {
      setError(err);
      return;
    }
    setCreando(true);
    setProgreso(salonesJr.map(() => ({ estado: "pendiente" })));
    try {
      const creada = await asegurarCampania();
      if (creada === null) return;
      const algunError = await crearSalones(salonesJr, "JUNIOR", creada.byTipo);
      setJuniorHecho(true);
      if (!algunError) {
        setPaso(3);
        setProgreso(null);
      } else {
        setError(
          "Algunos salones Junior fallaron. Puedes continuar a Youngster y completarlos luego en Salones.",
        );
      }
    } finally {
      setCreando(false);
    }
  }

  /** Paso 3 → crea los salones Youngster y termina. */
  async function submitYoungster() {
    setError(null);
    const err = validarLista(salonesYg);
    if (err !== null) {
      setError(err);
      return;
    }
    setCreando(true);
    setProgreso(salonesYg.map(() => ({ estado: "pendiente" })));
    try {
      const algunError = await crearSalones(salonesYg, "YOUNGSTER", courseByTipo);
      await cargar();
      if (!algunError) {
        const id = campaignId;
        setMostrarForm(false);
        resetForm();
        router.push(`/panel/campanias/${id ?? ""}`);
      } else {
        setError("Algunos salones Youngster fallaron. Puedes completarlos en Salones.");
      }
    } finally {
      setCreando(false);
    }
  }

  function finalizar() {
    const id = campaignId;
    setMostrarForm(false);
    resetForm();
    router.push(`/panel/campanias/${id ?? ""}`);
  }

  const totalPasos = puedeSalones ? 3 : 1;

  return (
    <main style={{ padding: "2rem", maxWidth: "68rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.6rem" }}>Campañas</h1>
        {puedeGestionar && (
          <button
            onClick={() => {
              if (mostrarForm) resetForm();
              setMostrarForm((v) => !v);
            }}
            style={{
              padding: "0.55rem 1.2rem",
              borderRadius: "0.6rem",
              border: "none",
              background: "var(--lgs-azul)",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {mostrarForm ? "Cancelar" : "+ Nueva campaña"}
          </button>
        )}
      </div>

      {mostrarForm && paso === 1 && (
        <form
          onSubmit={avanzarDesdePaso1}
          style={{
            marginTop: "1rem",
            padding: "1.25rem",
            border: "1px solid #e3e7f0",
            borderRadius: "0.9rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <p style={{ width: "100%", margin: 0, fontWeight: 700, color: "var(--lgs-azul)" }}>
            Paso 1 de {totalPasos} · Datos de la campaña
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "2 1 12rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              minLength={3}
              maxLength={80}
              placeholder="Campaña Agosto 2026"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Inicio de campaña</span>
            <input
              type="date"
              value={inicio}
              onChange={(e) => {
                const v = e.target.value;
                setInicio(v);
                if (!finTocado) setFin(sumarMeses(v, 12)); // vigencia = inicio + 12 meses
              }}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Inicio del curso</span>
            <input
              type="date"
              value={cursoInicio}
              onChange={(e) => setCursoInicio(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Fin de campaña (12 meses · editable)</span>
            <input
              type="date"
              value={fin}
              onChange={(e) => {
                setFin(e.target.value);
                setFinTocado(true);
              }}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Cierre de matrícula</span>
            <input
              type="text"
              value={cursoInicio ? `${sumarDias(cursoInicio, 21)} (curso + 3 sem.)` : "—"}
              readOnly
              title="Inicio del curso + 3 semanas"
              style={{ ...inputStyle, background: "#f4f6fa", color: "var(--texto-suave)" }}
            />
          </label>
          <button type="submit" disabled={creando} style={btnPrimario}>
            {puedeSalones ? "Siguiente: salones Junior →" : creando ? "Creando…" : "Crear campaña"}
          </button>
          <p style={{ width: "100%", fontSize: "0.8rem", color: "var(--texto-suave)" }}>
            La campaña dura 12 meses (fin editable). Las sesiones del curso corren desde el inicio del
            curso hasta el fin de la campaña; el cierre de matrícula es 3 semanas después del inicio
            del curso (hasta ahí es visible en el wizard de contratos). Se generan los cursos Junior y
            Youngster con sus 4 niveles, 4 lecciones por nivel y su Level Up. Los salones se crean
            después: primero Junior, luego Youngster.
          </p>
          {error !== null && (
            <p role="alert" style={{ width: "100%", color: "#c62828", fontSize: "0.9rem" }}>
              {error}
            </p>
          )}
        </form>
      )}

      {mostrarForm && (paso === 2 || paso === 3) && (
        <div
          style={{
            marginTop: "1rem",
            padding: "1.25rem",
            border: "1px solid #e3e7f0",
            borderRadius: "0.9rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.9rem",
          }}
        >
          {(() => {
            const esJunior = paso === 2;
            const lista = esJunior ? salonesJr : salonesYg;
            const setLista = esJunior ? setSalonesJr : setSalonesYg;
            const tipoTexto = esJunior ? "JUNIOR" : "YOUNGSTER";
            const plantillaTipo: TipoCurso = esJunior ? "JUNIOR" : "YOUNGSTER";
            return (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 700, color: "var(--lgs-azul)" }}>
                    Paso {esJunior ? 2 : 3} de {totalPasos} · Salones {tipoTexto} de «{nombre}» (
                    {lista.length})
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}>
                      <span style={{ fontWeight: 600 }}>País:</span>
                      <select
                        value={grupoSalones}
                        onChange={(e) => cambiarGrupoSalones(e.target.value)}
                        disabled={creando || juniorHecho}
                        style={{ ...inputStyle, padding: "0.35rem 0.5rem" }}
                      >
                        {GRUPOS_SALON.map((g) => (
                          <option key={g.codigo} value={g.codigo}>
                            {g.codigo} · {g.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => setLista(salonesDesdeCatalogo(plantillaTipo, grupoSalones, catalogo))}
                      disabled={creando}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      Recargar del catálogo
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLista((prev) => [
                          ...prev,
                          {
                            nombre: `${plantillaTipo} Salón ${String(prev.length + 1).padStart(2, "0")}`,
                            tipo: plantillaTipo,
                            guiaUserId: "",
                            cupo: "15",
                            pais: PAIS_DE_GRUPO[grupoSalones] ?? "CL",
                            meetingUrl: "",
                            slots: [{ tipo: "SESION", diaSemana: 1, horaLocal: "18:00", duracionMin: 60 }],
                          },
                        ])
                      }
                      disabled={creando}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      + Agregar salón
                    </button>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  {lista.length === 0
                    ? `No hay horarios en el catálogo para ${tipoTexto} · grupo ${grupoSalones}. Créalos en Horarios (/panel/horarios) o agrega salones manualmente; también puedes crear la campaña sin salones y añadirlos luego.`
                    : esJunior
                      ? `Salones JUNIOR (6–9 años) tomados del catálogo del grupo ${grupoSalones}: asigna la guía de cada uno.`
                      : "Salones YOUNGSTER (10–13 años). La campaña y los salones Junior ya se crearon. Ajusta y crea los Youngster para finalizar."}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                  {lista.map((salon, i) => (
                    <SalonCard
                      key={i}
                      salon={salon}
                      guias={guias}
                      creando={creando}
                      prog={progreso?.[i]}
                      onPatch={(patch) => patchSalon(setLista, i, patch)}
                      onRemove={() => setLista((prev) => prev.filter((_, j) => j !== i))}
                    />
                  ))}
                </div>

                {error !== null && (
                  <p role="alert" style={{ color: "#c62828", fontSize: "0.9rem" }}>
                    {error}
                  </p>
                )}

                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                  {esJunior ? (
                    <>
                      {!juniorHecho && (
                        <button
                          type="button"
                          onClick={() => setPaso(1)}
                          disabled={creando}
                          style={{ ...inputStyle, cursor: "pointer" }}
                        >
                          ← Volver
                        </button>
                      )}
                      {juniorHecho ? (
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setProgreso(null);
                            setPaso(3);
                          }}
                          style={btnPrimario}
                        >
                          Continuar a Youngster →
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void submitJunior()}
                          disabled={creando}
                          style={{ ...btnPrimario, background: creando ? "#9e9e9e" : "var(--lgs-verde)" }}
                        >
                          {creando
                            ? "Creando campaña y salones Junior…"
                            : `Crear campaña + ${lista.length} salones Junior →`}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={finalizar}
                        disabled={creando}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        Finalizar sin Youngster
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitYoungster()}
                        disabled={creando}
                        style={{ ...btnPrimario, background: creando ? "#9e9e9e" : "var(--lgs-verde)" }}
                      >
                        {creando
                          ? "Creando salones Youngster…"
                          : `Crear ${lista.length} salones Youngster y finalizar`}
                      </button>
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      <section
        style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}
      >
        {campanias === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando campañas…</p>
        ) : campanias.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>
            Aún no hay campañas. {puedeGestionar ? "Crea la primera con “+ Nueva campaña”." : ""}
          </p>
        ) : (
          campanias.map((c) => {
            const estado = ESTILO_ESTADO[c.estado];
            return (
              <Link
                key={c.id}
                href={`/panel/campanias/${c.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.9rem 1.1rem",
                  border: "1px solid #e3e7f0",
                  borderRadius: "0.8rem",
                  color: "inherit",
                }}
              >
                <div>
                  <strong style={{ fontSize: "1.05rem" }}>{c.nombre}</strong>
                  <div style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
                    {c.inicio} → {c.fin} · {c.cursos} cursos
                  </div>
                </div>
                <span
                  style={{
                    padding: "0.25rem 0.7rem",
                    borderRadius: "1rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: estado.color,
                    background: estado.fondo,
                  }}
                >
                  {estado.texto}
                </span>
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
