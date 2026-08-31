"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

const CURSOS = ["JUNIOR", "YOUNGSTER"];
const NIVELES = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"];

// Columnas esperadas (en minúsculas, sin acentos donde aplica).
const COLUMNAS = [
  "curso",
  "nivel",
  "unidad",
  "leccion",
  "orden",
  "contenido",
  "video",
  "materialguia",
  "materialusuario",
  "actividades",
  "recursos",
  "clubes",
] as const;

const PLANTILLA =
  "curso,nivel,unidad,leccion,orden,contenido,video,materialguia,materialusuario,actividades,recursos,clubes\n" +
  'JUNIOR,ROOKIE,Unidad 1,Lección 1,1,"Saludos y colores",videos/jr-r-l1.mp4,Guía L1|materials/g1.pdf,Libro Rookie|materials/l1.pdf,Colores WordWall|https://wordwall.net/x,Flashcards|https://x/fc,Club sábado|https://x/club\n';

interface Item {
  nombre: string;
  url?: string;
  link?: string;
}
interface Fila {
  curso: string;
  nivel: string;
  unidad: string | null;
  leccion: string;
  orden: number;
  contenido: string | null;
  video: string | null;
  materialGuia: Item[];
  materialUsuario: Item[];
  actividades: Item[];
  recursos: Item[];
  clubes: Item[];
}
interface FilaPreview {
  fila: Fila;
  linea: number; // línea en el CSV (2 = primera de datos)
  error: string | null;
}

/**
 * Detecta el separador de columnas mirando la PRIMERA línea: Excel en español
 * exporta con punto y coma, y el archivo llegaba como una sola columna.
 * Se decide por la cabecera, no por todo el texto, porque el contenido puede
 * llevar comas legítimas.
 */
function detectarSeparador(text: string): "," | ";" {
  const primeraLinea = text.split(String.fromCharCode(10))[0] ?? "";
  const cabecera = primeraLinea.replace(String.fromCharCode(13), "");
  let comas = 0;
  let puntoYComa = 0;
  for (const c of cabecera) {
    if (c === ",") comas += 1;
    else if (c === ";") puntoYComa += 1;
  }
  return puntoYComa > comas ? ";" : ",";
}

/** Parser CSV mínimo con soporte de comillas ("" escapa una comilla). */
function parseCSV(text: string, sep: "," | ";" = ","): string[][] {
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
  if (!cell || !cell.trim()) return [];
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

const input: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};
const th: CSSProperties = {
  padding: "0.4rem 0.5rem",
  textAlign: "left",
  color: "var(--texto-suave)",
  whiteSpace: "nowrap",
};
const td: CSSProperties = { padding: "0.4rem 0.5rem", whiteSpace: "nowrap" };

export default function SubirCursoPage() {
  const [nombreArchivo, setNombreArchivo] = useState<string>("");
  const [preview, setPreview] = useState<FilaPreview[] | null>(null);
  const [errFormato, setErrFormato] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    setResultado(null);
    setErrFormato(null);
    setPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setNombreArchivo(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const texto = String(reader.result ?? "");
      const sep = detectarSeparador(texto);
      const rows = parseCSV(texto, sep);
      if (rows.length < 2) {
        setErrFormato("El archivo no tiene filas de datos.");
        return;
      }
      const header = rows[0]!.map((h) => h.trim().toLowerCase());
      const faltantes = ["curso", "nivel", "unidad", "leccion", "orden"].filter(
        (c) => !header.includes(c),
      );
      if (faltantes.length > 0) {
        setErrFormato(`Faltan columnas obligatorias en la cabecera: ${faltantes.join(", ")}.`);
        return;
      }
      const idx = (col: string) => header.indexOf(col);
      const vistas = new Set<string>();
      const filas: FilaPreview[] = rows.slice(1).map((r, i) => {
        const get = (col: string) => (idx(col) >= 0 ? (r[idx(col)] ?? "").trim() : "");
        const curso = get("curso").toUpperCase();
        // El nivel se muestra como "Ultimate Stage" pero su código es ULTIMATE:
        // se acepta cualquiera de las dos formas para no pelear con el CSV.
        const nivelCrudo = get("nivel").toUpperCase().trim();
        const nivel = nivelCrudo === "ULTIMATE STAGE" ? "ULTIMATE" : nivelCrudo;
        const unidad = get("unidad");
        const leccion = get("leccion");
        const ordenCrudo = get("orden");
        const fila: Fila = {
          curso,
          nivel,
          unidad,
          leccion,
          orden: Number(ordenCrudo),
          contenido: get("contenido") || null,
          video: get("video") || null,
          materialGuia: parseItems(get("materialguia"), "url"),
          materialUsuario: parseItems(get("materialusuario"), "url"),
          actividades: parseItems(get("actividades"), "link"),
          recursos: parseItems(get("recursos"), "link"),
          clubes: parseItems(get("clubes"), "link"),
        };
        let error: string | null = null;
        if (!CURSOS.includes(curso)) error = `Curso inválido: "${curso}"`;
        else if (!NIVELES.includes(nivel)) error = `Nivel inválido: "${nivel}"`;
        else if (unidad === "") error = "Unidad vacía";
        else if (leccion === "") error = "Lección vacía";
        else if (ordenCrudo === "") error = "Orden vacío";
        else if (!Number.isInteger(Number(ordenCrudo))) error = `Orden inválido: "${ordenCrudo}"`;
        else {
          const clave = `${curso}|${nivel}|${unidad}|${leccion.toLowerCase()}`;
          if (vistas.has(clave)) error = "Duplicada en el archivo";
          else vistas.add(clave);
        }
        return { fila, linea: i + 2, error };
      });
      setPreview(filas);
    };
    reader.readAsText(file);
  }

  const validas = preview?.filter((p) => p.error === null) ?? [];
  const conError = preview?.filter((p) => p.error !== null) ?? [];

  async function subir() {
    if (validas.length === 0) return;
    setOcupado(true);
    setResultado(null);
    try {
      const res = await apiFetch("/api/catalog/curso/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas: validas.map((p) => p.fila) }),
      });
      const data: {
        creados?: number;
        actualizados?: number;
        errores?: { fila: number; motivo: string }[];
        error?: { message: string };
      } = await res.json();
      if (!res.ok) {
        setResultado(data.error?.message ?? "No se pudo importar.");
        return;
      }
      const errs = data.errores ?? [];
      setResultado(
        `✔ Creadas ${data.creados ?? 0}, actualizadas ${data.actualizados ?? 0}${
          errs.length > 0 ? `, con ${errs.length} error(es)` : ""
        }.`,
      );
      setPreview(null);
      setNombreArchivo("");
    } catch {
      setResultado("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "70rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.9rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}>Subir curso (CSV)</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Importa la referencia de un curso completo. Al cargar el archivo verás un{" "}
        <strong>previo</strong> para revisar; solo al confirmar se guarda (upsert por curso · nivel
        · unidad · lección).
      </p>

      {/* Formato */}
      <section
        style={{
          marginTop: "1rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.8rem",
          padding: "1rem",
        }}
      >
        <strong style={{ fontSize: "0.95rem" }}>Formato de entrada</strong>
        <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)", margin: "0.4rem 0" }}>
          Cabecera (obligatorias: <code>curso, nivel, unidad, leccion, orden</code>):
        </p>
        <code
          style={{
            display: "block",
            fontSize: "0.78rem",
            background: "#f4f6fb",
            padding: "0.5rem 0.6rem",
            borderRadius: "0.5rem",
            overflowX: "auto",
            whiteSpace: "pre",
          }}
        >
          {COLUMNAS.join(", ")}
        </code>
        <ul style={{ fontSize: "0.82rem", color: "var(--texto-suave)", marginTop: "0.5rem" }}>
          <li>
            <strong>curso</strong>: JUNIOR | YOUNGSTER · <strong>nivel</strong>: ROOKIE | CHAMPION |
            ELITE | LEGENDARY | ULTIMATE.
          </li>
          <li>
            Listas (<strong>materialguia, materialusuario, actividades, recursos, clubes</strong>):
            varios ítems separados por <code>;</code> y cada uno como <code>Nombre|enlace</code>.
            Ej: <code>Guía L1|g1.pdf;Guía L2|g2.pdf</code>.
          </li>
          <li>
            El separador de columnas puede ser <code>,</code> o <code>;</code>: se detecta solo
            (Excel en español exporta con <code>;</code>). Si usas <code>;</code> como separador,
            encierra entre comillas dobles las columnas de listas, porque ahí <code>;</code>
            separa ítems.
          </li>
          <li>
            El nivel se acepta como <code>ULTIMATE</code> o como <code>ULTIMATE STAGE</code>.
          </li>
          <li>
            Si <code>contenido</code> tiene comas, enciérralo en comillas dobles.
          </li>
        </ul>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(PLANTILLA)}`}
          download="plantilla-curso.csv"
          style={{ fontSize: "0.85rem", fontWeight: 600 }}
        >
          ⬇️ Descargar plantilla
        </a>
      </section>

      {/* Cargar */}
      <section
        style={{
          marginTop: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <input type="file" accept=".csv,text/csv" onChange={onArchivo} style={input} />
        {nombreArchivo !== "" && (
          <span style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>{nombreArchivo}</span>
        )}
      </section>

      {errFormato !== null && (
        <p role="alert" style={{ color: "#c62828", marginTop: "0.75rem" }}>
          {errFormato}
        </p>
      )}
      {resultado !== null && (
        <p
          style={{
            color: resultado.startsWith("✔") ? "#1b5e20" : "#c62828",
            marginTop: "0.75rem",
            fontWeight: 600,
          }}
        >
          {resultado}
        </p>
      )}

      {/* Previo */}
      {preview !== null && (
        <section style={{ marginTop: "1.25rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <strong style={{ fontSize: "1rem" }}>
              Previo: {validas.length} válida(s)
              {conError.length > 0 && ` · ${conError.length} con error`}
            </strong>
            <button
              type="button"
              onClick={() => void subir()}
              disabled={ocupado || validas.length === 0}
              style={{
                padding: "0.55rem 1.4rem",
                borderRadius: "0.6rem",
                border: "none",
                background: ocupado || validas.length === 0 ? "#9e9e9e" : "var(--lgs-verde)",
                color: "#1b2a10",
                fontWeight: 800,
                cursor: ocupado || validas.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {ocupado ? "Subiendo…" : `Confirmar y subir ${validas.length}`}
            </button>
          </div>

          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid #e3e7f0" }}>
                  <th style={th}>#</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Curso</th>
                  <th style={th}>Nivel</th>
                  <th style={th}>Unidad</th>
                  <th style={th}>Lección</th>
                  <th style={th}>Orden</th>
                  <th style={th}>Material</th>
                  <th style={th}>Act/Rec</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr
                    key={p.linea}
                    style={{
                      borderBottom: "1px solid #edf0f6",
                      background: p.error ? "#fff5f5" : "white",
                    }}
                  >
                    <td style={td}>{p.linea}</td>
                    <td style={td}>
                      {p.error === null ? (
                        <span style={{ color: "#1b5e20", fontWeight: 700 }}>✔</span>
                      ) : (
                        <span style={{ color: "#c62828", fontWeight: 700 }} title={p.error}>
                          ✘ {p.error}
                        </span>
                      )}
                    </td>
                    <td style={td}>{p.fila.curso}</td>
                    <td style={td}>{p.fila.nivel}</td>
                    <td style={td}>{p.fila.unidad ?? "—"}</td>
                    <td style={{ ...td, whiteSpace: "normal" }}>{p.fila.leccion}</td>
                    <td style={td}>{p.fila.orden}</td>
                    <td style={td}>{p.fila.materialGuia.length + p.fila.materialUsuario.length}</td>
                    <td style={td}>{p.fila.actividades.length + p.fila.recursos.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
