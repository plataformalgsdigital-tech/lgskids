"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * CARGA DEL CATÁLOGO CURSO POR CSV, en tres pasos:
 *
 *  1. se lee el archivo en el navegador y se revisa el FORMATO (columnas,
 *     curso, nivel, orden);
 *  2. el servidor lo VALIDA contra la base sin escribir nada y dice, fila por
 *     fila, qué se crea, qué se actualiza (y qué le cambia) y qué no cambia;
 *  3. solo entonces se puede cargar, y hay que CONFIRMARLO en un modal.
 *
 * La carga es TODO o NADA: con una sola fila en error no se escribe ninguna,
 * para que el nivel nunca quede a medias entre dos versiones del archivo.
 */

const CURSOS = ["JUNIOR", "YOUNGSTER"];
const NIVELES = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"];
const OBLIGATORIAS = ["curso", "nivel", "unidad", "leccion", "orden"];
const OPCIONALES = [
  "contenido",
  "video",
  "materialguia",
  "materialusuario",
  "actividades",
  "recursos",
  "clubes",
];

const BOM = String.fromCharCode(0xfeff);
/** El Excel en español guarda con BOM; la cabecera no debe arrastrarlo. */
const sinBom = (t: string) => (t.startsWith(BOM) ? t.slice(1) : t);

// Con `;` y BOM, como exporta el Excel en español: así se abre en columnas y
// con las tildes bien. Las listas van entre comillas porque `;` separa ítems.
const PLANTILLA =
  BOM +
  "curso;nivel;unidad;leccion;orden;contenido;video;materialguia;materialusuario;actividades;recursos;clubes\n" +
  'JUNIOR;ROOKIE;Unidad 0;Leccion 1;1;"Welcome: greetings and classroom rules";https://www.youtube.com/watch?v=XXXX;"Guía Welcome|https://drive.google.com/guia.pdf";"Ficha Welcome|https://drive.google.com/ficha.pdf";"Hello song|https://wordwall.net/play/1;Name quiz|https://wordwall.net/play/2";;\n' +
  'JUNIOR;ROOKIE;Unidad 1;Leccion 2;2;"All about me";;;;;;\n' +
  'JUNIOR;ROOKIE;Repaso 1;Leccion 3;3;"Review units 0 and 1";;;;;;\n' +
  'JUNIOR;ROOKIE;Evaluacion 1;Leccion 4;4;"Level Up Rookie";;;;;;\n';

interface Item {
  nombre: string;
  url?: string;
  link?: string;
}
/** Lo que se manda al servidor. Un campo AUSENTE = la columna no vino: no se toca. */
interface FilaEnvio {
  linea: number;
  curso: string;
  nivel: string;
  unidad: string;
  leccion: string;
  orden: number;
  contenido?: string | null;
  video?: string | null;
  materialGuia?: Item[];
  materialUsuario?: Item[];
  actividades?: Item[];
  recursos?: Item[];
  clubes?: Item[];
}
interface FilaValidada {
  linea: number;
  curso: string;
  nivel: string;
  unidad: string | null;
  leccion: string;
  accion: "CREAR" | "ACTUALIZAR" | "SIN_CAMBIOS" | null;
  cambios: string[];
  avisos: string[];
  error: string | null;
}
interface Resumen {
  crear: number;
  actualizar: number;
  sinCambios: number;
  errores: number;
}

/** Decide el separador por la CABECERA: el contenido puede llevar comas legítimas. */
function detectarSeparador(text: string): "," | ";" {
  const cabecera = (text.split("\n")[0] ?? "").replace("\r", "");
  let comas = 0;
  let puntoYComa = 0;
  for (const c of cabecera) {
    if (c === ",") comas += 1;
    else if (c === ";") puntoYComa += 1;
  }
  return puntoYComa > comas ? ";" : ",";
}

/** Parser CSV mínimo con comillas ("" escapa una comilla). */
function parseCSV(text: string, sep: "," | ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function parseItems(cell: string, clave: "url" | "link"): Item[] {
  return cell
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const [nombre, valor] = part.split("|");
      return { nombre: (nombre ?? "").trim(), [clave]: (valor ?? "").trim() } as Item;
    })
    .filter((it) => it.nombre !== "");
}

/** Lee el archivo: filas listas para validar y las que ya fallan por formato. */
function leerArchivo(
  texto: string,
): { error: string } | { envio: FilaEnvio[]; malas: FilaValidada[]; columnas: string[] } {
  const rows = parseCSV(sinBom(texto), detectarSeparador(texto));
  if (rows.length < 2) return { error: "El archivo no tiene filas de datos." };
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const faltantes = OBLIGATORIAS.filter((c) => !header.includes(c));
  if (faltantes.length > 0) {
    return { error: `Faltan columnas obligatorias en la cabecera: ${faltantes.join(", ")}.` };
  }
  const tiene = (col: string) => header.includes(col);
  const envio: FilaEnvio[] = [];
  const malas: FilaValidada[] = [];
  rows.slice(1).forEach((r, i) => {
    const get = (col: string) => (r[header.indexOf(col)] ?? "").trim();
    const linea = i + 2;
    const curso = get("curso").toUpperCase();
    const nivelCrudo = get("nivel").toUpperCase();
    const nivel = nivelCrudo === "ULTIMATE STAGE" ? "ULTIMATE" : nivelCrudo;
    const unidad = get("unidad");
    const leccion = get("leccion");
    const orden = get("orden");
    let error: string | null = null;
    if (!CURSOS.includes(curso)) error = `Curso inválido: "${curso}" (JUNIOR o YOUNGSTER).`;
    else if (!NIVELES.includes(nivel)) error = `Nivel inválido: "${nivelCrudo}".`;
    else if (unidad === "") error = "Unidad vacía.";
    else if (leccion === "") error = "Lección vacía.";
    else if (!/^\d{1,3}$/.test(orden)) error = `Orden inválido: "${orden}" (número entero).`;
    if (error !== null) {
      malas.push({
        linea,
        curso,
        nivel,
        unidad,
        leccion,
        accion: null,
        cambios: [],
        avisos: [],
        error,
      });
      return;
    }
    // Solo se mandan las columnas que VINIERON: la que falta no se toca en la base.
    envio.push({
      linea,
      curso,
      nivel,
      unidad,
      leccion,
      orden: Number(orden),
      ...(tiene("contenido") && { contenido: get("contenido") || null }),
      ...(tiene("video") && { video: get("video") || null }),
      ...(tiene("materialguia") && { materialGuia: parseItems(get("materialguia"), "url") }),
      ...(tiene("materialusuario") && {
        materialUsuario: parseItems(get("materialusuario"), "url"),
      }),
      ...(tiene("actividades") && { actividades: parseItems(get("actividades"), "link") }),
      ...(tiene("recursos") && { recursos: parseItems(get("recursos"), "link") }),
      ...(tiene("clubes") && { clubes: parseItems(get("clubes"), "link") }),
    });
  });
  return { envio, malas, columnas: header.filter((h) => OPCIONALES.includes(h)) };
}

async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  try {
    const d = (await res.json()) as { error?: { message?: string } };
    return d.error?.message ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

const ACCION_UI = {
  CREAR: { texto: "🆕 Nueva", color: "#1565c0" },
  ACTUALIZAR: { texto: "↻ Actualiza", color: "#8a5a00" },
  SIN_CAMBIOS: { texto: "= Sin cambios", color: "#607080" },
} as const;

const th: CSSProperties = {
  padding: "0.4rem 0.5rem",
  textAlign: "left",
  color: "var(--texto-suave)",
  whiteSpace: "nowrap",
};
const td: CSSProperties = { padding: "0.4rem 0.5rem", verticalAlign: "top" };
const boton = (activo: boolean, fondo: string): CSSProperties => ({
  padding: "0.55rem 1.3rem",
  borderRadius: "0.6rem",
  border: "none",
  background: activo ? fondo : "#b0b7c3",
  color: activo ? "#10202b" : "#f4f6fb",
  fontWeight: 800,
  cursor: activo ? "pointer" : "not-allowed",
});

export default function CargaCatalogoCursoPage() {
  const [archivo, setArchivo] = useState("");
  const [errFormato, setErrFormato] = useState<string | null>(null);
  const [envio, setEnvio] = useState<FilaEnvio[]>([]);
  const [columnas, setColumnas] = useState<string[]>([]);
  const [filas, setFilas] = useState<FilaValidada[] | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [validando, setValidando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  function limpiar() {
    setErrFormato(null);
    setEnvio([]);
    setFilas(null);
    setResumen(null);
    setConfirmar(false);
  }

  async function validar(texto: string) {
    const leido = leerArchivo(texto);
    if ("error" in leido) {
      setErrFormato(leido.error);
      return;
    }
    setColumnas(leido.columnas);
    if (leido.envio.length === 0) {
      setFilas(leido.malas);
      setResumen({ crear: 0, actualizar: 0, sinCambios: 0, errores: leido.malas.length });
      return;
    }
    setValidando(true);
    try {
      const res = await apiFetch("/api/catalog/curso/bulk/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas: leido.envio }),
      });
      if (!res.ok) {
        setErrFormato(await mensajeDeError(res, "No se pudo validar el archivo."));
        return;
      }
      const data = (await res.json()) as { filas: FilaValidada[]; resumen: Resumen };
      const todas = [...data.filas, ...leido.malas].sort((a, b) => a.linea - b.linea);
      setEnvio(leido.envio);
      setFilas(todas);
      setResumen({ ...data.resumen, errores: data.resumen.errores + leido.malas.length });
    } catch {
      setErrFormato("Error de conexión al validar.");
    } finally {
      setValidando(false);
    }
  }

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    setResultado(null);
    limpiar();
    const file = e.target.files?.[0];
    e.target.value = ""; // para poder volver a elegir el MISMO archivo ya corregido
    if (!file) return;
    setArchivo(file.name);
    const reader = new FileReader();
    reader.onload = () => void validar(String(reader.result ?? ""));
    reader.readAsText(file, "utf-8");
  }

  async function cargar() {
    setCargando(true);
    try {
      const res = await apiFetch("/api/catalog/curso/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas: envio }),
      });
      if (!res.ok) {
        setResultado({ ok: false, texto: await mensajeDeError(res, "No se pudo cargar.") });
        setConfirmar(false);
        return;
      }
      const r = (await res.json()) as Resumen;
      setResultado({
        ok: true,
        texto: `✔ Carga completa: ${String(r.crear)} lección(es) nuevas, ${String(r.actualizar)} actualizadas y ${String(r.sinCambios)} sin cambios.`,
      });
      limpiar();
      setArchivo("");
    } catch {
      setResultado({ ok: false, texto: "Error de conexión: no se confirmó la carga." });
      setConfirmar(false);
    } finally {
      setCargando(false);
    }
  }

  const porEscribir = (resumen?.crear ?? 0) + (resumen?.actualizar ?? 0);
  const puedeCargar =
    resumen !== null && resumen.errores === 0 && porEscribir > 0 && !validando && !cargando;
  const conAvisos = filas?.filter((f) => f.avisos.length > 0).length ?? 0;

  return (
    <main style={{ padding: "2rem", maxWidth: "72rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento" style={{ fontSize: "0.9rem" }}>
        ← Mantenimiento
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>Carga catálogo Curso (CSV)</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Carga el temario y los materiales de las lecciones. Primero se <strong>valida</strong> el
        archivo contra lo que ya está guardado; nada se escribe hasta que <strong>confirmes</strong>
        .
      </p>

      <section
        style={{
          marginTop: "1rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.8rem",
          padding: "1rem",
          fontSize: "0.85rem",
        }}
      >
        <strong style={{ fontSize: "0.95rem" }}>Formato del archivo</strong>
        <ul style={{ color: "var(--texto-suave)", margin: "0.5rem 0", paddingLeft: "1.2rem" }}>
          <li>
            Obligatorias: <code>curso, nivel, unidad, leccion, orden</code>. Opcionales:{" "}
            <code>{OPCIONALES.join(", ")}</code>.
          </li>
          <li>
            <code>curso</code>: JUNIOR o YOUNGSTER · <code>nivel</code>: ROOKIE, CHAMPION, ELITE,
            LEGENDARY o ULTIMATE (también “ULTIMATE STAGE”).
          </li>
          <li>
            <code>unidad</code>: “Unidad 0” (Welcome) a “Unidad 4” son las paradas del mapa; “Repaso
            N” y “Evaluacion N” también se aceptan, pero sus juegos no se abren desde la isla.
          </li>
          <li>
            Listas: ítems <code>Nombre|enlace</code> separados por <code>;</code> y entre comillas
            dobles.
          </li>
          <li>
            Se reconoce la lección por <strong>curso + nivel + unidad + lección</strong>: si ya
            existe se actualiza. Los <strong>cuestionarios nunca se tocan</strong>, una columna que
            no viene en el archivo tampoco, y los juegos que siguen con el mismo enlace conservan su
            zona en la lámina.
          </li>
        </ul>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(PLANTILLA)}`}
          download="plantilla-catalog_curso.csv"
          style={{ fontWeight: 600 }}
        >
          ⬇️ Descargar plantilla
        </a>
      </section>

      <section
        style={{
          marginTop: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <label style={{ ...boton(true, "var(--lgs-cian)"), display: "inline-block" }}>
          📄 Elegir archivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onArchivo}
            style={{ display: "none" }}
          />
        </label>
        {archivo !== "" && (
          <span style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>
            {archivo}
            {validando && " — validando…"}
          </span>
        )}
      </section>

      {errFormato !== null && (
        <p role="alert" style={{ color: "#c62828", marginTop: "0.75rem", fontWeight: 600 }}>
          ✘ {errFormato}
        </p>
      )}
      {resultado !== null && (
        <p
          role="status"
          style={{
            color: resultado.ok ? "#1b5e20" : "#c62828",
            marginTop: "0.75rem",
            fontWeight: 700,
          }}
        >
          {resultado.texto}
        </p>
      )}

      {filas !== null && resumen !== null && (
        <section style={{ marginTop: "1.25rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.85rem" }}>
              <Chip color="#1565c0">🆕 {resumen.crear} nuevas</Chip>
              <Chip color="#8a5a00">↻ {resumen.actualizar} se actualizan</Chip>
              <Chip color="#607080">= {resumen.sinCambios} sin cambios</Chip>
              {resumen.errores > 0 && <Chip color="#c62828">✘ {resumen.errores} con error</Chip>}
              {conAvisos > 0 && <Chip color="#b35c00">⚠ {conAvisos} con aviso</Chip>}
            </div>
            <button
              type="button"
              disabled={!puedeCargar}
              onClick={() => setConfirmar(true)}
              style={boton(puedeCargar, "var(--lgs-verde)")}
            >
              Cargar {porEscribir} lección(es)…
            </button>
          </div>

          {resumen.errores > 0 && (
            <p style={{ color: "#c62828", fontSize: "0.85rem", marginTop: "0.6rem" }}>
              La carga es <strong>todo o nada</strong>: corrige las filas con error en el archivo y
              vuelve a elegirlo.
            </p>
          )}
          {resumen.errores === 0 && porEscribir === 0 && (
            <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", marginTop: "0.6rem" }}>
              El archivo coincide con lo que ya está guardado: no hay nada que cargar.
            </p>
          )}

          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid #e3e7f0" }}>
                  <th style={th}>Línea</th>
                  <th style={th}>Resultado</th>
                  <th style={th}>Curso</th>
                  <th style={th}>Nivel</th>
                  <th style={th}>Unidad</th>
                  <th style={th}>Lección</th>
                  <th style={th}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr
                    key={f.linea}
                    style={{
                      borderBottom: "1px solid #edf0f6",
                      background: f.error !== null ? "#fff5f5" : "white",
                    }}
                  >
                    <td style={td}>{f.linea}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>
                      {f.error !== null ? (
                        <span style={{ color: "#c62828" }}>✘ Error</span>
                      ) : f.accion !== null ? (
                        <span style={{ color: ACCION_UI[f.accion].color }}>
                          {ACCION_UI[f.accion].texto}
                        </span>
                      ) : null}
                    </td>
                    <td style={td}>{f.curso}</td>
                    <td style={td}>{f.nivel}</td>
                    <td style={td}>{f.unidad ?? "—"}</td>
                    <td style={td}>{f.leccion}</td>
                    <td style={td}>
                      {f.error !== null && <span style={{ color: "#c62828" }}>{f.error}</span>}
                      {f.cambios.length > 0 && <span>Cambia: {f.cambios.join(", ")}</span>}
                      {f.avisos.map((a) => (
                        <div key={a} style={{ color: "#b35c00" }}>
                          ⚠ {a}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {confirmar && resumen !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-confirmar-carga"
          onClick={() => !cargando && setConfirmar(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "0.9rem",
              padding: "1.25rem 1.4rem",
              maxWidth: "32rem",
              width: "100%",
            }}
          >
            <h2 id="titulo-confirmar-carga" style={{ fontSize: "1.15rem", marginTop: 0 }}>
              ¿Cargar el catálogo?
            </h2>
            <p style={{ fontSize: "0.9rem", margin: "0.4rem 0" }}>
              Archivo <strong>{archivo}</strong>:
            </p>
            <ul style={{ fontSize: "0.9rem", margin: "0.4rem 0 0.8rem", paddingLeft: "1.2rem" }}>
              {resumen.crear > 0 && (
                <li>
                  <strong>{resumen.crear}</strong> lección(es) nuevas
                </li>
              )}
              {resumen.actualizar > 0 && (
                <li>
                  <strong>{resumen.actualizar}</strong> lección(es) se actualizan y reemplazan lo
                  que tenían en: {["orden", ...columnas].join(", ")}
                </li>
              )}
              {resumen.sinCambios > 0 && <li>{resumen.sinCambios} quedan igual</li>}
            </ul>
            {conAvisos > 0 && (
              <p style={{ fontSize: "0.85rem", color: "#b35c00" }}>
                ⚠ {conAvisos} fila(s) tienen avisos (revísalos en la tabla antes de confirmar).
              </p>
            )}
            <p style={{ fontSize: "0.82rem", color: "var(--texto-suave)" }}>
              Los cuestionarios no se tocan. La carga se hace completa o no se hace, y queda en la
              auditoría.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.6rem",
                marginTop: "1rem",
              }}
            >
              <button
                type="button"
                onClick={() => setConfirmar(false)}
                disabled={cargando}
                style={boton(!cargando, "#e3e7f0")}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void cargar()}
                disabled={cargando}
                style={boton(!cargando, "var(--lgs-verde)")}
              >
                {cargando ? "Cargando…" : "Confirmar carga"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Chip(props: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        border: `1.5px solid ${props.color}`,
        color: props.color,
        borderRadius: "999px",
        padding: "0.2rem 0.65rem",
        fontWeight: 700,
      }}
    >
      {props.children}
    </span>
  );
}
