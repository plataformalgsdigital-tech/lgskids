"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { ICONO_TIPO, NOMBRE_TIPO, VisorMaterialGuia, type ItemGuia } from "@/ui/VisorMaterialGuia";

/**
 * "📖 Material" y "🔗 Recursos" del modal de la sesión: lo que Mantenimiento Académico ›
 * Material Guía cargó para LA LECCIÓN de esta sesión (la derivada del catálogo Curso).
 * Una sesión sin lección del catálogo —un refuerzo, un evento, un Welcome— no tiene.
 *
 * El guía elige un ítem con su botón y lo ve en el visor de abajo: PDF y presentación
 * (Office para la web, con animaciones y sonido), imagen y video. El enlace se abre en
 * una ventana nueva.
 */

const boton: CSSProperties = {
  padding: "0.4rem 0.8rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.82rem",
  cursor: "pointer",
  color: "inherit",
  textDecoration: "none",
  display: "inline-block",
};

export function MaterialGuiaSesion(props: {
  tab: "MATERIAL" | "RECURSO";
  /** La fila del catálogo de la lección de la sesión (null = la sesión no tiene lección). */
  leccionRefId: string | null;
  /** "Champion · Lección 3", para decir de cuál es. */
  etiquetaLeccion: string;
}) {
  const { tab, leccionRefId, etiquetaLeccion } = props;
  const [items, setItems] = useState<ItemGuia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viendo, setViendo] = useState<ItemGuia | null>(null);

  useEffect(() => {
    if (leccionRefId === null) return;
    let vigente = true;
    void (async () => {
      setItems(null);
      setViendo(null);
      setError(null);
      const res = await apiFetch(`/api/catalog/material-guia?cursoId=${leccionRefId}&tab=${tab}`);
      if (!vigente) return;
      if (!res.ok) {
        setError("No se pudo leer el material de esta lección.");
        return;
      }
      setItems(((await res.json()) as { items: ItemGuia[] }).items);
    })();
    return () => {
      vigente = false;
    };
  }, [leccionRefId, tab]);

  const quien = tab === "MATERIAL" ? "material" : "recursos";

  if (leccionRefId === null) {
    return (
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
        Esta sesión no tiene una lección del catálogo (un refuerzo, un evento o un Welcome no la
        tienen), así que no hay {quien} para mostrar.
      </p>
    );
  }
  if (items === null) {
    return (
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
        {error ?? "Cargando…"}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
        Todavía no hay {quien} cargado para {etiquetaLeccion}. Se sube en Mantenimiento Académico ›
        Material Guía.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--texto-suave)" }}>
        {tab === "MATERIAL" ? "Material" : "Recursos"} de {etiquetaLeccion}.
      </p>
      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
        {items.map((it) =>
          it.tipo === "ENLACE" && it.enlace !== null ? (
            <a
              key={it.id}
              href={it.enlace}
              target="_blank"
              rel="noopener noreferrer"
              style={boton}
              title="Se abre en una ventana nueva"
            >
              {ICONO_TIPO[it.tipo]} {it.titulo} ↗
            </a>
          ) : (
            <button
              key={it.id}
              type="button"
              onClick={() => setViendo(viendo?.id === it.id ? null : it)}
              title={NOMBRE_TIPO[it.tipo]}
              style={{
                ...boton,
                border: viendo?.id === it.id ? "2px solid var(--lgs-azul)" : "1.5px solid #d8dce6",
                background: viendo?.id === it.id ? "#eef5ff" : "white",
              }}
            >
              {ICONO_TIPO[it.tipo]} {it.titulo}
            </button>
          ),
        )}
      </div>
      {viendo !== null && <VisorMaterialGuia item={viendo} onCerrar={() => setViendo(null)} />}
    </div>
  );
}
