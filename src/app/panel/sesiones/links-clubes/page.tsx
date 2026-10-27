"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { ConOpcion } from "@/ui/ConOpcion";

/**
 * Links de Clubes: salas propias de los Clubs (distintas de la del advisor),
 * con el DÍA de la semana y el horario en que se usan. Al crear un Club se marca
 * "Link diferente al del Advisor" y se elige uno del día de la fecha del Club.
 *
 * Corregir un enlace aquí lo corrige en todas las sesiones que lo usan (guardan
 * la referencia, no una copia). Uno en uso no se borra: se desactiva.
 */

interface LinkClub {
  id: string;
  nombre: string;
  diaSemana: number;
  horario: string;
  link: string;
  activo: boolean;
  sesionesFuturas: number;
  sesiones: number;
}

interface Borrador {
  id: string | null;
  nombre: string;
  diaSemana: number;
  horario: string;
  link: string;
  activo: boolean;
}

const VACIO: Borrador = {
  id: null,
  nombre: "",
  diaSemana: 5,
  horario: "",
  link: "",
  activo: true,
};

const campo: CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  fontFamily: "inherit",
};
const boton: CSSProperties = {
  padding: "0.45rem 0.9rem",
  borderRadius: "0.55rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.85rem",
};
const celda: CSSProperties = {
  padding: "0.55rem 0.6rem",
  borderBottom: "1px solid #eef1f7",
  fontSize: "0.88rem",
  verticalAlign: "top",
};

async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
  return c.error?.message ?? porDefecto;
}

function LinksClubes() {
  const [links, setLinks] = useState<LinkClub[]>([]);
  const [dias, setDias] = useState<string[]>([]);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtroDia, setFiltroDia] = useState<string>("");

  const cargar = useCallback(async () => {
    const res = await apiFetch("/api/scheduling/links-club");
    if (!res.ok) {
      setError(await mensajeDeError(res, "No se pudieron cargar los links."));
      return;
    }
    const d = (await res.json()) as { links: LinkClub[]; dias: string[] };
    setLinks(d.links);
    setDias(d.dias);
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  async function guardar() {
    if (borrador === null) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const cuerpo = {
        nombre: borrador.nombre,
        diaSemana: borrador.diaSemana,
        horario: borrador.horario,
        link: borrador.link,
        ...(borrador.id !== null && { activo: borrador.activo }),
      };
      const res = await apiFetch(
        borrador.id === null
          ? "/api/scheduling/links-club"
          : `/api/scheduling/links-club/${borrador.id}`,
        {
          method: borrador.id === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        },
      );
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo guardar el link."));
        return;
      }
      setAviso(borrador.id === null ? "Link creado." : "Link guardado.");
      setBorrador(null);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarActivo(l: LinkClub) {
    setError(null);
    setAviso(null);
    const res = await apiFetch(`/api/scheduling/links-club/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: l.nombre,
        diaSemana: l.diaSemana,
        horario: l.horario,
        link: l.link,
        activo: !l.activo,
      }),
    });
    if (!res.ok) {
      setError(await mensajeDeError(res, "No se pudo cambiar el estado."));
      return;
    }
    await cargar();
  }

  async function borrar(l: LinkClub) {
    if (!window.confirm(`¿Borrar el link "${l.nombre}"?`)) return;
    setError(null);
    setAviso(null);
    const res = await apiFetch(`/api/scheduling/links-club/${l.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await mensajeDeError(res, "No se pudo borrar el link."));
      return;
    }
    setAviso("Link borrado.");
    await cargar();
  }

  const visibles = links.filter((l) => filtroDia === "" || String(l.diaSemana) === filtroDia);

  return (
    <main style={{ padding: "2rem", maxWidth: "72rem", margin: "0 auto" }}>
      <Link href="/panel/sesiones" style={{ fontSize: "0.85rem" }}>
        ← Volver a Sesiones
      </Link>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1rem",
          flexWrap: "wrap",
          marginTop: "0.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.6rem", margin: 0 }}>🔗 Links de Clubes</h1>
          <p style={{ color: "var(--texto-suave)", marginTop: "0.25rem", maxWidth: "46rem" }}>
            Salas propias de los Clubs, distintas de la del advisor. Al crear un Club se marca
            &quot;Link diferente al del Advisor&quot; y se elige uno de los del día de la semana de
            la fecha del Club. Corregir un enlace aquí lo corrige en todas sus sesiones.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
            value={filtroDia}
            onChange={(e) => setFiltroDia(e.target.value)}
            style={{ ...campo, width: "auto" }}
            aria-label="Filtrar por día"
          >
            <option value="">Todos los días</option>
            {dias.map((d, i) => (
              <option key={d} value={String(i)}>
                {d}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={{ ...boton, background: "var(--lgs-purpura)", color: "white", border: "none" }}
            onClick={() => {
              setBorrador({ ...VACIO });
              setError(null);
              setAviso(null);
            }}
          >
            + Nuevo link
          </button>
        </div>
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {aviso !== null && <p style={{ color: "#2e7d32", fontWeight: 600 }}>{aviso}</p>}

      {borrador !== null && (
        <div
          style={{
            marginTop: "1rem",
            padding: "1rem",
            borderRadius: "0.8rem",
            border: "1px solid #d1c4e9",
            background: "#faf7ff",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
            gap: "0.7rem",
            alignItems: "end",
          }}
        >
          <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>
            Nombre *
            <input
              value={borrador.nombre}
              onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
              placeholder="Club de lectura"
              style={campo}
            />
          </label>
          <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>
            Día *
            <select
              value={borrador.diaSemana}
              onChange={(e) => setBorrador({ ...borrador, diaSemana: Number(e.target.value) })}
              style={campo}
            >
              {dias.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>
            Horario *
            <input
              value={borrador.horario}
              onChange={(e) => setBorrador({ ...borrador, horario: e.target.value })}
              placeholder="16:00 - 17:00"
              style={campo}
            />
          </label>
          <label style={{ fontSize: "0.8rem", fontWeight: 700, gridColumn: "span 2" }}>
            Link *
            <input
              value={borrador.link}
              onChange={(e) => setBorrador({ ...borrador, link: e.target.value })}
              placeholder="https://us02web.zoom.us/j/…"
              style={campo}
            />
          </label>
          {borrador.id !== null && (
            <label
              style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.85rem" }}
            >
              <input
                type="checkbox"
                checked={borrador.activo}
                onChange={(e) => setBorrador({ ...borrador, activo: e.target.checked })}
              />
              Activo
            </label>
          )}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              style={boton}
              onClick={() => setBorrador(null)}
              disabled={ocupado}
            >
              Cancelar
            </button>
            <button
              type="button"
              style={{ ...boton, background: "var(--lgs-purpura)", color: "white", border: "none" }}
              onClick={() => void guardar()}
              disabled={ocupado}
            >
              {ocupado ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: "1.2rem", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#f4f6fb" }}>
              <th style={celda}>Nombre</th>
              <th style={celda}>Día</th>
              <th style={celda}>Horario</th>
              <th style={celda}>Link</th>
              <th style={celda}>Uso</th>
              <th style={celda}>Estado</th>
              <th style={celda}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td style={celda} colSpan={7}>
                  <span style={{ color: "var(--texto-suave)" }}>
                    Todavía no hay links{filtroDia !== "" ? " para ese día" : ""}.
                  </span>
                </td>
              </tr>
            ) : (
              visibles.map((l) => (
                <tr key={l.id} style={{ opacity: l.activo ? 1 : 0.55 }}>
                  <td style={{ ...celda, fontWeight: 700 }}>{l.nombre}</td>
                  <td style={celda}>{dias[l.diaSemana] ?? l.diaSemana}</td>
                  <td style={celda}>{l.horario}</td>
                  <td style={{ ...celda, wordBreak: "break-all", maxWidth: "22rem" }}>
                    <a href={l.link} target="_blank" rel="noreferrer">
                      {l.link}
                    </a>
                  </td>
                  <td style={celda}>
                    {l.sesionesFuturas} por delante
                    <span
                      style={{ display: "block", fontSize: "0.75rem", color: "var(--texto-suave)" }}
                    >
                      {l.sesiones} en total
                    </span>
                  </td>
                  <td style={celda}>{l.activo ? "Activo" : "Inactivo"}</td>
                  <td style={celda}>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        style={boton}
                        onClick={() => {
                          setBorrador({
                            id: l.id,
                            nombre: l.nombre,
                            diaSemana: l.diaSemana,
                            horario: l.horario,
                            link: l.link,
                            activo: l.activo,
                          });
                          setError(null);
                          setAviso(null);
                        }}
                      >
                        ✏️ Editar
                      </button>
                      <button type="button" style={boton} onClick={() => void cambiarActivo(l)}>
                        {l.activo ? "Desactivar" : "Activar"}
                      </button>
                      {l.sesiones === 0 && (
                        <button
                          type="button"
                          style={{ ...boton, color: "#c62828" }}
                          onClick={() => void borrar(l)}
                        >
                          Borrar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default function LinksClubesPage() {
  return (
    <ConOpcion op="op.sesiones.links_clubes" volver="/panel/sesiones">
      <LinksClubes />
    </ConOpcion>
  );
}
