"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import {
  FiltrosServicio,
  campoServicio,
  rotuloServicio,
  type FiltrosBase,
} from "../FiltrosServicio";
import { etiqueta, useVocabularioCasos } from "./casos-ui";

/**
 * REPORTAR UN CASO DE ATENCIÓN, como el ReportarCasoModal de MOSAICO.
 *  - Desde la SESIÓN ("Requiere atención"): el niño ya viene elegido y el
 *    reporte va a nombre del guía de la sesión.
 *  - Desde la BANDEJA ("Adicionar caso"): se elige campaña → curso → salón →
 *    niño, y opcionalmente a nombre de qué guía.
 * Si el niño ya tiene casos abiertos, se elige si SUMAR el reporte a uno de
 * ellos o abrir uno nuevo (el servidor no deja reportar sin elegir).
 */

interface CasoAbierto {
  id: string;
  codigo: string;
  tema: string;
  estado: string;
  abiertoEn: string;
  reportes: number;
  ultimaAccion: string | null;
}

interface NinoOpcion {
  id: string;
  nombres: string;
  apellidos: string;
  docNumero: string;
}

interface GuiaOpcion {
  id: string;
  nombre: string | null;
  username: string;
}

const boton: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
};

export function ReportarCasoModal({
  nino,
  sessionId,
  sesionLabel,
  onCerrar,
  onReportado,
}: {
  /** El niño, cuando viene de la sesión. Sin él, se elige con la cascada. */
  nino?: { id: string; nombre: string };
  /** La sesión desde la que reporta el guía. */
  sessionId?: string;
  sesionLabel?: string;
  onCerrar: () => void;
  onReportado: (aviso: string) => void;
}) {
  const conCascada = nino === undefined;
  const voc = useVocabularioCasos();
  // "Abierto hace N días" se mide contra el momento en que se abrió el modal.
  const [ahora] = useState(() => Date.now());
  const [filtros, setFiltros] = useState<FiltrosBase>({
    buscar: "",
    campaignId: "",
    curso: "",
    classroomId: "",
    desde: "",
    hasta: "",
  });
  const [ninos, setNinos] = useState<NinoOpcion[]>([]);
  const [childId, setChildId] = useState(nino?.id ?? "");
  const [guias, setGuias] = useState<GuiaOpcion[]>([]);
  const [guiaUserId, setGuiaUserId] = useState("");
  const [texto, setTexto] = useState("");
  const [tema, setTema] = useState("ASISTENCIA");
  const [abiertos, setAbiertos] = useState<CasoAbierto[]>([]);
  const [destino, setDestino] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Los casos abiertos del niño elegido: a cuál se suma el reporte.
  const cargarAbiertos = useCallback(async () => {
    if (childId === "") {
      setAbiertos([]);
      return;
    }
    const url =
      sessionId !== undefined
        ? `/api/casos/ninos/${childId}?sessionId=${sessionId}`
        : `/api/casos/ninos/${childId}`;
    const res = await apiFetch(url);
    if (!res.ok) return;
    const d = (await res.json()) as {
      abiertos?: CasoAbierto[];
      casos?: (CasoAbierto & { cerradoEn: string | null })[];
    };
    const lista = d.abiertos ?? (d.casos ?? []).filter((c) => c.cerradoEn === null);
    setAbiertos(lista);
    setDestino(lista[0]?.id ?? "");
  }, [childId, sessionId]);

  useEffect(() => {
    async function inicial() {
      await cargarAbiertos();
    }
    void inicial();
  }, [cargarAbiertos]);

  // Cascada: los niños del salón elegido, y los guías para "a nombre de".
  useEffect(() => {
    if (!conCascada || filtros.classroomId === "") return;
    async function cargarNinos() {
      const res = await apiFetch(`/api/people/ninos?classroomId=${filtros.classroomId}&limit=200`);
      if (res.ok) setNinos(((await res.json()) as { ninos: NinoOpcion[] }).ninos);
    }
    void cargarNinos();
  }, [conCascada, filtros.classroomId]);

  useEffect(() => {
    if (!conCascada) return;
    async function cargarGuias() {
      const res = await apiFetch("/api/identity/guides");
      if (res.ok) setGuias(((await res.json()) as { guias: GuiaOpcion[] }).guias);
    }
    void cargarGuias();
  }, [conCascada]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  async function enviar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch("/api/casos/reportes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childPersonId: childId,
          texto,
          tema,
          sessionId: sessionId ?? null,
          guiaUserId: guiaUserId === "" ? null : guiaUserId,
          destino: abiertos.length > 0 ? destino : null,
        }),
      });
      const c = (await res.json().catch(() => ({}))) as {
        codigo?: string;
        abrioCaso?: boolean;
        error?: { message?: string; details?: { tipo?: string; casos?: CasoAbierto[] } };
      };
      if (!res.ok) {
        // El niño tenía un caso abierto que la pantalla no conocía: pregunta.
        if (c.error?.details?.tipo === "caso_abierto" && c.error.details.casos !== undefined) {
          setAbiertos(c.error.details.casos);
          setDestino(c.error.details.casos[0]?.id ?? "");
        }
        setError(c.error?.message ?? "No se pudo reportar el caso.");
        return;
      }
      onReportado(
        c.abrioCaso === true
          ? `Caso ${c.codigo ?? ""} abierto. Servicio lo verá en su bandeja.`
          : `Reporte sumado al caso ${c.codigo ?? ""}.`,
      );
    } finally {
      setOcupado(false);
    }
  }

  const listo =
    childId !== "" && texto.trim().length >= 5 && (abiertos.length === 0 || destino !== "");

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Reportar caso de atención"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(8,11,24,0.6)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "2rem 1rem",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "40rem",
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          padding: "1.1rem 1.25rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>
          ⚠️ Reportar caso de atención
        </h2>
        {nino !== undefined && (
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            <strong>{nino.nombre}</strong>
            {sesionLabel !== undefined && (
              <span style={{ color: "var(--texto-suave)" }}> · {sesionLabel}</span>
            )}
          </p>
        )}

        {conCascada && (
          <>
            <FiltrosServicio
              filtros={filtros}
              onCambio={(c) => {
                setFiltros((f) => ({ ...f, ...c }));
                if (c.classroomId !== undefined) {
                  setChildId("");
                  setNinos([]);
                }
              }}
              conUsuario={false}
              conFechas={false}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}>
              <label>
                <span style={rotuloServicio}>Niño *</span>
                <select
                  value={childId}
                  onChange={(e) => setChildId(e.target.value)}
                  disabled={filtros.classroomId === ""}
                  style={campoServicio}
                >
                  <option value="">
                    {filtros.classroomId === "" ? "Elige primero el salón" : "Elegir niño"}
                  </option>
                  {ninos.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombres} {n.apellidos} · {n.docNumero}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span style={rotuloServicio}>A nombre del guía (opcional)</span>
                <select
                  value={guiaUserId}
                  onChange={(e) => setGuiaUserId(e.target.value)}
                  style={campoServicio}
                >
                  <option value="">— Lo reporta Servicio —</option>
                  {guias.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nombre ?? g.username}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        {abiertos.length > 0 && (
          <div
            style={{
              padding: "0.7rem 0.85rem",
              borderRadius: "0.6rem",
              background: "#fff8e1",
              border: "1px solid #ffe082",
              fontSize: "0.85rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
            }}
          >
            <strong>Ya hay {abiertos.length === 1 ? "un caso abierto" : "casos abiertos"}</strong>
            {abiertos.map((c) => (
              <label
                key={c.id}
                style={{ display: "flex", gap: "0.45rem", alignItems: "flex-start" }}
              >
                <input
                  type="radio"
                  name="destino"
                  checked={destino === c.id}
                  onChange={() => setDestino(c.id)}
                  style={{ marginTop: "0.2rem" }}
                />
                <span>
                  Sumar al caso <strong>{c.codigo}</strong> · {etiqueta(voc.temas, c.tema)} ·{" "}
                  {etiqueta(voc.estados, c.estado)} · {c.reportes} reporte
                  {c.reportes === 1 ? "" : "s"} · abierto hace{" "}
                  {Math.max(0, Math.floor((ahora - new Date(c.abiertoEn).getTime()) / 86_400_000))}{" "}
                  días
                  {c.ultimaAccion !== null && (
                    <span
                      style={{ display: "block", color: "var(--texto-suave)", fontSize: "0.78rem" }}
                    >
                      Último movimiento: {c.ultimaAccion}
                    </span>
                  )}
                </span>
              </label>
            ))}
            <label style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
              <input
                type="radio"
                name="destino"
                checked={destino === "NUEVO"}
                onChange={() => setDestino("NUEVO")}
              />
              Abrir un caso nuevo (de otro tipo)
            </label>
          </div>
        )}

        <label>
          <span style={rotuloServicio}>Tipo de caso *</span>
          <select value={tema} onChange={(e) => setTema(e.target.value)} style={campoServicio}>
            {voc.temas.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={rotuloServicio}>¿Qué pasó? *</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="Describe qué pasó en la sesión…"
            style={{ ...campoServicio, fontFamily: "inherit" }}
          />
        </label>

        {error !== null && (
          <p role="alert" style={{ color: "#c62828", fontWeight: 600, margin: 0 }}>
            {error}
          </p>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>
            Los reportes no se editan ni se borran.
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" style={boton} onClick={onCerrar} disabled={ocupado}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={ocupado || !listo}
              onClick={() => void enviar()}
              style={{
                ...boton,
                border: "none",
                background: listo ? "#c62828" : "#e0b4b4",
                color: "white",
              }}
            >
              {ocupado ? "Enviando…" : "Reportar caso"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
