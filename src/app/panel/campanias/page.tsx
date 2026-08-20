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
  estado: "EN_MATRICULA" | "ACTIVA" | "CERRADA";
  cursos: number;
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
  CERRADA: { texto: "Cerrada", color: "#5a6172", fondo: "#eceff1" },
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

/** Patrón de días → índices (Lun=1, Mar=2, Mié=3, Jue=4). */
function slotsDesde(patron: "LUN-MIE" | "MAR-JUE", hora: string): SlotForm[] {
  const dias = patron === "LUN-MIE" ? [1, 3] : [2, 4];
  return dias.map((d) => ({ tipo: "SESION", diaSemana: d, horaLocal: hora, duracionMin: 50 }));
}

/** Los 12 salones estándar con su horario fijo (01–06 Chile, 07–12 Colombia). */
const PLANTILLA: { nombre: string; pais: string; patron: "LUN-MIE" | "MAR-JUE"; hora: string }[] = [
  { nombre: "Salón 01", pais: "CL", patron: "LUN-MIE", hora: "16:00" },
  { nombre: "Salón 02", pais: "CL", patron: "LUN-MIE", hora: "17:00" },
  { nombre: "Salón 03", pais: "CL", patron: "LUN-MIE", hora: "18:00" },
  { nombre: "Salón 04", pais: "CL", patron: "MAR-JUE", hora: "16:00" },
  { nombre: "Salón 05", pais: "CL", patron: "MAR-JUE", hora: "17:00" },
  { nombre: "Salón 06", pais: "CL", patron: "MAR-JUE", hora: "18:00" },
  { nombre: "Salón 07", pais: "CO", patron: "LUN-MIE", hora: "17:00" },
  { nombre: "Salón 08", pais: "CO", patron: "LUN-MIE", hora: "18:00" },
  { nombre: "Salón 09", pais: "CO", patron: "LUN-MIE", hora: "19:00" },
  { nombre: "Salón 10", pais: "CO", patron: "MAR-JUE", hora: "17:00" },
  { nombre: "Salón 11", pais: "CO", patron: "MAR-JUE", hora: "18:00" },
  { nombre: "Salón 12", pais: "CO", patron: "MAR-JUE", hora: "19:00" },
];

function plantillaInicial(tipo: TipoCurso): SalonForm[] {
  return PLANTILLA.map((p) => ({
    nombre: p.nombre,
    tipo,
    guiaUserId: "",
    cupo: "15",
    pais: p.pais,
    meetingUrl: "",
    slots: slotsDesde(p.patron, p.hora),
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
  const [inicio, setInicio] = useState("");
  const [semanas, setSemanas] = useState("52"); // ~1 año (duración típica de una campaña)

  // Pasos 2 y 3 — salones por tipo
  const [salonesJr, setSalonesJr] = useState<SalonForm[]>(() => plantillaInicial("JUNIOR"));
  const [salonesYg, setSalonesYg] = useState<SalonForm[]>(() => plantillaInicial("YOUNGSTER"));

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
          const g = await apiFetch("/api/identity/guides");
          if (g.ok) {
            const data: { guias: Guia[] } = await g.json();
            setGuias(data.guias);
          }
        }
      }
    }
    void inicial();
  }, [cargar]);

  function resetForm() {
    setPaso(1);
    setNombre("");
    setInicio("");
    setSemanas("52");
    setSalonesJr(plantillaInicial("JUNIOR"));
    setSalonesYg(plantillaInicial("YOUNGSTER"));
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
      body: JSON.stringify({ nombre, inicio, duracionSemanas: Number(semanas) }),
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
    if (lista.length < 1) return "Agrega al menos un salón.";
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
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Inicio</span>
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Duración (semanas · 52 ≈ 1 año)</span>
            <input
              type="number"
              min={1}
              max={52}
              value={semanas}
              onChange={(e) => setSemanas(e.target.value)}
              required
              style={{ ...inputStyle, width: "8rem" }}
            />
          </label>
          <button type="submit" disabled={creando} style={btnPrimario}>
            {puedeSalones ? "Siguiente: salones Junior →" : creando ? "Creando…" : "Crear campaña"}
          </button>
          <p style={{ width: "100%", fontSize: "0.8rem", color: "var(--texto-suave)" }}>
            Se generarán automáticamente los cursos Junior y Youngster, cada uno con sus 4 niveles
            (Rookie → Champion → Elite → Legendary), 4 lecciones por nivel con cuestionario de
            práctica y su Level Up. Los salones se crean después: primero Junior, luego Youngster.
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
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => setLista(plantillaInicial(plantillaTipo))}
                      disabled={creando}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      Restaurar plantilla
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLista((prev) => [
                          ...prev,
                          {
                            nombre: `Salón ${String(prev.length + 1).padStart(2, "0")}`,
                            tipo: plantillaTipo,
                            guiaUserId: "",
                            cupo: "15",
                            pais: "CL",
                            meetingUrl: "",
                            slots: slotsDesde("LUN-MIE", "18:00"),
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
                  {esJunior
                    ? "Salones JUNIOR (curso 6–9 años). Horarios fijos precargados; asigna la guía de cada uno. 01–06 base Chile · 07–12 base Colombia."
                    : "Salones YOUNGSTER (curso 10–13 años). La campaña y los salones Junior ya se crearon. Ajusta y crea los Youngster para finalizar."}
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
