"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { descargarCsv } from "@/ui/csv";
import { numeroContrato } from "@/ui/numero-contrato";
import {
  FiltrosServicio,
  botonServicio,
  campoServicio,
  celdaServicio,
  qsFiltros,
  rotuloServicio,
  type FiltrosBase,
} from "../FiltrosServicio";
import { colorEstado, etiqueta, useVocabularioCasos } from "./casos-ui";
import { GestionarCasoModal, type CasoParaGestionar } from "./GestionarCasoModal";
import { ReportarCasoModal } from "./ReportarCasoModal";

/**
 * Servicio › Casos de atención: la bandeja, como la de MOSAICO.
 *  - Sin asignar: lo que reportan los guías (y lo que abre Servicio), del más
 *    antiguo al más nuevo. "Asignar" lo manda a un área o lo cierra.
 *  - Una pestaña por área con lo que tiene abierto; "Gestionar" abre el caso.
 *  - Histórico: lo cerrado, con su conclusión.
 * Fechas opcionales (sin ellas, todo lo abierto); CSV de lo que está a la vista.
 */

type Vista = "SIN_ASIGNAR" | "ACADEMICO" | "COORDINACION" | "FINANZAS" | "HISTORICO";

interface Fila {
  id: string;
  codigo: string;
  tema: string;
  estado: string;
  area: string | null;
  origen: "GUIA" | "SERVICIO";
  numeroCaso: number;
  abiertoEn: string;
  cerradoEn: string | null;
  noContinua: boolean;
  childPersonId: string;
  nombre: string;
  documento: string;
  username: string | null;
  pais: string;
  campania: string | null;
  curso: string | null;
  salon: string | null;
  guia: string | null;
  apoderado: string | null;
  telefono: string | null;
  externalRef: string | null;
  contratoNumero: number | null;
  reportes: number;
  sinLeer: number;
  ultimoMovimiento: string | null;
}

const VISTAS: { valor: Vista; texto: string }[] = [
  { valor: "SIN_ASIGNAR", texto: "Sin asignar" },
  { valor: "ACADEMICO", texto: "Servicio Académico" },
  { valor: "COORDINACION", texto: "Coordinación" },
  { valor: "FINANZAS", texto: "Finanzas (LGS)" },
  { valor: "HISTORICO", texto: "Histórico" },
];

const fechaCorta = (iso: string | null) =>
  iso === null
    ? ""
    : new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "2-digit" });

const pastilla = (c: { color: string; fondo: string }): CSSProperties => ({
  display: "inline-block",
  padding: "0.1rem 0.5rem",
  borderRadius: "999px",
  fontWeight: 700,
  fontSize: "0.76rem",
  color: c.color,
  background: c.fondo,
  whiteSpace: "nowrap",
});

export default function CasosAtencionPage() {
  const voc = useVocabularioCasos();
  const [vista, setVista] = useState<Vista>("SIN_ASIGNAR");
  const [filtros, setFiltros] = useState<FiltrosBase>({
    buscar: "",
    campaignId: "",
    curso: "",
    classroomId: "",
    desde: "",
    hasta: "",
  });
  const [tema, setTema] = useState("");
  const [origen, setOrigen] = useState("");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [conteos, setConteos] = useState<Record<Vista, number> | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [asignando, setAsignando] = useState<CasoParaGestionar | null>(null);
  const [quien, setQuien] = useState("");
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    async function yo() {
      const res = await apiFetch("/api/auth/me");
      if (res.ok) {
        const me = (await res.json()) as {
          user: { nombre?: string | null; username: string } | null;
        };
        setQuien(me.user?.nombre ?? me.user?.username ?? "");
      }
    }
    void yo();
  }, []);

  const cargar = useCallback(async () => {
    setError(null);
    const res = await apiFetch(`/api/casos?${qsFiltros(filtros, { vista, zona, tema, origen })}`);
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar la bandeja.");
      setFilas([]);
      return;
    }
    const d = (await res.json()) as {
      casos: Fila[];
      conteos: Record<Vista, number>;
      puedeGestionar: boolean;
    };
    setFilas(d.casos);
    setConteos(d.conteos);
    setPuedeGestionar(d.puedeGestionar);
  }, [filtros, vista, zona, tema, origen]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  function exportar() {
    if (filas === null) return;
    descargarCsv(
      `casos-${vista.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`,
      [
        "codigo",
        "nino",
        "documento",
        "usuario",
        "pais",
        "contrato",
        "campania",
        "curso",
        "salon",
        "guia",
        "tipo",
        "origen",
        "estado",
        "area",
        "abierto",
        "cerrado",
        "reportes",
        "no_continua",
        vista === "HISTORICO" ? "conclusion" : "ultimo_movimiento",
        "apoderado",
        "telefono",
      ],
      filas.map((f) => [
        f.codigo,
        f.nombre,
        f.documento,
        f.username,
        f.pais,
        numeroContrato({ externalRef: f.externalRef, numero: f.contratoNumero }).numero,
        f.campania,
        f.curso,
        f.salon,
        f.guia,
        etiqueta(voc.temas, f.tema),
        f.origen === "GUIA" ? "Guía" : "Servicio",
        etiqueta(voc.estados, f.estado),
        etiqueta(voc.areas, f.area),
        f.abiertoEn.slice(0, 10),
        f.cerradoEn?.slice(0, 10) ?? "",
        f.reportes,
        f.noContinua,
        f.ultimoMovimiento,
        f.apoderado,
        f.telefono,
      ]),
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "90rem", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 30rem" }}>
          <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Casos de atención</h1>
          <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
            Lo que reportan los guías con “Requiere atención”. Servicio lo asigna a un área, el área
            contacta a la familia, acuerda y cierra el caso con su conclusión.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {puedeGestionar && (
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              style={{ ...botonServicio, border: "none", background: "#c62828", color: "white" }}
            >
              + Adicionar caso
            </button>
          )}
          <button
            type="button"
            onClick={exportar}
            disabled={filas === null || filas.length === 0}
            style={botonServicio}
          >
            ⬇ Descargar CSV
          </button>
        </div>
      </div>

      <div
        role="tablist"
        style={{ display: "flex", gap: "0.3rem", marginTop: "1rem", flexWrap: "wrap" }}
      >
        {VISTAS.map((v) => (
          <button
            key={v.valor}
            type="button"
            role="tab"
            aria-selected={vista === v.valor}
            onClick={() => setVista(v.valor)}
            style={{
              ...botonServicio,
              padding: "0.45rem 0.9rem",
              background: vista === v.valor ? "var(--lgs-azul)" : "white",
              color: vista === v.valor ? "white" : "inherit",
              borderColor: vista === v.valor ? "var(--lgs-azul)" : "#e3e7f0",
            }}
          >
            {v.texto}
            {conteos !== null && ` (${String(conteos[v.valor])})`}
          </button>
        ))}
      </div>

      <FiltrosServicio filtros={filtros} onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}>
        <label>
          <span style={rotuloServicio}>Tipo</span>
          <select value={tema} onChange={(e) => setTema(e.target.value)} style={campoServicio}>
            <option value="">Todos</option>
            {voc.temas.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={rotuloServicio}>Origen</span>
          <select value={origen} onChange={(e) => setOrigen(e.target.value)} style={campoServicio}>
            <option value="">Guías y Servicio</option>
            <option value="GUIA">Reportados por guías</option>
            <option value="SERVICIO">Abiertos por Servicio</option>
          </select>
        </label>
      </FiltrosServicio>
      <p style={{ fontSize: "0.78rem", color: "var(--texto-suave)", margin: "-0.5rem 0 0.8rem" }}>
        Las fechas filtran por {vista === "HISTORICO" ? "cierre" : "apertura"}; vacías, se ve todo.
      </p>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {aviso !== null && <p style={{ color: "#1b5e20", fontWeight: 600 }}>{aviso}</p>}

      {filas === null ? (
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      ) : filas.length === 0 ? (
        <p style={{ color: "var(--texto-suave)" }}>
          No hay casos en esta bandeja con estos filtros.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f7fb" }}>
                <th style={celdaServicio}>Caso</th>
                <th style={celdaServicio}>Niño</th>
                <th style={celdaServicio}>Programa</th>
                <th style={celdaServicio}>{vista === "HISTORICO" ? "Cerrado" : "Abierto"}</th>
                <th style={celdaServicio}>Estado</th>
                <th style={celdaServicio}>
                  {vista === "HISTORICO" ? "Conclusión" : "Último movimiento"}
                </th>
                <th style={celdaServicio} />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                    <Link
                      href={`/panel/servicio/casos-atencion/${f.id}`}
                      target="_blank"
                      style={{ fontWeight: 800 }}
                    >
                      {f.codigo}
                    </Link>
                    {f.sinLeer > 0 && (
                      <span
                        title={`${String(f.sinLeer)} reporte(s) sin leer`}
                        style={{ color: "#c62828" }}
                      >
                        {" "}
                        ●
                      </span>
                    )}
                    <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                      {etiqueta(voc.temas, f.tema)} · {f.reportes} reporte
                      {f.reportes === 1 ? "" : "s"}
                      {f.origen === "SERVICIO" ? " · Servicio" : ""}
                    </div>
                  </td>
                  <td style={celdaServicio}>
                    <Link
                      href={`/panel/personas/${f.childPersonId}`}
                      target="_blank"
                      style={{ fontWeight: 700 }}
                    >
                      {f.nombre}
                    </Link>
                    <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                      {f.documento} ·{" "}
                      {
                        numeroContrato({ externalRef: f.externalRef, numero: f.contratoNumero })
                          .numero
                      }{" "}
                      · {f.pais}
                    </div>
                  </td>
                  <td style={celdaServicio}>
                    {f.campania ?? "Sin matrícula"}
                    <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                      {[f.salon, f.guia].filter((x) => x !== null).join(" · ")}
                    </div>
                  </td>
                  <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                    {fechaCorta(vista === "HISTORICO" ? f.cerradoEn : f.abiertoEn)}
                  </td>
                  <td style={celdaServicio}>
                    <span style={pastilla(colorEstado(voc, f.estado))}>
                      {etiqueta(voc.estados, f.estado)}
                    </span>
                    {f.noContinua && (
                      <div>
                        <span style={pastilla({ color: "#b71c1c", fondo: "#ffebee" })}>
                          No continúa
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={{ ...celdaServicio, maxWidth: "22rem" }}>
                    {f.ultimoMovimiento ?? "—"}
                  </td>
                  <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                    {vista === "SIN_ASIGNAR" && puedeGestionar ? (
                      <button
                        type="button"
                        style={{ ...botonServicio, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                        onClick={() => {
                          setAviso(null);
                          setAsignando({
                            id: f.id,
                            codigo: f.codigo,
                            nombre: f.nombre,
                            area: f.area,
                          });
                        }}
                      >
                        Asignar
                      </button>
                    ) : (
                      <Link
                        href={`/panel/servicio/casos-atencion/${f.id}`}
                        target="_blank"
                        style={{ fontWeight: 700, fontSize: "0.82rem" }}
                      >
                        {vista === "HISTORICO" ? "Ver" : "Gestionar"} →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adicionando && (
        <ReportarCasoModal
          onCerrar={() => setAdicionando(false)}
          onReportado={(texto) => {
            setAdicionando(false);
            setAviso(texto);
            void cargar();
          }}
        />
      )}
      {asignando !== null && (
        <GestionarCasoModal
          caso={asignando}
          modo="asignar"
          quienCierra={quien}
          onCerrar={() => setAsignando(null)}
          onHecho={(texto) => {
            setAsignando(null);
            setAviso(texto);
            void cargar();
          }}
        />
      )}
    </main>
  );
}
