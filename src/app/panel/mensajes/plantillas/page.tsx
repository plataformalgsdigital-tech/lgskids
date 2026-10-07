"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { AvisoProveedor } from "../AvisoProveedor";

interface Plantilla {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  contenido: string;
  activo: boolean;
  marcadores: string[];
  usaClave: boolean;
}
interface Marcador {
  clave: string;
  descripcion: string;
}

const SLUG_CREDENCIALES = "credenciales-kids";
const LARGO = 1000;

const input: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  width: "100%",
};
const btn: CSSProperties = {
  padding: "0.45rem 0.9rem",
  borderRadius: "0.55rem",
  border: "1px solid #d8dce6",
  background: "white",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
};
const btnPrimario: CSSProperties = {
  ...btn,
  border: "none",
  background: "var(--lgs-azul)",
  color: "white",
};

/** Resalta los {{marcadores}} del texto. */
function ConMarcadores({ texto }: { texto: string }) {
  const partes = texto.split(/(\{\{\s*[A-Za-z][A-Za-z0-9_]*\s*\}\})/g);
  return (
    <>
      {partes.map((p, i) =>
        /^\{\{/.test(p) ? (
          <span
            key={i}
            style={{
              background: p.includes("clave") ? "#fde7ef" : "#e3f2fd",
              color: p.includes("clave") ? "#ad1457" : "#0d47a1",
              borderRadius: "0.3rem",
              padding: "0 0.2rem",
              fontWeight: 600,
            }}
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default function PlantillasPage() {
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [marcadores, setMarcadores] = useState<Marcador[]>([]);
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [inactivas, setInactivas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Plantilla | "nueva" | null>(null);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/notifications/plantillas${inactivas ? "?inactivas=1" : ""}`);
    const data: {
      plantillas?: Plantilla[];
      marcadores?: Marcador[];
      proveedor?: string;
      puedeEditar?: boolean;
      error?: { message: string };
    } = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "No se pudieron cargar las plantillas.");
      return;
    }
    setPlantillas(data.plantillas ?? []);
    setMarcadores(data.marcadores ?? []);
    setProveedor(data.proveedor ?? null);
    setPuedeEditar(data.puedeEditar === true);
  }, [inactivas]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  async function desactivar(p: Plantilla) {
    if (!window.confirm(`¿Desactivar la plantilla "${p.nombre}"? Deja de ofrecerse para enviar.`)) {
      return;
    }
    const res = await apiFetch(`/api/notifications/plantillas/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: false }),
    });
    if (!res.ok) {
      const data: { error?: { message: string } } = await res.json();
      setError(data.error?.message ?? "No se pudo desactivar.");
      return;
    }
    await cargar();
  }

  const th: CSSProperties = {
    padding: "0.55rem 0.6rem",
    textAlign: "left",
    fontWeight: 600,
    color: "var(--texto-suave)",
  };
  const td: CSSProperties = { padding: "0.65rem 0.6rem", verticalAlign: "top" };

  return (
    <main style={{ padding: "2rem", maxWidth: "72rem", margin: "0 auto" }}>
      <Link href="/panel/mensajes" style={{ fontSize: "0.9rem" }}>
        ← Mensajes
      </Link>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginTop: "0.4rem",
        }}
      >
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Plantillas de mensajes</h1>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <label
            style={{ display: "flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem" }}
          >
            <input
              type="checkbox"
              checked={inactivas}
              onChange={(e) => setInactivas(e.target.checked)}
            />
            Incluir inactivas
          </label>
          {puedeEditar && (
            <button type="button" style={btnPrimario} onClick={() => setEditando("nueva")}>
              + Nueva plantilla
            </button>
          )}
        </div>
      </div>
      <AvisoProveedor proveedor={proveedor} />
      {error !== null && (
        <p role="alert" style={{ color: "#c62828", marginTop: "0.75rem" }}>
          {error}
        </p>
      )}

      {plantillas === null ? (
        <p style={{ color: "var(--texto-suave)", marginTop: "1rem" }}>Cargando…</p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "1rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid #e3e7f0" }}>
                <th style={th}>Nombre</th>
                <th style={th}>Identificador</th>
                <th style={th}>Contenido</th>
                <th style={th}>Estado</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {plantillas.map((p) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: "1px solid #edf0f6", opacity: p.activo ? 1 : 0.55 }}
                >
                  <td style={{ ...td, minWidth: "12rem" }}>
                    <strong>{p.nombre}</strong>
                    {p.descripcion !== null && (
                      <div style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                        {p.descripcion}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <code style={{ fontSize: "0.8rem" }}>{p.slug}</code>
                  </td>
                  <td style={{ ...td, whiteSpace: "pre-wrap", maxWidth: "30rem" }}>
                    <ConMarcadores
                      texto={
                        p.contenido.length > 260 ? `${p.contenido.slice(0, 260)}…` : p.contenido
                      }
                    />
                    {p.usaClave && (
                      <div style={{ fontSize: "0.75rem", color: "#ad1457", marginTop: "0.3rem" }}>
                        🔑 Lleva la clave: se envía solo desde la ficha de cada niño.
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        padding: "0.15rem 0.55rem",
                        borderRadius: "999px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background: p.activo ? "#e8f5e9" : "#eceff1",
                        color: p.activo ? "#1b5e20" : "#5a6172",
                      }}
                    >
                      {p.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {puedeEditar && (
                      <span style={{ display: "inline-flex", gap: "0.4rem" }}>
                        <button type="button" style={btn} onClick={() => setEditando(p)}>
                          Editar
                        </button>
                        {p.activo && p.slug !== SLUG_CREDENCIALES && (
                          <button
                            type="button"
                            style={{ ...btn, color: "#c62828" }}
                            onClick={() => void desactivar(p)}
                          >
                            Desactivar
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando !== null && (
        <EditorPlantilla
          plantilla={editando === "nueva" ? null : editando}
          marcadores={marcadores}
          onCerrar={() => setEditando(null)}
          onGuardada={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}
    </main>
  );
}

function EditorPlantilla({
  plantilla,
  marcadores,
  onCerrar,
  onGuardada,
}: {
  plantilla: Plantilla | null;
  marcadores: Marcador[];
  onCerrar: () => void;
  onGuardada: () => void;
}) {
  const nueva = plantilla === null;
  const [slug, setSlug] = useState(plantilla?.slug ?? "");
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion ?? "");
  const [contenido, setContenido] = useState(plantilla?.contenido ?? "");
  const [activo, setActivo] = useState(plantilla?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    setError(null);
    setOcupado(true);
    try {
      const res = nueva
        ? await apiFetch("/api/notifications/plantillas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug, nombre, descripcion: descripcion || null, contenido }),
          })
        : await apiFetch(`/api/notifications/plantillas/${plantilla.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre, descripcion: descripcion || null, contenido, activo }),
          });
      if (!res.ok) {
        const data: { error?: { message: string } } = await res.json();
        setError(data.error?.message ?? "No se pudo guardar.");
        return;
      }
      onGuardada();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
        zIndex: 50,
      }}
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "1rem",
          padding: "1.4rem",
          width: "min(44rem, 100%)",
          maxHeight: "92vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.8rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
          {nueva ? "Nueva plantilla" : `Editar: ${plantilla.nombre}`}
        </h2>
        {nueva ? (
          <label>
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
              Identificador (minúsculas, números y guiones; no se puede cambiar después)
            </span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              maxLength={60}
              placeholder="aviso-inicio-programa"
              style={input}
            />
          </label>
        ) : (
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--texto-suave)" }}>
            Identificador: <code>{plantilla.slug}</code>
          </p>
        )}
        <label>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={120}
            style={input}
          />
        </label>
        <label>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Descripción (opcional)</span>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={500}
            style={input}
          />
        </label>
        <label>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
            Contenido ({contenido.length}/{LARGO})
          </span>
          <textarea
            value={contenido}
            onChange={(e) => setContenido(e.target.value.slice(0, LARGO))}
            rows={9}
            style={{ ...input, fontFamily: "inherit", resize: "vertical" }}
          />
        </label>
        <div>
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
            Marcadores (clic para agregarlo al final)
          </span>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
            {marcadores.map((m) => (
              <button
                key={m.clave}
                type="button"
                title={m.descripcion}
                onClick={() => setContenido((c) => `${c}{{${m.clave}}}`.slice(0, LARGO))}
                style={{
                  ...btn,
                  padding: "0.2rem 0.55rem",
                  fontSize: "0.78rem",
                  background: m.clave === "clave" ? "#fde7ef" : "#e3f2fd",
                  color: m.clave === "clave" ? "#ad1457" : "#0d47a1",
                  border: "none",
                }}
              >
                {`{{${m.clave}}}`}
              </button>
            ))}
          </div>
          <p style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: "var(--texto-suave)" }}>
            Usa *texto* para negrita en WhatsApp. Una plantilla con {"{{clave}}"} solo se puede
            enviar desde la ficha de cada niño.
          </p>
        </div>
        {!nueva && plantilla.slug !== SLUG_CREDENCIALES && (
          <label
            style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.88rem" }}
          >
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activa
          </label>
        )}
        {error !== null && (
          <p role="alert" style={{ margin: 0, color: "#c62828", fontSize: "0.88rem" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" style={btn} onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...btnPrimario, opacity: ocupado ? 0.6 : 1 }}
            disabled={ocupado}
            onClick={() => void guardar()}
          >
            {ocupado ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
