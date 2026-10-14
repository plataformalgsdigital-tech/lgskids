"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * La barra de filtros que comparten las consultas de Servicio: usuario,
 * campaña, curso, salón y rango de fechas. Lo propio de cada pantalla (el
 * estado) entra como `children`, en la misma grilla.
 */

export interface FiltrosBase {
  buscar: string;
  campaignId: string;
  curso: string;
  classroomId: string;
  desde: string;
  hasta: string;
}

interface Salon {
  id: string;
  nombre: string;
  curso: string;
  campania: string;
}

interface Campania {
  id: string;
  nombre: string;
}

export const campoServicio: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  width: "100%",
};
export const rotuloServicio: CSSProperties = { fontSize: "0.75rem", fontWeight: 700 };
export const celdaServicio: CSSProperties = {
  padding: "0.5rem 0.6rem",
  borderBottom: "1px solid #eef1f7",
  verticalAlign: "top",
};
export const botonServicio: CSSProperties = {
  padding: "0.55rem 1rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  fontWeight: 700,
  cursor: "pointer",
};

/** Fecha local de hoy + `delta` días, YYYY-MM-DD (el reloj de quien mira). */
export function diaLocal(delta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function FiltrosServicio({
  filtros,
  onCambio,
  conUsuario = true,
  children,
}: {
  filtros: FiltrosBase;
  onCambio: (cambio: Partial<FiltrosBase>) => void;
  /** Las sesiones no son de un niño: ahí no va el buscador de usuario. */
  conUsuario?: boolean;
  children?: ReactNode;
}) {
  const [campanias, setCampanias] = useState<Campania[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);

  useEffect(() => {
    async function catalogos() {
      const [rc, rs] = await Promise.all([
        apiFetch("/api/catalog/campaigns"),
        apiFetch("/api/scheduling/classrooms"),
      ]);
      if (rc.ok) setCampanias(((await rc.json()) as { campanias: Campania[] }).campanias);
      if (rs.ok) setSalones(((await rs.json()) as { salones: Salon[] }).salones);
    }
    void catalogos();
  }, []);

  // Cascada: los salones se acotan por la campaña y el curso elegidos.
  const nombreCampania = campanias.find((c) => c.id === filtros.campaignId)?.nombre;
  const salonesFiltrados = salones.filter(
    (s) =>
      (nombreCampania === undefined || s.campania === nombreCampania) &&
      (filtros.curso === "" || s.curso === filtros.curso),
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
        gap: "0.7rem",
        margin: "1.1rem 0",
      }}
    >
      {conUsuario && (
        <label style={{ gridColumn: "span 2" }}>
          <span style={rotuloServicio}>Usuario</span>
          <input
            value={filtros.buscar}
            onChange={(e) => onCambio({ buscar: e.target.value })}
            placeholder="ID (documento), nombre o usuario"
            style={campoServicio}
          />
        </label>
      )}
      <label>
        <span style={rotuloServicio}>Campaña</span>
        <select
          value={filtros.campaignId}
          onChange={(e) => onCambio({ campaignId: e.target.value, classroomId: "" })}
          style={campoServicio}
        >
          <option value="">Todas</option>
          {campanias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span style={rotuloServicio}>Curso</span>
        <select
          value={filtros.curso}
          onChange={(e) => onCambio({ curso: e.target.value, classroomId: "" })}
          style={campoServicio}
        >
          <option value="">Todos</option>
          <option value="JUNIOR">JUNIOR</option>
          <option value="YOUNGSTER">YOUNGSTER</option>
        </select>
      </label>
      <label>
        <span style={rotuloServicio}>Salón</span>
        <select
          value={filtros.classroomId}
          onChange={(e) => onCambio({ classroomId: e.target.value })}
          style={campoServicio}
        >
          <option value="">Todos</option>
          {salonesFiltrados.map((s) => (
            <option key={s.id} value={s.id}>
              {nombreCampania === undefined ? `${s.campania} · ` : ""}
              {s.nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span style={rotuloServicio}>Fecha inicial</span>
        <input
          type="date"
          value={filtros.desde}
          max={filtros.hasta}
          onChange={(e) => onCambio({ desde: e.target.value })}
          style={campoServicio}
        />
      </label>
      <label>
        <span style={rotuloServicio}>Fecha final</span>
        <input
          type="date"
          value={filtros.hasta}
          min={filtros.desde}
          onChange={(e) => onCambio({ hasta: e.target.value })}
          style={campoServicio}
        />
      </label>
      {children}
    </div>
  );
}

/** Los filtros como query string (solo los que tienen valor). */
export function qsFiltros(f: FiltrosBase, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams({ desde: f.desde, hasta: f.hasta });
  if (f.buscar.trim() !== "") qs.set("buscar", f.buscar.trim());
  if (f.campaignId !== "") qs.set("campaignId", f.campaignId);
  if (f.curso !== "") qs.set("curso", f.curso);
  if (f.classroomId !== "") qs.set("classroomId", f.classroomId);
  for (const [k, v] of Object.entries(extra)) if (v !== "") qs.set(k, v);
  return qs.toString();
}
