"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Contratos: LISTA para buscar, ficha para trabajar.
 *
 * La pantalla era una tarjeta por contrato con todos sus datos y sus botones;
 * con una campaña real eso es una columna de párrafos por la que no se puede
 * pasar el ojo. Aquí quedan las cinco columnas con las que se busca —campaña,
 * N°, titular, documento y fecha— y todo lo demás vive en la ficha, a un clic.
 */

interface Contrato {
  id: string;
  numero: number;
  beneficiario: string;
  beneficiarioDocTipo: string;
  beneficiarioDocNumero: string;
  beneficiarioFechaNac: string | null;
  titular: string;
  titularDocTipo: string;
  titularDocNumero: string;
  titularTelefono: string | null;
  titularEmail: string | null;
  apoderados: {
    nombre: string;
    docTipo: string;
    docNumero: string;
    telefono: string | null;
    parentesco: string | null;
  }[];
  username: string | null;
  countryCode: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  inicio: string;
  finalContrato: string;
  estado: "PENDIENTE" | "APROBADO" | "ONHOLD" | "INACTIVO";
  externalRef: string | null;
  salon: string | null;
  campania: string | null;
  enrollmentId: string | null;
}

interface SalonOpcion {
  id: string;
  nombre: string;
  campania: string;
}

const ESTADO_UI: Record<Contrato["estado"], { texto: string; color: string; fondo: string }> = {
  PENDIENTE: { texto: "Pendiente", color: "#8a6d00", fondo: "#fff8e1" },
  APROBADO: { texto: "Aprobado", color: "#1b5e20", fondo: "#e8f5e9" },
  ONHOLD: { texto: "En pausa", color: "#0d47a1", fondo: "#e3f2fd" },
  INACTIVO: { texto: "Inactivo", color: "#5a6172", fondo: "#eceff1" },
};

const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

const botonAccion: CSSProperties = {
  padding: "0.35rem 0.8rem",
  borderRadius: "0.5rem",
  border: "1px solid #e3e7f0",
  background: "white",
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "0.55rem 0.7rem",
  fontSize: "0.76rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "var(--texto-suave)",
  borderBottom: "1px solid #e3e7f0",
  whiteSpace: "nowrap",
};

const td: CSSProperties = {
  padding: "0.6rem 0.7rem",
  fontSize: "0.88rem",
  borderBottom: "1px solid #edf0f6",
  verticalAlign: "middle",
};

export default function ContratosPage() {
  const router = useRouter();
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [salones, setSalones] = useState<SalonOpcion[]>([]);
  const [campanias, setCampanias] = useState<{ id: string; nombre: string }[]>([]);
  // Filtros
  const [fEstado, setFEstado] = useState("");
  const [fPais, setFPais] = useState("");
  const [fTipoCurso, setFTipoCurso] = useState("");
  const [fCampaniaId, setFCampaniaId] = useState("");
  const [fSalonId, setFSalonId] = useState("");
  const [fInicioDesde, setFInicioDesde] = useState("");
  const [fFinalHasta, setFFinalHasta] = useState("");

  const cargarContratos = useCallback(async () => {
    const p = new URLSearchParams();
    if (fEstado) p.set("estado", fEstado);
    if (fPais) p.set("pais", fPais);
    if (fTipoCurso) p.set("tipoCurso", fTipoCurso);
    if (fCampaniaId) p.set("campaignId", fCampaniaId);
    if (fSalonId) p.set("classroomId", fSalonId);
    if (fInicioDesde) p.set("inicioDesde", fInicioDesde);
    if (fFinalHasta) p.set("finalHasta", fFinalHasta);
    p.set("limit", "200");
    const res = await apiFetch(`/api/contracts?${p.toString()}`);
    if (res.ok) {
      const data: { contratos: Contrato[] } = await res.json();
      setContratos(data.contratos);
    }
  }, [fEstado, fPais, fTipoCurso, fCampaniaId, fSalonId, fInicioDesde, fFinalHasta]);

  useEffect(() => {
    async function run() {
      await cargarContratos();
    }
    void run();
  }, [cargarContratos]);

  useEffect(() => {
    async function estaticos() {
      const [resS, resCa] = await Promise.all([
        apiFetch("/api/scheduling/classrooms"),
        apiFetch("/api/catalog/campaigns"),
      ]);
      if (resS.ok) {
        const data: { salones: SalonOpcion[] } = await resS.json();
        setSalones(data.salones);
      }
      if (resCa.ok) {
        const data: { campanias: { id: string; nombre: string }[] } = await resCa.json();
        setCampanias(data.campanias);
      }
    }
    void estaticos();
  }, []);

  // Con una campaña elegida, el selector de salón muestra solo los suyos.
  const campaniaNombre = campanias.find((c) => c.id === fCampaniaId)?.nombre;
  const salonesVisibles =
    campaniaNombre === undefined ? salones : salones.filter((s) => s.campania === campaniaNombre);

  /** Genera un CSV con los contratos actualmente listados (respeta los filtros). */
  function descargarCSV() {
    if (contratos === null || contratos.length === 0) return;
    setDescargando(true);
    try {
      const headers = [
        "N",
        "N LGS",
        "Estado",
        "Pais",
        "Curso",
        "Inicio",
        "Final",
        "Beneficiario",
        "Doc beneficiario",
        "Nacimiento",
        "Usuario",
        "Titular",
        "Doc titular",
        "Tel titular",
        "Email titular",
        "Apoderados",
        "Salon",
        "Campana",
      ];
      const esc = (v: unknown): string => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const filas = contratos.map((c) =>
        [
          c.numero,
          c.externalRef ?? "",
          c.estado,
          c.countryCode,
          c.tipoCurso,
          c.inicio,
          c.finalContrato,
          c.beneficiario,
          `${c.beneficiarioDocTipo} ${c.beneficiarioDocNumero}`,
          c.beneficiarioFechaNac ?? "",
          c.username ?? "",
          c.titular,
          `${c.titularDocTipo} ${c.titularDocNumero}`,
          c.titularTelefono ?? "",
          c.titularEmail ?? "",
          c.apoderados
            .map(
              (a) =>
                `${a.nombre}${a.parentesco !== null ? ` (${a.parentesco})` : ""} ${a.docTipo} ${a.docNumero}`,
            )
            .join(" | "),
          c.salon ?? "",
          c.campania ?? "",
        ]
          .map(esc)
          .join(","),
      );
      const csv = [headers.join(","), ...filas].join("\r\n");
      // BOM para que Excel respete los acentos.
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const hoy = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `contratos-${hoy}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "72rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "1.6rem" }}>Contratos</h1>
        <button
          onClick={descargarCSV}
          disabled={descargando || contratos === null || contratos.length === 0}
          title={
            contratos !== null && contratos.length > 0
              ? "Descarga los contratos listados (con los filtros aplicados)"
              : "No hay contratos para exportar"
          }
          style={{
            padding: "0.55rem 1.2rem",
            borderRadius: "0.6rem",
            border: "none",
            background:
              descargando || contratos === null || contratos.length === 0
                ? "#9e9e9e"
                : "var(--lgs-verde)",
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
          marginTop: "1rem",
          padding: "0.9rem 1rem",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          display: "flex",
          gap: "0.7rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Contrato (estado)</span>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="APROBADO">Aprobado</option>
            <option value="ONHOLD">En pausa</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Plataforma</span>
          <select value={fPais} onChange={(e) => setFPais(e.target.value)} style={inputStyle}>
            <option value="">Todas</option>
            {["CL", "CO", "EC", "PE"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label
          style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 11rem" }}
        >
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Campaña</span>
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
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Curso</span>
          <select
            value={fTipoCurso}
            onChange={(e) => setFTipoCurso(e.target.value)}
            style={inputStyle}
          >
            <option value="">Todos</option>
            <option value="JUNIOR">Junior (6–9)</option>
            <option value="YOUNGSTER">Youngster (10–13)</option>
          </select>
        </label>
        <label
          style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 12rem" }}
        >
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Salón</span>
          {/* Por el salón de la matrícula viva; lleva su campaña delante porque
              el mismo "Salón 01" existe en todas. */}
          <select
            value={fSalonId}
            onChange={(e) => setFSalonId(e.target.value)}
            style={inputStyle}
            disabled={salones.length === 0}
          >
            <option value="">{salones.length === 0 ? "Sin salones" : "Todos"}</option>
            {salonesVisibles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.campania} · {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Inicio desde</span>
          <input
            type="date"
            value={fInicioDesde}
            onChange={(e) => setFInicioDesde(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Final hasta</span>
          <input
            type="date"
            value={fFinalHasta}
            onChange={(e) => setFFinalHasta(e.target.value)}
            style={inputStyle}
          />
        </label>
        {(fEstado ||
          fPais ||
          fTipoCurso ||
          fCampaniaId ||
          fSalonId ||
          fInicioDesde ||
          fFinalHasta) && (
          <button
            onClick={() => {
              setFEstado("");
              setFPais("");
              setFTipoCurso("");
              setFCampaniaId("");
              setFSalonId("");
              setFInicioDesde("");
              setFFinalHasta("");
            }}
            style={botonAccion}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <section style={{ marginTop: "1.25rem" }}>
        {contratos === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : contratos.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>
            Sin contratos con esos filtros. Los contratos nuevos se crean en Reservas (LGS) o desde
            la sección Kids.
          </p>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e3e7f0", borderRadius: "0.8rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
              <thead>
                <tr>
                  <th style={th}>Campaña</th>
                  <th style={th}>N° contrato</th>
                  <th style={th}>Titular</th>
                  <th style={th}>ID</th>
                  <th style={th}>Fecha</th>
                  <th style={th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {contratos.map((c) => {
                  const estado = ESTADO_UI[c.estado];
                  const abrir = () => router.push(`/panel/contratos/${c.id}`);
                  return (
                    <tr
                      key={c.id}
                      onClick={abrir}
                      // Clic en la fila y Enter con el teclado: la fila ES el enlace.
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") abrir();
                      }}
                      style={{ cursor: "pointer" }}
                      title="Ver la ficha del contrato"
                    >
                      <td style={{ ...td, fontWeight: 700, color: "var(--lgs-azul-oscuro)" }}>
                        {c.campania ?? "— sin campaña —"}
                      </td>
                      <td style={td}>
                        <strong>N° {c.numero}</strong>
                        {c.externalRef !== null && (
                          <span
                            style={{
                              marginLeft: "0.4rem",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              color: "#0d47a1",
                              background: "#e3f2fd",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "0.5rem",
                              whiteSpace: "nowrap",
                            }}
                          >
                            LGS {c.externalRef}
                          </span>
                        )}
                      </td>
                      <td style={td}>{c.titular}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {c.titularDocTipo} {c.titularDocNumero}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{c.inicio}</td>
                      <td style={td}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "0.2rem 0.55rem",
                            borderRadius: "1rem",
                            color: estado.color,
                            background: estado.fondo,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {estado.texto}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
