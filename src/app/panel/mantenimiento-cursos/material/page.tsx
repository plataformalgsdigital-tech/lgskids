"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { abrirLibroEnPestana, type CajaLibro } from "@/ui/libro-pestana";

type Curso = "JUNIOR" | "YOUNGSTER";
type Tipo = "interactivo" | "imprimible" | "actividades";

interface Resumen {
  id: string;
  nombre: string;
  bytes: number;
  subidoEn: string;
  /** Solo el interactivo: base con token de SUS videos. */
  videosBase?: string | null;
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
  /** El PDF va por UNIDAD: el nivel se abre de a poco y el PDF lo sigue. */
  imprimibles: Casilla[];
  /** Y el del nivel entero: el niño lo abre con las cuatro unidades abiertas. */
  imprimibleCompleto: Resumen | null;
  /** Libro de actividades, por unidad. */
  actividades: Casilla[];
  /** Y el del nivel entero: el niño lo abre con las cuatro unidades abiertas. */
  actividadesCompleto: Resumen | null;
}
interface Estado {
  tamanoMaximo: number;
  cursos: Record<string, FilaNivel[]>;
  /** La caja del libro: permisos de su pestaña y cómo habla el puente. */
  libro: CajaLibro;
  /** Vista previa del equipo: con todas las unidades abiertas. */
  autorizacionPrevia: string;
}

const CURSOS: Curso[] = ["JUNIOR", "YOUNGSTER"];

const COLUMNAS: { tipo: Tipo; titulo: string; ayuda: string; accept: string }[] = [
  {
    tipo: "interactivo",
    titulo: "📖 Libro interactivo",
    ayuda: "Archivo .html autocontenido",
    accept: ".html,.htm,text/html",
  },
  {
    tipo: "imprimible",
    titulo: "⬇️ Libro para descargar",
    ayuda: "PDF por unidad y del nivel completo",
    accept: ".pdf,application/pdf",
  },
  {
    tipo: "actividades",
    titulo: "✏️ Libro de actividades",
    ayuda: "PDF por unidad y del nivel completo",
    accept: ".pdf,application/pdf",
  },
];

/** Qué celda está ocupada: el PDF tiene una por unidad. */
const celdaOcupada = (nivel: string, tipo: Tipo, parada: number | null) =>
  `${nivel}:${tipo}:${parada === null ? "" : String(parada)}`;

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });

const boton: CSSProperties = {
  padding: "0.35rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.8rem",
  cursor: "pointer",
  color: "inherit",
  textDecoration: "none",
  display: "inline-block",
};

export default function MaterialAlumnoPage() {
  const [curso, setCurso] = useState<Curso>("JUNIOR");
  const [estado, setEstado] = useState<Estado | null>(null);
  // Celda ocupada ("NIVEL:tipo"): una subida de 30 MB tarda, y el botón no
  // debe poder lanzarse dos veces.
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const res = await apiFetch("/api/catalog/material");
    if (res.ok) setEstado((await res.json()) as Estado);
    else setMsg({ ok: false, texto: "No se pudo leer el material cargado." });
  }, []);

  useEffect(() => {
    async function run() {
      await cargar();
    }
    void run();
  }, [cargar]);

  /**
   * Revisa el libro EXACTAMENTE como lo ve el niño: su propia pestaña, con la
   * misma caja, el mismo puente y sus videos. El progreso de estas pruebas se
   * guarda aparte (`lgs-material:equipo:<id>`), no con el de ningún alumno, y
   * aquí SÍ se abren todas las unidades: es una revisión, no una clase.
   */
  function verLibro(libro: Resumen) {
    if (estado === null) return;
    const abierto = abrirLibroEnPestana({
      url: `/api/catalog/material/${libro.id}`,
      caja: estado.libro,
      claveProgreso: `lgs-material:equipo:${libro.id}`,
      videosBase: libro.videosBase ?? null,
      autorizacion: estado.autorizacionPrevia,
    });
    if (!abierto) {
      setMsg({
        ok: false,
        texto: "El navegador bloqueó la ventana del libro. Permite las ventanas emergentes.",
      });
    }
  }

  async function subir(
    tipo: Tipo,
    fila: FilaNivel,
    archivo: File,
    parada: number | null,
    actual: Resumen | null,
  ) {
    if (
      actual !== null &&
      !window.confirm(`¿Reemplazar “${actual.nombre}” de ${curso} · ${fila.nombreNivel}?`)
    ) {
      return;
    }
    if (estado !== null && archivo.size > estado.tamanoMaximo) {
      setMsg({
        ok: false,
        texto: `“${archivo.name}” pesa ${mb(archivo.size)}; el máximo es ${mb(estado.tamanoMaximo)}.`,
      });
      return;
    }
    setOcupada(celdaOcupada(fila.nivel, tipo, parada));
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("tipo", tipo);
      fd.append("curso", curso);
      fd.append("nivel", fila.nivel);
      if (parada !== null) fd.append("parada", String(parada));
      fd.append("archivo", archivo);
      const res = await apiFetch("/api/catalog/material", { method: "POST", body: fd });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message: string } };
        setMsg({ ok: false, texto: data.error?.message ?? "No se pudo subir." });
        return;
      }
      setMsg({ ok: true, texto: `✔ ${curso} · ${fila.nombreNivel}: “${archivo.name}” cargado.` });
      await cargar();
    } catch {
      setMsg({ ok: false, texto: "Error de conexión durante la subida." });
    } finally {
      setOcupada(null);
    }
  }

  async function quitar(
    tipo: Tipo,
    fila: FilaNivel,
    parada: number | null,
    actual: Resumen | null,
  ) {
    if (actual === null) return;
    if (!window.confirm(`¿Quitar “${actual.nombre}”? Los niños dejarán de verlo.`)) return;
    setOcupada(celdaOcupada(fila.nivel, tipo, parada));
    setMsg(null);
    try {
      const q = new URLSearchParams({ tipo, curso, nivel: fila.nivel });
      if (parada !== null) q.set("parada", String(parada));
      const res = await apiFetch(`/api/catalog/material?${q.toString()}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message: string } };
        setMsg({ ok: false, texto: data.error?.message ?? "No se pudo quitar." });
        return;
      }
      setMsg({ ok: true, texto: `✔ Quitado de ${curso} · ${fila.nombreNivel}.` });
      await cargar();
    } finally {
      setOcupada(null);
    }
  }

  const filas = estado?.cursos[curso] ?? [];

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.9rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>Material del alumno</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Lo que el niño abre desde <strong>Material</strong> en su panel: el{" "}
        <strong>libro interactivo</strong> (se abre en su propia pestaña), el{" "}
        <strong>libro para descargar</strong> y el <strong>libro de actividades</strong> (PDF). Cada
        niño ve los de su nivel actual y los de los niveles que ya completó.
      </p>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", marginTop: "0.3rem" }}>
        Los PDF van <strong>por unidad</strong>: el niño descarga cada una cuando su guía le abre
        esa misión. El de actividades admite además el del nivel completo, que se le habilita con
        las cuatro unidades abiertas.
      </p>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", marginTop: "0.3rem" }}>
        Subir un archivo donde ya hay uno lo reemplaza.
        {estado !== null && <> Máximo {mb(estado.tamanoMaximo)} por archivo.</>}
      </p>

      <div role="tablist" style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
        {CURSOS.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={curso === c}
            onClick={() => setCurso(c)}
            style={{
              ...boton,
              fontSize: "0.9rem",
              padding: "0.5rem 1.2rem",
              background: curso === c ? "var(--lgs-azul)" : "white",
              color: curso === c ? "white" : "inherit",
              borderColor: curso === c ? "var(--lgs-azul)" : "#d8dce6",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {msg !== null && (
        <p
          role="status"
          style={{ marginTop: "1rem", fontWeight: 600, color: msg.ok ? "#1b5e20" : "#c62828" }}
        >
          {msg.texto}
        </p>
      )}

      <div style={{ marginTop: "1rem", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "40rem" }}>
          <thead>
            <tr style={{ textAlign: "left", fontSize: "0.8rem", color: "var(--texto-suave)" }}>
              <th style={{ padding: "0.6rem" }}>Nivel</th>
              {COLUMNAS.map((c) => (
                <th key={c.tipo} style={{ padding: "0.6rem" }}>
                  {c.titulo}
                  <div style={{ fontWeight: 400, fontSize: "0.75rem" }}>{c.ayuda}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estado === null && (
              <tr>
                <td colSpan={3} style={{ padding: "1rem", color: "var(--texto-suave)" }}>
                  Cargando…
                </td>
              </tr>
            )}
            {filas.map((fila) => {
              /**
               * Una casilla de archivo. El libro interactivo tiene una por
               * nivel; el PDF, una por unidad, porque el nivel se abre de a
               * poco y el PDF sigue ese ritmo.
               */
              const celda = (
                tipo: Tipo,
                parada: number | null,
                actual: Resumen | null,
                etiqueta?: string,
              ) => {
                const c = COLUMNAS.find((x) => x.tipo === tipo);
                const enCurso = ocupada === celdaOcupada(fila.nivel, tipo, parada);
                const bloqueada = ocupada !== null;
                return (
                  <div
                    key={`${tipo}:${parada === null ? "nivel" : String(parada)}`}
                    style={{ marginBottom: etiqueta === undefined ? 0 : "0.6rem" }}
                  >
                    {etiqueta !== undefined && (
                      <div style={{ fontSize: "0.78rem", fontWeight: 800 }}>{etiqueta}</div>
                    )}
                    {actual !== null ? (
                      <div style={{ fontSize: "0.82rem" }}>
                        <div style={{ fontWeight: 700, wordBreak: "break-all" }}>
                          ✅ {actual.nombre}
                        </div>
                        <div style={{ color: "var(--texto-suave)" }}>
                          {mb(actual.bytes)} · {fecha(actual.subidoEn)}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.82rem", color: "var(--texto-suave)" }}>
                        Sin cargar
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: "0.4rem",
                        flexWrap: "wrap",
                        marginTop: "0.4rem",
                      }}
                    >
                      {enCurso ? (
                        <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                          ⏳ Procesando… puede tardar
                        </span>
                      ) : (
                        <>
                          {actual !== null &&
                            // El libro se abre en su pestaña, en la MISMA caja
                            // del niño y con sus videos; el PDF, tal cual.
                            (tipo === "interactivo" ? (
                              <button type="button" onClick={() => verLibro(actual)} style={boton}>
                                Ver
                              </button>
                            ) : (
                              <a
                                href={`/api/catalog/material/${actual.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={boton}
                              >
                                Ver
                              </a>
                            ))}
                          <label
                            style={{
                              ...boton,
                              opacity: bloqueada ? 0.5 : 1,
                              cursor: bloqueada ? "not-allowed" : "pointer",
                              background: actual === null ? "var(--lgs-verde)" : "white",
                            }}
                          >
                            {actual === null ? "Subir" : "Reemplazar"}
                            <input
                              type="file"
                              accept={c?.accept}
                              disabled={bloqueada}
                              style={{ display: "none" }}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = ""; // permite volver a elegir el mismo archivo
                                if (f !== undefined) void subir(tipo, fila, f, parada, actual);
                              }}
                            />
                          </label>
                          {actual !== null && (
                            <button
                              type="button"
                              disabled={bloqueada}
                              onClick={() => void quitar(tipo, fila, parada, actual)}
                              style={{ ...boton, color: "#c62828" }}
                            >
                              Quitar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              };

              return (
                <tr key={fila.nivel} style={{ borderTop: "1px solid #e3e7f0" }}>
                  <td style={{ padding: "0.8rem 0.6rem", fontWeight: 800, verticalAlign: "top" }}>
                    {fila.nombreNivel}
                  </td>
                  <td style={{ padding: "0.8rem 0.6rem", verticalAlign: "top" }}>
                    {celda("interactivo", null, fila.interactivo)}
                  </td>
                  <td style={{ padding: "0.8rem 0.6rem", verticalAlign: "top" }}>
                    {fila.imprimibles.map((p) =>
                      celda("imprimible", p.parada, p.archivo, p.etiqueta),
                    )}
                    <div
                      style={{
                        marginTop: "0.5rem",
                        paddingTop: "0.5rem",
                        borderTop: "1px dashed #e3e7f0",
                      }}
                    >
                      {celda(
                        "imprimible",
                        null,
                        fila.imprimibleCompleto,
                        "Nivel completo (se abre con las 4 unidades)",
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "0.8rem 0.6rem", verticalAlign: "top" }}>
                    {fila.actividades.map((p) =>
                      celda("actividades", p.parada, p.archivo, p.etiqueta),
                    )}
                    <div
                      style={{
                        marginTop: "0.5rem",
                        paddingTop: "0.5rem",
                        borderTop: "1px dashed #e3e7f0",
                      }}
                    >
                      {celda(
                        "actividades",
                        null,
                        fila.actividadesCompleto,
                        "Nivel completo (se abre con las 4 unidades)",
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
