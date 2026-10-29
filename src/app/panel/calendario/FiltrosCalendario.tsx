"use client";

import type { CSSProperties } from "react";
import { SIN_FILTROS, hayFiltros, type FiltrosAgenda, type OpcionSalon } from "./agenda-comun";

/**
 * Filtros del calendario y de la Agenda: Campaña, Curso, Salón, Advisor y
 * Hora, cada uno con "Todos". La campaña va al servidor (acota lo que se
 * trae); los demás filtran en la pantalla lo ya cargado.
 */

const campo: CSSProperties = {
  padding: "0.4rem 0.55rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.85rem",
  background: "white",
};

function Filtro(props: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  opciones: { valor: string; texto: string }[];
  todos: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--texto-suave)" }}>
        {props.etiqueta}
      </span>
      <select value={props.valor} onChange={(e) => props.onCambio(e.target.value)} style={campo}>
        <option value="">{props.todos}</option>
        {props.opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FiltrosCalendario(props: {
  campanias: { id: string; nombre: string }[];
  campaniaId: string;
  onCampania: (id: string) => void;
  filtros: FiltrosAgenda;
  onFiltros: (f: FiltrosAgenda) => void;
  opciones: { salones: OpcionSalon[]; guias: string[]; horas: string[] };
}) {
  const f = props.filtros;
  const poner = (patch: Partial<FiltrosAgenda>) => props.onFiltros({ ...f, ...patch });
  return (
    <div
      style={{
        display: "flex",
        gap: "0.6rem",
        flexWrap: "wrap",
        alignItems: "flex-end",
        padding: "0.6rem 0.75rem",
        border: "1px solid #e3e7f0",
        borderRadius: "0.75rem",
        marginBottom: "0.75rem",
      }}
    >
      <Filtro
        etiqueta="Campaña"
        valor={props.campaniaId}
        onCambio={props.onCampania}
        todos="Todas"
        opciones={props.campanias.map((c) => ({ valor: c.id, texto: c.nombre }))}
      />
      <Filtro
        etiqueta="Curso"
        valor={f.curso}
        onCambio={(v) => poner({ curso: v, salon: "" })}
        todos="Todos"
        opciones={[
          { valor: "JUNIOR", texto: "Junior (6–9)" },
          { valor: "YOUNGSTER", texto: "Youngster (10–13)" },
        ]}
      />
      <Filtro
        etiqueta="Salón"
        valor={f.salon}
        onCambio={(v) => poner({ salon: v })}
        todos="Todos"
        opciones={props.opciones.salones
          .filter((s) => f.curso === "" || s.curso === f.curso)
          .map((s) => ({ valor: s.id, texto: s.etiqueta }))}
      />
      <Filtro
        etiqueta="Advisor"
        valor={f.guia}
        onCambio={(v) => poner({ guia: v })}
        todos="Todos"
        opciones={props.opciones.guias.map((g) => ({ valor: g, texto: g }))}
      />
      <Filtro
        etiqueta="Hora (tu reloj)"
        valor={f.hora}
        onCambio={(v) => poner({ hora: v })}
        todos="Todas"
        opciones={props.opciones.horas.map((h) => ({ valor: h, texto: h }))}
      />
      {(hayFiltros(f) || props.campaniaId !== "") && (
        <button
          type="button"
          onClick={() => {
            props.onFiltros(SIN_FILTROS);
            props.onCampania("");
          }}
          style={{ ...campo, cursor: "pointer", fontWeight: 700 }}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
