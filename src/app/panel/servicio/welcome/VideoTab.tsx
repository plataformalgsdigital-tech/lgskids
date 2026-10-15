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
  type FiltrosBase,
} from "../FiltrosServicio";
import { cuandoWelcome } from "./welcome-ui";

/**
 * Video Welcome (MOSAICO): quien faltó a sus 2 Welcome sin asistir a ninguno
 * recibe por WhatsApp, en el teléfono del APODERADO, el enlace del video de
 * bienvenida. Enviarlo cuenta como Welcome hecho. Pestañas Pendientes / Enviados,
 * selección por fila o todas las visibles, y tandas de hasta 60.
 */

interface Candidato {
  childPersonId: string;
  nombre: string;
  documento: string;
  pais: string;
  campania: string | null;
  curso: string | null;
  salon: string | null;
  apoderado: string | null;
  telefonoApoderado: string | null;
  telefono: string | null;
  externalRef: string | null;
  contratoNumero: number | null;
  perdidos: number;
  ultimoPerdido: string | null;
  ultimoEnvio: string | null;
  envios: number;
}

interface Resultado {
  childPersonId: string;
  nombre: string;
  ok: boolean;
  destinatario: string | null;
  error?: string;
}

const modal: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 80,
  background: "rgba(8,11,24,0.6)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "2rem 1rem",
  overflowY: "auto",
};
const caja: CSSProperties = {
  width: "100%",
  maxWidth: "36rem",
  background: "white",
  borderRadius: "1rem",
  boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  padding: "1.1rem 1.25rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.7rem",
};

export function VideoTab() {
  const [filtros, setFiltros] = useState<FiltrosBase>({
    buscar: "",
    campaignId: "",
    curso: "",
    classroomId: "",
    desde: "",
    hasta: "",
  });
  const [sub, setSub] = useState<"PENDIENTES" | "ENVIADOS">("PENDIENTES");
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [nuevoEnlace, setNuevoEnlace] = useState("");
  const [editando, setEditando] = useState(false);
  const [puedeEnviar, setPuedeEnviar] = useState(false);
  const [puedeConfigurar, setPuedeConfigurar] = useState(false);
  const [maxPorTanda, setMaxPorTanda] = useState(60);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState<Candidato[] | null>(null);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    const res = await apiFetch(
      `/api/scheduling/servicio/welcome?${qsFiltros(filtros, { vista: "video" })}`,
    );
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar.");
      setCandidatos([]);
      return;
    }
    const d = (await res.json()) as {
      candidatos: Candidato[];
      video: { enlace: string | null };
      puedeEnviar: boolean;
      puedeConfigurarVideo: boolean;
      maxPorTanda: number;
    };
    setCandidatos(d.candidatos);
    setEnlace(d.video.enlace);
    setPuedeEnviar(d.puedeEnviar);
    setPuedeConfigurar(d.puedeConfigurarVideo);
    setMaxPorTanda(d.maxPorTanda);
    // Las marcas de filas que ya no se ven se sueltan (como MOSAICO).
    setMarcados((m) => m.filter((id) => d.candidatos.some((c) => c.childPersonId === id)));
  }, [filtros]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  const pendientes = (candidatos ?? []).filter((c) => c.ultimoEnvio === null);
  const enviados = (candidatos ?? []).filter((c) => c.ultimoEnvio !== null);
  const visibles = sub === "PENDIENTES" ? pendientes : enviados;
  const telefonoDe = (c: Candidato) => c.telefonoApoderado ?? c.telefono;

  async function guardarEnlace() {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch("/api/scheduling/servicio/welcome/video", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enlace: nuevoEnlace }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo guardar el enlace.");
        return;
      }
      setEditando(false);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function enviar(lista: Candidato[]) {
    setOcupado(true);
    setError(null);
    const todos: Resultado[] = [];
    try {
      // En tandas de hasta `maxPorTanda`, como MOSAICO.
      for (let i = 0; i < lista.length; i += maxPorTanda) {
        const tanda = lista.slice(i, i + maxPorTanda);
        const res = await apiFetch("/api/scheduling/servicio/welcome/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ childPersonIds: tanda.map((c) => c.childPersonId) }),
        });
        if (!res.ok) {
          const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
          setError(c.error?.message ?? "No se pudo enviar.");
          break;
        }
        todos.push(...((await res.json()) as { resultados: Resultado[] }).resultados);
      }
      setConfirmando(null);
      setResultados(todos);
      setMarcados([]);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  function exportar() {
    descargarCsv(
      `welcome-video-${new Date().toISOString().slice(0, 10)}`,
      [
        "nino",
        "documento",
        "contrato",
        "pais",
        "campania",
        "curso",
        "salon",
        "welcome_perdidos",
        "ultima_sesion_perdida",
        "apoderado",
        "telefono_apoderado",
        "estado",
      ],
      visibles.map((c) => [
        c.nombre,
        c.documento,
        numeroContrato({ externalRef: c.externalRef, numero: c.contratoNumero }).numero,
        c.pais,
        c.campania,
        c.curso,
        c.salon,
        c.perdidos,
        c.ultimoPerdido?.slice(0, 10) ?? "",
        c.apoderado,
        telefonoDe(c),
        c.ultimoEnvio === null ? "Pendiente" : `Enviado ${c.ultimoEnvio.slice(0, 10)}`,
      ]),
    );
  }

  const elegibles = visibles.filter((c) => telefonoDe(c) !== null);
  const marcadosVisibles = visibles.filter((c) => marcados.includes(c.childPersonId));

  return (
    <>
      {/* El video: un ENLACE (YouTube no listado, Drive…), no un archivo. */}
      <section
        style={{
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "0.9rem 1rem",
          marginBottom: "0.5rem",
        }}
      >
        <strong style={{ fontSize: "0.95rem" }}>🎬 Video de bienvenida</strong>
        {!editando ? (
          <div
            style={{
              display: "flex",
              gap: "0.6rem",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "0.4rem",
              fontSize: "0.88rem",
            }}
          >
            {enlace !== null ? (
              <a
                href={enlace}
                target="_blank"
                rel="noopener noreferrer"
                style={{ overflowWrap: "anywhere" }}
              >
                {enlace}
              </a>
            ) : (
              <span style={{ color: "#b57a00", fontWeight: 600 }}>
                Todavía no hay enlace: sin él no se puede enviar.
              </span>
            )}
            {puedeConfigurar && (
              <button
                type="button"
                style={{ ...botonServicio, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                onClick={() => {
                  setNuevoEnlace(enlace ?? "");
                  setEditando(true);
                }}
              >
                {enlace === null ? "Configurar enlace" : "Cambiar enlace"}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
            <input
              value={nuevoEnlace}
              onChange={(e) => setNuevoEnlace(e.target.value)}
              placeholder="https://youtu.be/… (no listado) o https://drive.google.com/…"
              style={{ ...campoServicio, flex: "1 1 20rem" }}
            />
            <button
              type="button"
              style={botonServicio}
              disabled={ocupado}
              onClick={() => void guardarEnlace()}
            >
              Guardar
            </button>
            <button
              type="button"
              style={botonServicio}
              disabled={ocupado}
              onClick={() => setEditando(false)}
            >
              Cancelar
            </button>
          </div>
        )}
        <p style={{ margin: "0.4rem 0 0", fontSize: "0.76rem", color: "var(--texto-suave)" }}>
          El mensaje va al apoderado con la plantilla “Video de bienvenida” (Administración ›
          Mensajes). Enviarlo cuenta como Welcome hecho.
        </p>
      </section>

      <FiltrosServicio
        filtros={filtros}
        onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}
        conFechas={false}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.3rem" }}>
          {(["PENDIENTES", "ENVIADOS"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSub(s)}
              style={{
                ...botonServicio,
                padding: "0.35rem 0.8rem",
                background: sub === s ? "#ede7f6" : "white",
                borderColor: sub === s ? "#4527a0" : "#e3e7f0",
              }}
            >
              {s === "PENDIENTES"
                ? `Pendientes (${String(pendientes.length)})`
                : `Enviados (${String(enviados.length)})`}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {puedeEnviar && (
            <>
              <button
                type="button"
                style={botonServicio}
                disabled={elegibles.length === 0}
                onClick={() =>
                  setMarcados((m) =>
                    elegibles.every((c) => m.includes(c.childPersonId))
                      ? m.filter((id) => !elegibles.some((c) => c.childPersonId === id))
                      : [...new Set([...m, ...elegibles.map((c) => c.childPersonId)])],
                  )
                }
              >
                Marcar todos los visibles
              </button>
              <button
                type="button"
                disabled={marcadosVisibles.length === 0 || enlace === null}
                onClick={() => setConfirmando(marcadosVisibles)}
                style={{
                  ...botonServicio,
                  border: "none",
                  background: "#4527a0",
                  color: "white",
                  opacity: marcadosVisibles.length === 0 || enlace === null ? 0.5 : 1,
                }}
              >
                Enviar video ({marcadosVisibles.length})
              </button>
            </>
          )}
          <button
            type="button"
            onClick={exportar}
            disabled={visibles.length === 0}
            style={botonServicio}
          >
            ⬇ Descargar CSV
          </button>
        </div>
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {candidatos === null ? (
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      ) : visibles.length === 0 ? (
        <p style={{ color: "var(--texto-suave)" }}>
          {sub === "PENDIENTES"
            ? "Nadie necesita el video ahora. 🎉"
            : "Todavía no se ha enviado el video a nadie."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f7fb" }}>
                {puedeEnviar && <th style={celdaServicio} />}
                <th style={celdaServicio}>Niño</th>
                <th style={celdaServicio}>Programa</th>
                <th style={celdaServicio}>Apoderado</th>
                <th style={celdaServicio}>Estado</th>
                {puedeEnviar && <th style={celdaServicio} />}
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => {
                const tel = telefonoDe(c);
                return (
                  <tr key={c.childPersonId}>
                    {puedeEnviar && (
                      <td style={celdaServicio}>
                        <input
                          type="checkbox"
                          disabled={tel === null}
                          checked={marcados.includes(c.childPersonId)}
                          onChange={(e) =>
                            setMarcados((m) =>
                              e.target.checked
                                ? [...m, c.childPersonId]
                                : m.filter((x) => x !== c.childPersonId),
                            )
                          }
                        />
                      </td>
                    )}
                    <td style={celdaServicio}>
                      <Link
                        href={`/panel/personas/${c.childPersonId}`}
                        target="_blank"
                        style={{ fontWeight: 700 }}
                      >
                        {c.nombre}
                      </Link>
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        Faltó a {c.perdidos} Welcome
                        {c.ultimoPerdido !== null &&
                          ` · el último, ${cuandoWelcome(c.ultimoPerdido).fecha}`}
                      </div>
                    </td>
                    <td style={celdaServicio}>
                      {c.campania ?? "—"}
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {[c.curso, c.salon].filter((x) => x !== null).join(" · ")}
                      </div>
                    </td>
                    <td style={celdaServicio}>
                      {c.apoderado ?? "—"}
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: tel === null ? "#c62828" : "var(--texto-suave)",
                          fontWeight: tel === null ? 700 : 400,
                        }}
                      >
                        {tel ?? "sin teléfono"}
                      </div>
                    </td>
                    <td style={celdaServicio}>
                      {c.ultimoEnvio === null ? (
                        <span style={{ color: "#b57a00", fontWeight: 700 }}>Pendiente</span>
                      ) : (
                        <span
                          style={{ color: "#1b5e20", fontWeight: 700 }}
                          title={`${String(c.envios)} envío(s)`}
                        >
                          ✓ Enviado {new Date(c.ultimoEnvio).toLocaleDateString("es")}
                        </span>
                      )}
                    </td>
                    {puedeEnviar && (
                      <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          disabled={tel === null || enlace === null}
                          style={{ ...botonServicio, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                          onClick={() => setConfirmando([c])}
                        >
                          {c.ultimoEnvio === null ? "Enviar video" : "Reenviar"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmando !== null && (
        <div
          style={modal}
          onClick={() => !ocupado && setConfirmando(null)}
          role="dialog"
          aria-modal="true"
        >
          <div style={caja} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Enviar el video de bienvenida</h2>
            <p style={{ margin: 0, fontSize: "0.86rem" }}>
              Por WhatsApp, al apoderado de {confirmando.length} niño(s):
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                fontSize: "0.84rem",
                maxHeight: "16rem",
                overflowY: "auto",
              }}
            >
              {confirmando.map((c) => (
                <li key={c.childPersonId}>
                  {c.nombre} · {c.apoderado ?? "apoderado"} · {telefonoDe(c)}
                  {c.ultimoEnvio !== null && " (reenvío)"}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                style={botonServicio}
                disabled={ocupado}
                onClick={() => setConfirmando(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => void enviar(confirmando)}
                style={{ ...botonServicio, border: "none", background: "#4527a0", color: "white" }}
              >
                {ocupado ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resultados !== null && (
        <div style={modal} onClick={() => setResultados(null)} role="dialog" aria-modal="true">
          <div style={caja} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Resultado del envío</h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                fontSize: "0.84rem",
                maxHeight: "18rem",
                overflowY: "auto",
              }}
            >
              {resultados.map((r) => (
                <li key={r.childPersonId} style={{ color: r.ok ? "#1b5e20" : "#c62828" }}>
                  {r.ok ? "✓" : "✗"} {r.nombre}
                  {r.ok
                    ? ` · enviado a ${r.destinatario ?? ""}`
                    : ` · ${r.error ?? "no se pudo enviar"}`}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" style={botonServicio} onClick={() => setResultados(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
