"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { textoNumeroContrato } from "@/ui/numero-contrato";

interface Nino {
  id: string;
  nombres: string;
  apellidos: string;
  docTipo: string;
  docNumero: string;
  countryCode: string;
  fechaNacimiento: string | null;
  estado: "ACTIVA" | "INACTIVA";
  username: string | null;
  correo: string | null;
  contratoNumero: number | null;
  externalRef: string | null;
  tipoCurso: string | null;
  inicio: string | null;
  finalContrato: string | null;
  contratoEstado: string | null;
  campania: string | null;
  curso: string | null;
  /** Salón de su matrícula viva; null si todavía no está matriculado. */
  salon: string | null;
}

interface Salon {
  id: string;
  nombre: string;
  campania: string;
}

const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

function Campo(props: { etiqueta: string; children: React.ReactNode; ancho?: string }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.2rem",
        flex: props.ancho ?? "1 1 10rem",
      }}
    >
      <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{props.etiqueta}</span>
      {props.children}
    </label>
  );
}

/**
 * Lista desplegable del buscador: los niños que coinciden, para elegir uno y
 * abrir su ficha. Los HERMANOS del mismo contrato van juntos bajo su número:
 * buscar por el N° de LGS trae a todos.
 */
function Sugerencias({ ninos }: { ninos: Nino[] }) {
  const MAX = 10;
  const visibles = ninos.slice(0, MAX);
  // Agrupar por contrato (el N° de LGS sin el documento del niño).
  const grupos = new Map<string, Nino[]>();
  for (const n of visibles) {
    const clave =
      n.externalRef !== null
        ? (n.externalRef.split("#")[0] ?? n.externalRef)
        : n.contratoNumero !== null
          ? `N° ${String(n.contratoNumero)}`
          : `sin-${n.id}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), n]);
  }
  return (
    <div
      role="listbox"
      style={{
        position: "absolute",
        top: "calc(100% + 0.25rem)",
        left: 0,
        right: 0,
        zIndex: 20,
        background: "white",
        border: "1px solid #d8dce6",
        borderRadius: "0.6rem",
        boxShadow: "0 10px 30px rgba(20,30,60,0.15)",
        maxHeight: "22rem",
        overflowY: "auto",
        minWidth: "20rem",
      }}
    >
      {visibles.length === 0 ? (
        <div style={{ padding: "0.6rem 0.8rem", color: "var(--texto-suave)", fontSize: "0.85rem" }}>
          Ningún niño coincide.
        </div>
      ) : (
        [...grupos.entries()].map(([clave, hermanos]) => (
          <div key={clave} style={{ borderBottom: "1px solid #eef1f7" }}>
            {hermanos.length > 1 && (
              <div
                style={{
                  padding: "0.35rem 0.8rem 0",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  color: "var(--lgs-purpura)",
                }}
              >
                Contrato {clave} · {hermanos.length} niños
              </div>
            )}
            {hermanos.map((n) => (
              <Link
                key={n.id}
                href={`/panel/personas/${n.id}`}
                role="option"
                style={{
                  display: "block",
                  padding: "0.45rem 0.8rem",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <strong>
                  {n.apellidos}, {n.nombres}
                </strong>
                <span
                  style={{ display: "block", fontSize: "0.76rem", color: "var(--texto-suave)" }}
                >
                  {n.docTipo} {n.docNumero}
                  {(n.externalRef !== null || n.contratoNumero !== null) &&
                    ` · ${textoNumeroContrato({ externalRef: n.externalRef, numero: n.contratoNumero })}`}
                  {n.salon !== null && ` · ${n.salon}`}
                </span>
              </Link>
            ))}
          </div>
        ))
      )}
      {ninos.length > MAX && (
        <div
          style={{ padding: "0.45rem 0.8rem", fontSize: "0.76rem", color: "var(--texto-suave)" }}
        >
          y {ninos.length - MAX} más en la lista de abajo…
        </div>
      )}
    </div>
  );
}

export default function PersonasPage() {
  const [ninos, setNinos] = useState<Nino[] | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [campanias, setCampanias] = useState<{ id: string; nombre: string }[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);
  // Buscador: nombre, documento o N° de contrato (el buscador global puede
  // llegar con ?buscar=). `texto` es lo escrito; `fBuscar` lo que se consulta,
  // un momento después de dejar de escribir.
  const [texto, setTexto] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("buscar") ?? "")
      : "",
  );
  const [fBuscar, setFBuscar] = useState(texto);
  const [sugerir, setSugerir] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFBuscar(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);
  const [fCampaniaId, setFCampaniaId] = useState("");
  const [fCurso, setFCurso] = useState("");
  const [fSalonId, setFSalonId] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fInicioDesde, setFInicioDesde] = useState("");
  const [fFinalHasta, setFFinalHasta] = useState("");

  const cargar = useCallback(async () => {
    const p = new URLSearchParams();
    if (fBuscar) p.set("buscar", fBuscar);
    if (fCampaniaId) p.set("campaignId", fCampaniaId);
    if (fCurso) p.set("tipoCurso", fCurso);
    if (fSalonId) p.set("classroomId", fSalonId);
    if (fEstado) p.set("estado", fEstado);
    if (fInicioDesde) p.set("inicioDesde", fInicioDesde);
    if (fFinalHasta) p.set("finalHasta", fFinalHasta);
    const res = await apiFetch(`/api/people/ninos?${p.toString()}`);
    if (res.ok) {
      const data: { ninos: Nino[] } = await res.json();
      setNinos(data.ninos);
    }
  }, [fBuscar, fCampaniaId, fCurso, fSalonId, fEstado, fInicioDesde, fFinalHasta]);

  useEffect(() => {
    async function run() {
      await cargar();
    }
    void run();
  }, [cargar]);

  useEffect(() => {
    async function cargarFiltros() {
      const [rc, rs] = await Promise.all([
        apiFetch("/api/catalog/campaigns"),
        // Quien solo tiene `personas.ver` no ve salones: el selector queda
        // vacío y deshabilitado en vez de romper la pantalla.
        apiFetch("/api/scheduling/classrooms"),
      ]);
      if (rc.ok) {
        const data: { campanias: { id: string; nombre: string }[] } = await rc.json();
        setCampanias(data.campanias);
      }
      if (rs.ok) {
        const data: { salones: Salon[] } = await rs.json();
        setSalones(data.salones);
      }
    }
    void cargarFiltros();
  }, []);

  // Con una campaña elegida, el selector de salón muestra solo los suyos.
  const campaniaNombre = campanias.find((c) => c.id === fCampaniaId)?.nombre;
  const salonesVisibles =
    campaniaNombre === undefined ? salones : salones.filter((s) => s.campania === campaniaNombre);

  /** Exporta a CSV los niños actualmente listados (respeta los filtros). */
  function descargarCSV() {
    if (ninos === null || ninos.length === 0) return;
    setDescargando(true);
    try {
      const headers = [
        "Nombre",
        "Documento",
        "Correo",
        "Usuario",
        "Campana",
        "Curso",
        "Salon",
        "Estado",
        "Contrato",
        "N LGS",
        "Inicio",
        "Final",
      ];
      const esc = (v: unknown): string => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const filas = ninos.map((n) =>
        [
          `${n.apellidos}, ${n.nombres}`,
          `${n.docTipo} ${n.docNumero}`,
          n.correo ?? "",
          n.username ?? "",
          n.campania ?? "",
          n.curso ?? "",
          n.salon ?? "",
          n.estado,
          n.contratoNumero ?? "",
          n.externalRef ?? "",
          n.inicio ?? "",
          n.finalContrato ?? "",
        ]
          .map(esc)
          .join(","),
      );
      const csv = [headers.join(","), ...filas].join("\r\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kids-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.6rem" }}>Kids</h1>
        <button
          onClick={descargarCSV}
          disabled={descargando || ninos === null || ninos.length === 0}
          title={
            ninos !== null && ninos.length > 0
              ? "Descarga los niños listados (con los filtros aplicados)"
              : "No hay niños para exportar"
          }
          style={{
            padding: "0.55rem 1.2rem",
            borderRadius: "0.6rem",
            border: "none",
            background:
              descargando || ninos === null || ninos.length === 0 ? "#9e9e9e" : "var(--lgs-verde)",
            color: "#1b2a10",
            fontWeight: 700,
            cursor: descargando ? "wait" : "pointer",
          }}
        >
          {descargando ? "Generando…" : "⬇ Descargar CSV"}
        </button>
      </div>

      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.9rem 1rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          display: "flex",
          gap: "0.7rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <Campo etiqueta="Buscar" ancho="2 1 16rem">
          <div style={{ position: "relative" }}>
            <input
              placeholder="Nombre, documento o N° de contrato…"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setSugerir(true);
              }}
              onFocus={() => setSugerir(true)}
              // Se cierra un instante después para que el clic en una sugerencia llegue.
              onBlur={() => setTimeout(() => setSugerir(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSugerir(false);
              }}
              style={{ ...inputStyle, width: "100%" }}
              aria-autocomplete="list"
            />
            {sugerir && texto.trim().length >= 2 && fBuscar === texto.trim() && ninos !== null && (
              <Sugerencias ninos={ninos} />
            )}
          </div>
        </Campo>
        <Campo etiqueta="Campaña" ancho="1 1 12rem">
          <select
            value={fCampaniaId}
            onChange={(e) => setFCampaniaId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Todas</option>
            {campanias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Curso" ancho="0 0 10rem">
          <select value={fCurso} onChange={(e) => setFCurso(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            <option value="JUNIOR">Junior (6–9)</option>
            <option value="YOUNGSTER">Youngster (10–13)</option>
          </select>
        </Campo>
        <Campo etiqueta="Salón" ancho="1 1 13rem">
          <select
            value={fSalonId}
            onChange={(e) => setFSalonId(e.target.value)}
            style={inputStyle}
            disabled={salones.length === 0}
          >
            <option value="">{salones.length === 0 ? "Sin salones" : "Todos"}</option>
            {/* Filtra por la matrícula VIVA del niño; el salón lleva su campaña
                delante porque el mismo "Salón 01" existe en todas. */}
            {salonesVisibles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.campania} · {s.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Estado" ancho="0 0 8rem">
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            <option value="ACTIVA">Activa</option>
            <option value="INACTIVA">Inactiva</option>
          </select>
        </Campo>
        <Campo etiqueta="Inicio desde" ancho="0 0 9rem">
          <input
            type="date"
            value={fInicioDesde}
            onChange={(e) => setFInicioDesde(e.target.value)}
            style={inputStyle}
          />
        </Campo>
        <Campo etiqueta="Final hasta" ancho="0 0 9rem">
          <input
            type="date"
            value={fFinalHasta}
            onChange={(e) => setFFinalHasta(e.target.value)}
            style={inputStyle}
          />
        </Campo>
        {(texto || fCampaniaId || fCurso || fSalonId || fEstado || fInicioDesde || fFinalHasta) && (
          <button
            onClick={() => {
              setTexto("");
              setFBuscar("");
              setFCampaniaId("");
              setFCurso("");
              setFSalonId("");
              setFEstado("");
              setFInicioDesde("");
              setFFinalHasta("");
            }}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #e3e7f0",
              background: "white",
              cursor: "pointer",
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      <section
        style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        {ninos === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : ninos.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>No hay niños que coincidan con los filtros.</p>
        ) : (
          ninos.map((n) => (
            <div
              key={n.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.8rem 1rem",
                border: "1px solid #e3e7f0",
                borderRadius: "0.7rem",
                flexWrap: "wrap",
                opacity: n.estado === "INACTIVA" ? 0.6 : 1,
              }}
            >
              <div style={{ minWidth: "18rem" }}>
                <Link
                  href={`/panel/personas/${n.id}`}
                  style={{ fontSize: "1rem", fontWeight: 700, color: "var(--lgs-azul-oscuro)" }}
                >
                  {n.apellidos}, {n.nombres}
                </Link>{" "}
                <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  {n.docTipo} {n.docNumero} · {n.countryCode}
                  {n.fechaNacimiento !== null && ` · nac. ${n.fechaNacimiento}`}
                </span>
                <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  📧 {n.correo ?? "— sin correo —"}
                  {" · "}👤 {n.username ?? "— sin usuario —"}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  📣 {n.campania ?? "— sin campaña —"}
                  {" · "}
                  <strong>
                    {n.curso === "JUNIOR"
                      ? "Junior (6–9)"
                      : n.curso === "YOUNGSTER"
                        ? "Youngster (10–13)"
                        : "— sin curso —"}
                  </strong>
                  {(n.externalRef !== null || n.contratoNumero !== null) &&
                    ` · contrato ${textoNumeroContrato({ externalRef: n.externalRef, numero: n.contratoNumero })}`}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  🏫 {n.salon ?? "— sin salón —"}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                {n.username !== null && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      background: "#e3f2fd",
                      color: "#0d47a1",
                      padding: "0.2rem 0.55rem",
                      borderRadius: "1rem",
                      fontWeight: 700,
                    }}
                  >
                    con login
                  </span>
                )}
                <span
                  style={{
                    fontSize: "0.75rem",
                    background: n.estado === "ACTIVA" ? "#e8f5e9" : "#eceff1",
                    color: n.estado === "ACTIVA" ? "#1b5e20" : "#5a6172",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "1rem",
                    fontWeight: 700,
                  }}
                >
                  {n.estado}
                </span>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
