"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Visor del Material Guía: lo usan la pantalla de Mantenimiento (para revisar lo que se
 * subió) y el panel de la sesión (lo que abre el guía).
 *  - PDF: el visor del navegador, dentro de la página;
 *  - PPT/PPTX: Office para la web (con animaciones y sonido) por un enlace temporal;
 *    si no carga, "Abrir en PowerPoint" baja el archivo;
 *  - imagen y video: se ven aquí (el video con barra, para adelantar y retroceder);
 *  - enlace: se abre en una ventana nueva (no se incrusta: muchos sitios lo impiden).
 */

export type TipoItemGuia = "PPT" | "PDF" | "IMAGEN" | "VIDEO" | "ENLACE";

export interface ItemGuia {
  id: string;
  tab: "MATERIAL" | "RECURSO";
  tipo: TipoItemGuia;
  titulo: string;
  orden: number;
  enlace: string | null;
  archivo: { nombre: string; bytes: number; mime: string } | null;
}

export const ICONO_TIPO: Record<TipoItemGuia, string> = {
  PPT: "📽️",
  PDF: "📄",
  IMAGEN: "🖼️",
  VIDEO: "🎬",
  ENLACE: "🔗",
};

export const NOMBRE_TIPO: Record<TipoItemGuia, string> = {
  PPT: "Presentación",
  PDF: "PDF",
  IMAGEN: "Imagen",
  VIDEO: "Video",
  ENLACE: "Enlace",
};

const boton: CSSProperties = {
  padding: "0.3rem 0.7rem",
  borderRadius: "0.45rem",
  border: "1.5px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.78rem",
  cursor: "pointer",
  color: "inherit",
  textDecoration: "none",
  display: "inline-block",
};

const archivoUrl = (id: string) => `/api/catalog/material-guia/${id}/archivo`;

interface Office {
  visorUrl: string;
  descargaUrl: string;
  venceEnMin: number;
}

function Presentacion(props: { item: ItemGuia }) {
  const { item } = props;
  const [datos, setDatos] = useState<Office | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const res = await apiFetch(`/api/catalog/material-guia/${item.id}/office`);
      if (!vigente) return;
      if (!res.ok) {
        setError("No se pudo preparar el visor de la presentación.");
        return;
      }
      setDatos((await res.json()) as Office);
    })();
    return () => {
      vigente = false;
    };
  }, [item.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", height: "100%" }}>
      {datos === null ? (
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
          {error ?? "Preparando la presentación…"}
        </p>
      ) : (
        <iframe
          title={item.titulo}
          src={datos.visorUrl}
          allowFullScreen
          style={{
            flex: 1,
            minHeight: "26rem",
            width: "100%",
            border: "1px solid #d8dce6",
            borderRadius: "0.5rem",
          }}
        />
      )}
      <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--texto-suave)" }}>
        La presentación se ve con Office para la web (animaciones y sonido incluidos). Si no carga o
        es muy pesada,{" "}
        <a href={`${archivoUrl(item.id)}?descargar=1`} style={{ fontWeight: 700 }}>
          ábrela en PowerPoint
        </a>
        .
      </p>
    </div>
  );
}

export function VisorMaterialGuia(props: { item: ItemGuia; onCerrar?: () => void }) {
  const { item } = props;
  const contenedor = useRef<HTMLDivElement | null>(null);

  function pantallaCompleta() {
    void contenedor.current?.requestFullscreen?.();
  }

  return (
    <div
      ref={contenedor}
      style={{
        border: "1px solid #e3e7f0",
        borderRadius: "0.7rem",
        padding: "0.6rem 0.75rem",
        background: "white",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "0.9rem", flex: 1, minWidth: "10rem" }}>
          {ICONO_TIPO[item.tipo]} {item.titulo}
        </strong>
        {item.tipo !== "ENLACE" && item.tipo !== "PPT" && (
          <a href={archivoUrl(item.id)} target="_blank" rel="noopener noreferrer" style={boton}>
            Abrir en pestaña
          </a>
        )}
        {item.tipo !== "ENLACE" && (
          <button type="button" style={boton} onClick={pantallaCompleta}>
            ⛶ Pantalla completa
          </button>
        )}
        {props.onCerrar !== undefined && (
          <button type="button" style={boton} onClick={props.onCerrar}>
            Cerrar
          </button>
        )}
      </div>

      {item.tipo === "PDF" && (
        <iframe
          title={item.titulo}
          src={archivoUrl(item.id)}
          style={{
            width: "100%",
            height: "70vh",
            minHeight: "26rem",
            border: "1px solid #d8dce6",
            borderRadius: "0.5rem",
          }}
        />
      )}
      {item.tipo === "PPT" && <Presentacion item={item} />}
      {item.tipo === "IMAGEN" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={archivoUrl(item.id)}
          alt={item.titulo}
          style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", alignSelf: "center" }}
        />
      )}
      {item.tipo === "VIDEO" && (
        <video
          controls
          preload="metadata"
          src={archivoUrl(item.id)}
          style={{ width: "100%", maxHeight: "70vh", background: "black", borderRadius: "0.5rem" }}
        />
      )}
      {item.tipo === "ENLACE" && item.enlace !== null && (
        <a
          href={item.enlace}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...boton, alignSelf: "flex-start" }}
        >
          Abrir enlace en una ventana nueva ↗
        </a>
      )}
    </div>
  );
}
