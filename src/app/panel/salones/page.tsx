"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";

interface Salon {
  id: string;
  nombre: string;
  curso: string;
  campania: string;
  cupo: number;
  timezone: string;
  holidayCountry: string;
  sesiones: number;
  primeraSesion: string | null;
  ultimaSesion: string | null;
}

interface CampaniaLista {
  id: string;
  nombre: string;
  estado: string;
}

interface CursoDetalle {
  id: string;
  tipo: string;
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ZONAS = ["America/Santiago", "America/Bogota", "America/Guayaquil", "America/Lima"];
const PAISES = ["CL", "CO", "EC", "PE"];

const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

interface SlotForm {
  tipo: "SESION" | "CLUB";
  diaSemana: number;
  horaLocal: string;
}

export default function SalonesPage() {
  const [salones, setSalones] = useState<Salon[] | null>(null);
  const [campanias, setCampanias] = useState<CampaniaLista[]>([]);
  const [cursos, setCursos] = useState<CursoDetalle[]>([]);
  const [campaniaId, setCampaniaId] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [nombre, setNombre] = useState("");
  const [cupo, setCupo] = useState("12");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [timezone, setTimezone] = useState("America/Santiago");
  const [pais, setPais] = useState("CL");
  const [slots, setSlots] = useState<SlotForm[]>([
    { tipo: "SESION", diaSemana: 2, horaLocal: "18:00" },
    { tipo: "SESION", diaSemana: 4, horaLocal: "18:00" },
    { tipo: "CLUB", diaSemana: 6, horaLocal: "10:00" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargarSalones = useCallback(async () => {
    const res = await fetch("/api/scheduling/classrooms");
    if (res.ok) {
      const data: { salones: Salon[] } = await res.json();
      setSalones(data.salones);
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargarSalones();
      const res = await fetch("/api/catalog/campaigns");
      if (res.ok) {
        const data: { campanias: CampaniaLista[] } = await res.json();
        setCampanias(data.campanias);
      }
    }
    void inicial();
  }, [cargarSalones]);

  async function elegirCampania(id: string) {
    setCampaniaId(id);
    setCourseId("");
    if (id === "") {
      setCursos([]);
      return;
    }
    const res = await fetch(`/api/catalog/campaigns/${id}`);
    if (res.ok) {
      const data: { campania: { courses: CursoDetalle[] } } = await res.json();
      setCursos(data.campania.courses);
    }
  }

  async function crear(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const res = await fetch("/api/scheduling/classrooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          nombre,
          cupo: Number(cupo),
          meetingUrl: meetingUrl || null,
          timezone,
          holidayCountry: pais,
          slots,
        }),
      });
      const data: { sesionesGeneradas?: number; error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo crear el salón.");
        return;
      }
      setMostrarForm(false);
      setNombre("");
      await cargarSalones();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  function setSlot(index: number, patch: Partial<SlotForm>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.6rem" }}>Salones</h1>
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
          {mostrarForm ? "Cancelar" : "+ Nuevo salón"}
        </button>
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
            gap: "0.9rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 12rem" }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Campaña</span>
              <select
                required
                value={campaniaId}
                onChange={(e) => void elegirCampania(e.target.value)}
                style={inputStyle}
              >
                <option value="">— Elegir —</option>
                {campanias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 10rem" }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Curso</span>
              <select
                required
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                style={inputStyle}
              >
                <option value="">— Elegir —</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tipo}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 10rem" }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Nombre del salón</span>
              <input
                required
                minLength={2}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Rookie A"
                style={inputStyle}
              />
            </label>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", width: "5rem" }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Cupo</span>
              <input
                type="number"
                min={1}
                max={50}
                required
                value={cupo}
                onChange={(e) => setCupo(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "2 1 16rem" }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                Enlace de reunión (clases virtuales)
              </span>
              <input
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet…"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Zona operativa</span>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={inputStyle}
              >
                {ZONAS.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Calendario feriados</span>
              <select value={pais} onChange={(e) => setPais(e.target.value)} style={inputStyle}>
                {PAISES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>

          <fieldset
            style={{ border: "1px dashed #cfd6e4", borderRadius: "0.7rem", padding: "0.9rem" }}
          >
            <legend style={{ fontWeight: 700, fontSize: "0.9rem", padding: "0 0.4rem" }}>
              Horario semanal (hora local del salón)
            </legend>
            {slots.map((slot, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  marginBottom: "0.4rem",
                  flexWrap: "wrap",
                }}
              >
                <select
                  value={slot.tipo}
                  onChange={(e) => setSlot(i, { tipo: e.target.value as SlotForm["tipo"] })}
                  style={inputStyle}
                >
                  <option value="SESION">Sesión</option>
                  <option value="CLUB">Club</option>
                </select>
                <select
                  value={slot.diaSemana}
                  onChange={(e) => setSlot(i, { diaSemana: Number(e.target.value) })}
                  style={inputStyle}
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
                  onChange={(e) => setSlot(i, { horaLocal: e.target.value })}
                  required
                  style={inputStyle}
                />
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSlots((prev) => prev.filter((_, idx) => idx !== i))}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {slots.length < 4 && (
              <button
                type="button"
                onClick={() =>
                  setSlots((prev) => [
                    ...prev,
                    { tipo: "SESION", diaSemana: 1, horaLocal: "18:00" },
                  ])
                }
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                + Agregar bloque
              </button>
            )}
          </fieldset>

          {error !== null && (
            <p role="alert" style={{ color: "#c62828", fontSize: "0.9rem" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={ocupado}
            style={{
              alignSelf: "flex-start",
              padding: "0.65rem 1.5rem",
              borderRadius: "0.7rem",
              border: "none",
              background: ocupado ? "#9e9e9e" : "var(--lgs-verde)",
              color: "#1b2a10",
              fontWeight: 700,
              cursor: ocupado ? "wait" : "pointer",
            }}
          >
            {ocupado ? "Generando sesiones…" : "Crear salón y generar sesiones"}
          </button>
          <p style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
            Se generarán TODAS las sesiones del curso: los feriados del calendario elegido no se
            dictan y la sesión se corre al final, conservando el total.
          </p>
        </form>
      )}

      <section
        style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        {salones === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : salones.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>
            Sin salones. Necesitas una campaña creada (sección Campañas) para colgar el salón de su
            curso.
          </p>
        ) : (
          salones.map((s) => (
            <Link
              key={s.id}
              href={`/panel/salones/${s.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1rem",
                border: "1px solid #e3e7f0",
                borderRadius: "0.7rem",
                color: "inherit",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                <strong>{s.nombre}</strong>{" "}
                <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  {s.campania} · {s.curso} · cupo {s.cupo}
                </span>
                <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  {s.timezone} · feriados {s.holidayCountry}
                  {s.primeraSesion !== null && ` · ${s.primeraSesion} → ${s.ultimaSesion}`}
                </div>
              </div>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  padding: "0.22rem 0.6rem",
                  borderRadius: "1rem",
                  background: "#e3f2fd",
                  color: "#0d47a1",
                }}
              >
                {s.sesiones} sesiones
              </span>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
