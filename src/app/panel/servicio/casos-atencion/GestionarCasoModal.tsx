"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { usePermisos } from "@/ui/permisos";
import { campoServicio, rotuloServicio } from "../FiltrosServicio";
import { etiqueta, useVocabularioCasos } from "./casos-ui";

/**
 * ¿A dónde va el caso? Como el "Asignar" de MOSAICO: a un ÁREA (con comentario)
 * o CERRARLO (conclusión, acuerdo con la familia, "no continúa" y la firma de
 * quien cierra). Solo ofrece lo que el servidor acepta para el área actual: el
 * vocabulario y los cierres por área vienen del dominio.
 */

export interface CasoParaGestionar {
  id: string;
  codigo: string;
  nombre: string;
  area: string | null;
  acuerdo?: string | null;
}

const boton: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
};

export function GestionarCasoModal({
  caso,
  modo: modoInicial,
  quienCierra,
  onCerrar,
  onHecho,
}: {
  caso: CasoParaGestionar;
  /** Abre directo en asignar o en cerrar. */
  modo: "asignar" | "cerrar";
  /** Nombre de quien firma el cierre. */
  quienCierra: string;
  onCerrar: () => void;
  onHecho: (aviso: string) => void;
}) {
  const voc = useVocabularioCasos();
  const { puede } = usePermisos();
  const [modo, setModo] = useState(modoInicial);
  const [area, setArea] = useState("");
  const [comentario, setComentario] = useState("");
  const cierres = voc.cierresPorArea[caso.area ?? "SIN_AREA"] ?? [];
  const [estado, setEstado] = useState("RESUELTO");
  const [conclusion, setConclusion] = useState("");
  const [acuerdo, setAcuerdo] = useState(caso.acuerdo ?? "");
  const [fechaCompromiso, setFechaCompromiso] = useState("");
  const [noContinua, setNoContinua] = useState(false);
  const [confirmo, setConfirmo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // Sin área, a cualquiera; desde un área, solo se escala a Dirección.
  const areasPosibles = voc.areas.filter((a) =>
    caso.area === null ? true : a.valor === voc.escalaA && caso.area !== voc.escalaA,
  );
  const sinContacto = estado === "SIN_CONTACTO";
  const listo =
    modo === "asignar"
      ? area !== "" && comentario.trim().length >= 5
      : conclusion.trim().length >= 5 && (sinContacto || acuerdo.trim() !== "") && confirmo;

  async function guardar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/casos/${caso.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          modo === "asignar"
            ? { accion: "asignar", area, comentario }
            : {
                accion: "cerrar",
                estado,
                conclusion,
                noContinua,
                acuerdo: acuerdo.trim() === "" ? null : acuerdo,
                fechaCompromiso: fechaCompromiso === "" ? null : fechaCompromiso,
              },
        ),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo guardar.");
        return;
      }
      onHecho(
        modo === "asignar"
          ? `Caso ${caso.codigo} asignado a ${etiqueta(voc.areas, area)}.`
          : `Caso ${caso.codigo} cerrado: ${etiqueta(voc.estados, estado)}.`,
      );
    } finally {
      setOcupado(false);
    }
  }

  const ahora = new Date().toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Gestionar caso"
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
          maxWidth: "36rem",
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
          {modo === "asignar" ? "¿A dónde va el caso?" : "Cerrar el caso"}
        </h2>
        <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--texto-suave)" }}>
          <strong style={{ color: "inherit" }}>{caso.codigo}</strong> · {caso.nombre}
          {caso.area !== null && ` · hoy en ${etiqueta(voc.areas, caso.area)}`}
        </p>

        {modo === "asignar" ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {/* Asignar y cerrar son opciones distintas en Roles. */}
              {(puede("op.casos.asignar") ? areasPosibles : []).map((a) => (
                <label
                  key={a.valor}
                  style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}
                >
                  <input
                    type="radio"
                    name="area"
                    checked={area === a.valor}
                    onChange={() => setArea(a.valor)}
                  />
                  {a.etiqueta}
                </label>
              ))}
              {puede("op.casos.cerrar") && (
                <label style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                  <input
                    type="radio"
                    name="area"
                    checked={false}
                    onChange={() => setModo("cerrar")}
                  />
                  Cerrar el caso
                </label>
              )}
            </div>
            <label>
              <span style={rotuloServicio}>Comentario *</span>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Qué tiene que hacer el área con este caso"
                style={{ ...campoServicio, fontFamily: "inherit" }}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              <span style={rotuloServicio}>¿Cómo se cerró? *</span>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                style={campoServicio}
              >
                {cierres.map((e) => (
                  <option key={e} value={e}>
                    {etiqueta(voc.estados, e)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={rotuloServicio}>Conclusión del caso *</span>
              <textarea
                value={conclusion}
                onChange={(e) => setConclusion(e.target.value)}
                rows={3}
                maxLength={2000}
                style={{ ...campoServicio, fontFamily: "inherit" }}
              />
            </label>
            <label>
              <span style={rotuloServicio}>
                Acuerdo con la familia {sinContacto ? "(no aplica: sin contacto)" : "*"}
              </span>
              <textarea
                value={acuerdo}
                onChange={(e) => setAcuerdo(e.target.value)}
                rows={2}
                maxLength={2000}
                disabled={sinContacto}
                style={{ ...campoServicio, fontFamily: "inherit" }}
              />
            </label>
            <label>
              <span style={rotuloServicio}>Fecha de compromiso (opcional)</span>
              <input
                type="date"
                value={fechaCompromiso}
                onChange={(e) => setFechaCompromiso(e.target.value)}
                style={campoServicio}
              />
            </label>
            <label
              style={{
                display: "flex",
                gap: "0.45rem",
                alignItems: "flex-start",
                padding: "0.55rem 0.7rem",
                borderRadius: "0.55rem",
                background: noContinua ? "#ffebee" : "#fafbfe",
                border: `1px solid ${noContinua ? "#ef9a9a" : "#e3e7f0"}`,
                fontSize: "0.86rem",
              }}
            >
              <input
                type="checkbox"
                checked={noContinua}
                onChange={(e) => setNoContinua(e.target.checked)}
                style={{ marginTop: "0.2rem" }}
              />
              <span>
                <strong>El niño NO continúa con el curso</strong>
                <span
                  style={{ display: "block", color: "var(--texto-suave)", fontSize: "0.78rem" }}
                >
                  Queda registrado en el caso. No inactiva el contrato ni libera el cupo: eso se
                  hace en Contratos.
                </span>
              </span>
            </label>
            <label
              style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontSize: "0.86rem" }}
            >
              <input
                type="checkbox"
                checked={confirmo}
                onChange={(e) => setConfirmo(e.target.checked)}
              />
              Confirmo el cierre: el caso queda de solo lectura.
            </label>
            <div style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
              Cerrado por <strong>{quienCierra}</strong> · {ahora}
            </div>
          </>
        )}

        {error !== null && (
          <p role="alert" style={{ color: "#c62828", fontWeight: 600, margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
          {modo === "cerrar" && modoInicial === "asignar" ? (
            <button
              type="button"
              style={boton}
              onClick={() => setModo("asignar")}
              disabled={ocupado}
            >
              ← Asignar a un área
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" style={boton} onClick={onCerrar} disabled={ocupado}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={ocupado || !listo}
              onClick={() => void guardar()}
              style={{
                ...boton,
                border: "none",
                background: listo ? "var(--lgs-azul)" : "#c9c6d8",
                color: "white",
              }}
            >
              {ocupado ? "Guardando…" : modo === "asignar" ? "Asignar" : "Cerrar caso"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
