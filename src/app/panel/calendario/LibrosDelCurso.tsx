"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { abrirLibroEnPestana, type CajaLibro, type VocesLibro } from "@/ui/libro-pestana";

/**
 * "📚 Libros" del modal de la sesión: el material del alumno del CURSO de la sesión
 * (Junior en una sesión Junior, Youngster en una Youngster), de TODOS los niveles:
 * el libro interactivo, el libro completo para descargar (PDF) y el libro de
 * actividades completo (PDF). Debajo de cada nivel, los PDF por unidad, por si el del
 * nivel completo aún no está cargado.
 *
 * Es la misma lectura del equipo (`GET /api/catalog/material`, `catalogo.ver`): el
 * guía ve lo que subió Mantenimiento Académico. El interactivo se abre como en la
 * vista previa del equipo —en su pestaña, con la misma caja y sus videos y con todas
 * las unidades abiertas: es una revisión, no una clase—; el PDF, tal cual.
 */

interface Resumen {
  id: string;
  nombre: string;
  bytes: number;
  videosBase?: string | null;
  url?: string;
  voces?: VocesLibro | null;
}
interface Casilla {
  parada: number;
  etiqueta: string;
  archivo: Resumen | null;
}
interface FilaNivel {
  nivel: string;
  nombreNivel: string;
  interactivo: Resumen | null;
  imprimibles: Casilla[];
  imprimibleCompleto: Resumen | null;
  actividades: Casilla[];
  actividadesCompleto: Resumen | null;
}
interface Estado {
  cursos: Record<string, FilaNivel[]>;
  libro: CajaLibro;
  autorizacionPrevia: string;
}

const NOMBRE_CURSO: Record<string, string> = { JUNIOR: "Junior", YOUNGSTER: "Youngster" };

const enlace: CSSProperties = {
  padding: "0.25rem 0.65rem",
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
const sinCargar: CSSProperties = { fontSize: "0.78rem", color: "var(--texto-suave)" };

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

export function LibrosDelCurso(props: {
  /** JUNIOR o YOUNGSTER: el curso de la sesión. */
  curso: string | null;
  /** El nivel de la clase (se marca), si se conoce. */
  nivelDeLaClase: string | null;
}) {
  const { curso, nivelDeLaClase } = props;
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const res = await apiFetch("/api/catalog/material");
      if (!vigente) return;
      if (!res.ok) {
        setError("No se pudo leer el material cargado.");
        return;
      }
      setEstado((await res.json()) as Estado);
    })();
    return () => {
      vigente = false;
    };
  }, []);

  function abrirInteractivo(libro: Resumen) {
    if (estado === null) return;
    const abierto = abrirLibroEnPestana({
      url: libro.url ?? `/api/catalog/material/${libro.id}`,
      caja: estado.libro,
      claveProgreso: `lgs-material:equipo:${libro.id}`,
      videosBase: libro.videosBase ?? null,
      autorizacion: estado.autorizacionPrevia,
      voces: libro.voces ?? null,
    });
    if (!abierto) {
      setError("El navegador bloqueó la ventana del libro. Permite las ventanas emergentes.");
    }
  }

  if (curso === null || curso === "") {
    return <p style={sinCargar}>Esta sesión no tiene un curso asociado.</p>;
  }
  if (estado === null) {
    return <p style={sinCargar}>{error ?? "Cargando…"}</p>;
  }
  const filas = estado.cursos[curso] ?? [];
  if (filas.length === 0) {
    return (
      <p style={sinCargar}>
        Todavía no hay material cargado para {NOMBRE_CURSO[curso] ?? curso}. Se sube en
        Mantenimiento Académico › Material del alumno.
      </p>
    );
  }

  const pdf = (a: Resumen | null) =>
    a === null ? (
      <span style={sinCargar}>Sin cargar</span>
    ) : (
      <a
        href={`/api/catalog/material/${a.id}`}
        target="_blank"
        rel="noopener noreferrer"
        style={enlace}
        title={`${a.nombre} · ${mb(a.bytes)}`}
      >
        Abrir PDF
      </a>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--texto-suave)" }}>
        Material de {NOMBRE_CURSO[curso] ?? curso}, de todos los niveles. El libro interactivo se
        abre con todas las unidades habilitadas (es una revisión, no una clase).
      </p>
      {error !== null && (
        <p
          role="alert"
          style={{ margin: 0, fontSize: "0.82rem", color: "#c62828", fontWeight: 600 }}
        >
          {error}
        </p>
      )}
      <div
        style={{
          maxHeight: "22rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.45rem",
        }}
      >
        {filas.map((f) => {
          const esDeLaClase =
            nivelDeLaClase !== null && nivelDeLaClase.toUpperCase() === f.nivel.toUpperCase();
          const porUnidad =
            f.imprimibles.some((c) => c.archivo !== null) ||
            f.actividades.some((c) => c.archivo !== null);
          return (
            <div
              key={f.nivel}
              style={{
                border: esDeLaClase ? "2px solid var(--lgs-azul)" : "1px solid #edf0f6",
                borderRadius: "0.6rem",
                padding: "0.5rem 0.7rem",
                background: esDeLaClase ? "#f2f7ff" : "#fafbfe",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "0.88rem", marginBottom: "0.35rem" }}>
                {f.nombreNivel}
                {esDeLaClase && (
                  <span
                    style={{ marginLeft: "0.4rem", fontSize: "0.7rem", color: "var(--lgs-azul)" }}
                  >
                    · nivel de esta clase
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
                  gap: "0.5rem 1rem",
                  fontSize: "0.82rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, marginBottom: "0.2rem" }}>
                    📖 Libro interactivo
                  </div>
                  {f.interactivo === null ? (
                    <span style={sinCargar}>Sin cargar</span>
                  ) : (
                    <button
                      type="button"
                      style={enlace}
                      onClick={() => abrirInteractivo(f.interactivo!)}
                    >
                      Abrir libro
                    </button>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: "0.2rem" }}>
                    ⬇️ Libro completo (PDF)
                  </div>
                  {pdf(f.imprimibleCompleto)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: "0.2rem" }}>
                    ✏️ Actividades completo (PDF)
                  </div>
                  {pdf(f.actividadesCompleto)}
                </div>
              </div>
              {porUnidad && (
                <details style={{ marginTop: "0.4rem", fontSize: "0.8rem" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>PDF por unidad</summary>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      marginTop: "0.3rem",
                    }}
                  >
                    {f.imprimibles.map((c) => {
                      const act = f.actividades.find((x) => x.parada === c.parada);
                      if (c.archivo === null && (act?.archivo ?? null) === null) return null;
                      return (
                        <div
                          key={c.parada}
                          style={{
                            display: "flex",
                            gap: "0.6rem",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ minWidth: "5.5rem", fontWeight: 600 }}>{c.etiqueta}</span>
                          <span>Libro: {pdf(c.archivo)}</span>
                          <span>Actividades: {pdf(act?.archivo ?? null)}</span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
