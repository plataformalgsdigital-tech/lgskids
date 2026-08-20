"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { apiFetch } from "@/ui/api-fetch";

type TipoCurso = "JUNIOR" | "YOUNGSTER";

interface HorarioSlot {
  tipo: "SESION" | "CLUB";
  diaSemana: number;
  horaLocal: string;
  duracionMin: number;
}
interface Horario {
  id: string;
  tipoCurso: TipoCurso;
  etiqueta: string;
  activo: boolean;
  orden: number;
  slots: HorarioSlot[];
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const NOMBRE_TIPO: Record<TipoCurso, string> = {
  JUNIOR: "Junior (6–9 años)",
  YOUNGSTER: "Youngster (10–13 años)",
};

const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

/** Resume slots agrupando por hora: "LUN-MIÉ 16:00 · SÁB 10:00 (Club)". */
function resumen(slots: HorarioSlot[]): string {
  const porClave = new Map<string, number[]>();
  for (const s of slots) {
    const clave = `${s.horaLocal}|${s.tipo}`;
    const dias = porClave.get(clave) ?? [];
    dias.push(s.diaSemana);
    porClave.set(clave, dias);
  }
  return [...porClave.entries()]
    .map(([clave, dias]) => {
      const [hora, tipo] = clave.split("|");
      const etiqueta = dias
        .sort((a, b) => a - b)
        .map((d) => DIAS[d]?.toUpperCase())
        .join("-");
      return `${etiqueta} ${hora}${tipo === "CLUB" ? " (Club)" : ""}`;
    })
    .join(" · ");
}

const nuevoSlot = (): HorarioSlot => ({
  tipo: "SESION",
  diaSemana: 1,
  horaLocal: "16:00",
  duracionMin: 50,
});

export default function HorariosPage() {
  const router = useRouter();
  const [horarios, setHorarios] = useState<Horario[] | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [tipoCurso, setTipoCurso] = useState<TipoCurso>("JUNIOR");
  const [etiqueta, setEtiqueta] = useState("");
  const [slots, setSlots] = useState<HorarioSlot[]>([nuevoSlot()]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await apiFetch("/api/scheduling/horarios");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (res.ok) {
      const data: { horarios: Horario[] } = await res.json();
      setHorarios(data.horarios);
    }
  }, [router]);

  useEffect(() => {
    async function inicial() {
      await cargar();
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const me: { permisos: { code: string }[] } = await res.json();
        setPuedeGestionar(me.permisos.some((p) => p.code === "salones.gestionar"));
      }
    }
    void inicial();
  }, [cargar]);

  function patchSlot(i: number, patch: Partial<HorarioSlot>) {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  async function crear(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch("/api/scheduling/horarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoCurso, etiqueta, slots }),
      });
      const data: { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo crear el horario.");
        return;
      }
      setMostrarForm(false);
      setEtiqueta("");
      setSlots([nuevoSlot()]);
      await cargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function toggle(h: Horario) {
    const res = await apiFetch(`/api/scheduling/horarios/${h.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !h.activo }),
    });
    if (res.ok) await cargar();
  }

  const porTipo = (t: TipoCurso) => (horarios ?? []).filter((h) => h.tipoCurso === t);

  return (
    <main style={{ padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Horarios</h1>
          <p style={{ color: "var(--texto-suave)", margin: "0.25rem 0 0", fontSize: "0.9rem" }}>
            Catálogo reutilizable por tipo de curso. Se elige al crear un salón o reservar.
          </p>
        </div>
        {puedeGestionar && (
          <button
            onClick={() => setMostrarForm((v) => !v)}
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
            {mostrarForm ? "Cancelar" : "+ Nuevo horario"}
          </button>
        )}
      </div>

      {mostrarForm && (
        <form
          onSubmit={crear}
          style={{
            marginTop: "1rem",
            padding: "1.25rem",
            border: "1px solid #e3e7f0",
            borderRadius: "0.9rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.8rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Tipo de curso</span>
              <select
                value={tipoCurso}
                onChange={(e) => setTipoCurso(e.target.value as TipoCurso)}
                style={inputStyle}
              >
                <option value="JUNIOR">Junior (6–9)</option>
                <option value="YOUNGSTER">Youngster (10–13)</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 14rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Etiqueta</span>
              <input
                value={etiqueta}
                onChange={(e) => setEtiqueta(e.target.value)}
                required
                minLength={2}
                maxLength={60}
                placeholder="Lun-Mié 16:00"
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Bloques (1–4)</span>
            {slots.map((slot, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={slot.diaSemana}
                  onChange={(e) => patchSlot(i, { diaSemana: Number(e.target.value) })}
                  style={{ ...inputStyle, padding: "0.4rem" }}
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
                  onChange={(e) => patchSlot(i, { horaLocal: e.target.value })}
                  required
                  style={{ ...inputStyle, padding: "0.4rem" }}
                />
                <select
                  value={slot.tipo}
                  onChange={(e) => patchSlot(i, { tipo: e.target.value as "SESION" | "CLUB" })}
                  style={{ ...inputStyle, padding: "0.4rem" }}
                >
                  <option value="SESION">Sesión</option>
                  <option value="CLUB">Club</option>
                </select>
                <input
                  type="number"
                  min={30}
                  max={180}
                  value={slot.duracionMin}
                  onChange={(e) => patchSlot(i, { duracionMin: Number(e.target.value) })}
                  title="Duración (min)"
                  style={{ ...inputStyle, padding: "0.4rem", width: "5rem" }}
                />
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}
                    style={{ ...inputStyle, padding: "0.4rem 0.6rem", cursor: "pointer", color: "#c62828" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {slots.length < 4 && (
              <button
                type="button"
                onClick={() => setSlots((prev) => [...prev, nuevoSlot()])}
                style={{ ...inputStyle, cursor: "pointer", alignSelf: "flex-start" }}
              >
                + bloque
              </button>
            )}
          </div>

          {error !== null && (
            <p role="alert" style={{ color: "#c62828", fontSize: "0.9rem", margin: 0 }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={ocupado}
            style={{
              alignSelf: "flex-start",
              padding: "0.6rem 1.4rem",
              borderRadius: "0.6rem",
              border: "none",
              background: ocupado ? "#9e9e9e" : "var(--lgs-verde)",
              color: "#1b2a10",
              fontWeight: 700,
              cursor: ocupado ? "wait" : "pointer",
            }}
          >
            {ocupado ? "Creando…" : "Crear horario"}
          </button>
        </form>
      )}

      {horarios === null ? (
        <p style={{ marginTop: "1.5rem", color: "var(--texto-suave)" }}>Cargando horarios…</p>
      ) : (
        (["JUNIOR", "YOUNGSTER"] as TipoCurso[]).map((t) => (
          <section key={t} style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.15rem", color: "var(--lgs-azul-oscuro)" }}>{NOMBRE_TIPO[t]}</h2>
            {porTipo(t).length === 0 ? (
              <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
                Sin horarios para este curso.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {porTipo(t).map((h) => (
                  <div
                    key={h.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.75rem 1rem",
                      border: "1px solid #e3e7f0",
                      borderRadius: "0.7rem",
                      opacity: h.activo ? 1 : 0.55,
                    }}
                  >
                    <div>
                      <strong>{h.etiqueta}</strong>
                      <div style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
                        {resumen(h.slots)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "0.2rem 0.6rem",
                          borderRadius: "1rem",
                          background: h.activo ? "#e8f5e9" : "#eceff1",
                          color: h.activo ? "#1b5e20" : "#546e7a",
                        }}
                      >
                        {h.activo ? "Activo" : "Inactivo"}
                      </span>
                      {puedeGestionar && (
                        <button
                          onClick={() => void toggle(h)}
                          style={{ ...inputStyle, cursor: "pointer", padding: "0.35rem 0.7rem" }}
                        >
                          {h.activo ? "Desactivar" : "Reactivar"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </main>
  );
}
