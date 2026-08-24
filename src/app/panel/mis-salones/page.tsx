"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Slot {
  tipo: string;
  diaSemana: number;
  horaLocal: string;
  duracionMin: number;
}
interface Salon {
  id: string;
  nombre: string;
  curso: string;
  campania: string;
  cupo: number;
  ocupados: number;
  sesiones: number;
  horario: Slot[];
  meetingUrl: string | null;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function resumenHorario(horario: Slot[]): string {
  if (horario.length === 0) return "—";
  const porHora = new Map<string, number[]>();
  for (const s of horario) {
    const dias = porHora.get(s.horaLocal) ?? [];
    dias.push(s.diaSemana);
    porHora.set(s.horaLocal, dias);
  }
  return [...porHora.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hora, dias]) => {
      const etq = dias
        .sort((a, b) => a - b)
        .map((d) => (DIAS[d] ?? "?").toUpperCase())
        .join("-");
      return `${etq} ${hora}`;
    })
    .join(" · ");
}

export default function MisSalonesPage() {
  const [salones, setSalones] = useState<Salon[] | null>(null);

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch("/api/guia/salones");
      if (res.ok) {
        const data: { salones: Salon[] } = await res.json();
        setSalones(data.salones);
      } else {
        setSalones([]);
      }
    }
    void cargar();
  }, []);

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem" }}>Mis salones</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", marginTop: "0.3rem" }}>
        Los salones donde eres guía.
      </p>

      <section
        style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}
      >
        {salones === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : salones.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>Aún no tienes salones asignados.</p>
        ) : (
          salones.map((s) => (
            <Link
              key={s.id}
              href={`/panel/salones/${s.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.9rem 1.1rem",
                border: "1px solid #e3e7f0",
                borderRadius: "0.8rem",
                color: "inherit",
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong style={{ fontSize: "1.05rem" }}>{s.nombre}</strong>{" "}
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: s.curso === "JUNIOR" ? "#0d47a1" : "#6a1b9a",
                    background: s.curso === "JUNIOR" ? "#e3f2fd" : "#f3e5f5",
                    padding: "0.1rem 0.45rem",
                    borderRadius: "0.5rem",
                  }}
                >
                  {s.curso === "JUNIOR" ? "Junior" : "Youngster"}
                </span>
                <div style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
                  {s.campania} · {resumenHorario(s.horario)} · {s.sesiones} sesiones
                </div>
              </div>
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: s.ocupados >= s.cupo ? "#c62828" : "#1b5e20",
                }}
              >
                {s.ocupados}/{s.cupo} cupos
              </span>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
