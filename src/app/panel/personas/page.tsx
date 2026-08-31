"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

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

export default function PersonasPage() {
  const [ninos, setNinos] = useState<Nino[] | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [campanias, setCampanias] = useState<{ id: string; nombre: string }[]>([]);
  // Filtros (el buscador global puede llegar con ?buscar=<documento>).
  const [fId, setFId] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("buscar") ?? "")
      : "",
  );
  const [fCampaniaId, setFCampaniaId] = useState("");
  const [fCurso, setFCurso] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fInicioDesde, setFInicioDesde] = useState("");
  const [fFinalHasta, setFFinalHasta] = useState("");

  const cargar = useCallback(async () => {
    const p = new URLSearchParams();
    if (fId) p.set("id", fId);
    if (fCampaniaId) p.set("campaignId", fCampaniaId);
    if (fCurso) p.set("tipoCurso", fCurso);
    if (fEstado) p.set("estado", fEstado);
    if (fInicioDesde) p.set("inicioDesde", fInicioDesde);
    if (fFinalHasta) p.set("finalHasta", fFinalHasta);
    const res = await apiFetch(`/api/people/ninos?${p.toString()}`);
    if (res.ok) {
      const data: { ninos: Nino[] } = await res.json();
      setNinos(data.ninos);
    }
  }, [fId, fCampaniaId, fCurso, fEstado, fInicioDesde, fFinalHasta]);

  useEffect(() => {
    async function run() {
      await cargar();
    }
    void run();
  }, [cargar]);

  useEffect(() => {
    async function cargarCampanias() {
      const res = await apiFetch("/api/catalog/campaigns");
      if (res.ok) {
        const data: { campanias: { id: string; nombre: string }[] } = await res.json();
        setCampanias(data.campanias);
      }
    }
    void cargarCampanias();
  }, []);

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
        <Campo etiqueta="Documento (id)" ancho="1 1 12rem">
          <input
            placeholder="Buscar por documento…"
            value={fId}
            onChange={(e) => setFId(e.target.value)}
            style={inputStyle}
          />
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
        {(fId || fCampaniaId || fCurso || fEstado || fInicioDesde || fFinalHasta) && (
          <button
            onClick={() => {
              setFId("");
              setFCampaniaId("");
              setFCurso("");
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
                  {n.contratoNumero !== null && ` · contrato N° ${n.contratoNumero}`}
                  {n.externalRef !== null && ` · LGS ${n.externalRef}`}
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
