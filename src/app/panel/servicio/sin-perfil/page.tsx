"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { descargarCsv } from "@/ui/csv";
import { numeroContrato } from "@/ui/numero-contrato";
import { SoloSi } from "@/ui/SoloSi";

/**
 * Servicio › Usuarios sin perfil creado: los niños con contrato aprobado (ya
 * tienen usuario) que todavía no crearon su perfil. Desde aquí se les manda el
 * enlace al apoderado —con o sin elegir Welcome— por la MISMA ruta del botón de
 * la ficha del niño, uno por uno y confirmando: es un WhatsApp a una familia.
 */

interface Nino {
  childPersonId: string;
  nombre: string;
  documento: string;
  pais: string;
  username: string | null;
  contractId: string;
  numero: number;
  externalRef: string | null;
  campania: string | null;
  curso: string | null;
  salon: string | null;
  inicioCurso: string | null;
  apoderado: string | null;
  enlace: {
    estado: "VIGENTE" | "USADO" | "REVOCADO";
    creadoEn: string;
    exigeWelcome: boolean;
  } | null;
  tieneWelcome: boolean;
  envios: { en: string; sinWelcome: boolean; ok: boolean; error: string | null }[];
}

interface Campania {
  id: string;
  nombre: string;
}

const campo: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};
const boton: CSSProperties = {
  padding: "0.3rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.78rem",
  whiteSpace: "nowrap",
};
const celda: CSSProperties = {
  padding: "0.5rem 0.6rem",
  borderBottom: "1px solid #eef1f7",
  verticalAlign: "top",
};

/** Hoy en el reloj de quien mira, para comparar con el inicio del curso. */
function hoyLocal(): string {
  const d = new Date();
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fecha y hora de un envío, en hora de Bogotá (la de la plataforma para estos registros). */
function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function estadoEnlace(n: Nino): { texto: string; color: string } {
  if (n.enlace === null) return { texto: "Nunca enviado", color: "#c62828" };
  const fecha = new Date(n.enlace.creadoEn).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
  });
  const tipo = n.enlace.exigeWelcome ? "" : " · sin Welcome";
  if (n.enlace.estado === "VIGENTE") {
    return { texto: `Enviado el ${fecha}${tipo}, sin usar`, color: "#b57a00" };
  }
  return { texto: `Revocado (${fecha})`, color: "var(--texto-suave)" };
}

/** Lo que está en pantalla (con sus filtros), sin enlaces ni tokens: no existen en claro. */
function exportar(ninos: Nino[]) {
  descargarCsv(
    `sin-perfil-${new Date().toISOString().slice(0, 10)}`,
    [
      "nino",
      "documento",
      "usuario",
      "pais",
      "contrato",
      "campania",
      "curso",
      "salon",
      "inicio_curso",
      "apoderado",
      "enlace",
      "enlace_enviado",
      "envios",
      "ultimo_envio",
      "welcome_agendado",
    ],
    ninos.map((n) => [
      n.nombre,
      n.documento,
      n.username,
      n.pais,
      numeroContrato({ externalRef: n.externalRef, numero: n.numero }).numero,
      n.campania,
      n.curso,
      n.salon,
      n.inicioCurso,
      n.apoderado,
      n.enlace === null
        ? "Nunca enviado"
        : n.enlace.estado === "VIGENTE"
          ? `Enviado sin usar${n.enlace.exigeWelcome ? "" : " (sin Welcome)"}`
          : "Revocado",
      n.enlace?.creadoEn.slice(0, 10) ?? "",
      n.envios.length,
      n.envios[0] !== undefined ? fechaHora(n.envios[0].en) : "",
      n.tieneWelcome,
    ]),
  );
}

export default function SinPerfilPage() {
  const [ninos, setNinos] = useState<Nino[] | null>(null);
  const [puedeEnviar, setPuedeEnviar] = useState(false);
  const [campanias, setCampanias] = useState<Campania[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [buscar, setBuscar] = useState("");
  const [filtroEnlace, setFiltroEnlace] = useState<"" | "nunca" | "enviado">("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  /** Niños con la lista de envíos desplegada. */
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const alternar = (id: string) =>
    setAbiertos((prev) => {
      const sig = new Set(prev);
      if (!sig.delete(id)) sig.add(id);
      return sig;
    });

  const cargar = useCallback(async () => {
    setError(null);
    const qs = new URLSearchParams();
    if (campaignId !== "") qs.set("campaignId", campaignId);
    if (buscar.trim() !== "") qs.set("buscar", buscar.trim());
    const res = await apiFetch(`/api/contracts/ninos/sin-perfil?${qs.toString()}`);
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar la lista.");
      setNinos([]);
      return;
    }
    const d = (await res.json()) as { ninos: Nino[]; puedeEnviar: boolean };
    setNinos(d.ninos);
    setPuedeEnviar(d.puedeEnviar);
  }, [campaignId, buscar]);

  useEffect(() => {
    // La búsqueda espera a que se deje de escribir.
    const t = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  useEffect(() => {
    async function cargarCampanias() {
      const res = await apiFetch("/api/catalog/campaigns");
      if (res.ok) setCampanias(((await res.json()) as { campanias: Campania[] }).campanias);
    }
    void cargarCampanias();
  }, []);

  async function enviar(n: Nino, sinWelcome: boolean) {
    const que = sinWelcome ? "el enlace de perfil SIN Welcome" : "el enlace de perfil";
    const previo =
      n.enlace?.estado === "VIGENTE" ? "\n\nEl enlace enviado antes dejará de servir." : "";
    if (
      !window.confirm(
        `¿Enviar ${que} de ${n.nombre} por WhatsApp a ${n.apoderado ?? "su apoderado"}?${previo}`,
      )
    ) {
      return;
    }
    setEnviando(n.childPersonId);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch(`/api/contracts/ninos/${n.childPersonId}/perfil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinWelcome }),
      });
      const c = (await res.json().catch(() => ({}))) as {
        destinatario?: string | null;
        error?: string | { message?: string };
      };
      if (!res.ok) {
        const msg = typeof c.error === "string" ? c.error : c.error?.message;
        setError(`${n.nombre}: ${msg ?? "no se pudo enviar el enlace."}`);
        return;
      }
      setAviso(`Enlace enviado para ${n.nombre}${c.destinatario ? ` a ${c.destinatario}` : ""}.`);
      await cargar();
    } finally {
      setEnviando(null);
    }
  }

  const hoy = hoyLocal();
  const visibles = (ninos ?? []).filter((n) =>
    filtroEnlace === "nunca"
      ? n.enlace === null
      : filtroEnlace === "enviado"
        ? n.enlace !== null
        : true,
  );

  return (
    <main style={{ padding: "2rem", maxWidth: "80rem", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: "1.6rem" }}>Usuarios sin perfil creado</h1>
        <SoloSi op="op.servicio.sin_perfil_csv">
          <button
            type="button"
            onClick={() => exportar(visibles)}
            disabled={visibles.length === 0}
            style={{
              padding: "0.55rem 1rem",
              borderRadius: "0.6rem",
              border: "1px solid #e3e7f0",
              background: "white",
              fontWeight: 700,
              cursor: visibles.length > 0 ? "pointer" : "default",
            }}
          >
            ⬇ Descargar CSV
          </button>
        </SoloSi>
      </div>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
        Niños con contrato aprobado —ya tienen usuario— que todavía no crearon su perfil. El enlace
        le llega al apoderado por WhatsApp. Si el curso del niño ya empezó, se sugiere el enlace{" "}
        <strong>sin Welcome</strong>.
      </p>

      <div
        style={{
          display: "flex",
          gap: "0.6rem",
          flexWrap: "wrap",
          margin: "1rem 0",
          alignItems: "center",
        }}
      >
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre, documento, usuario o contrato"
          style={{ ...campo, flex: "1 1 18rem" }}
        />
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={campo}>
          <option value="">Todas las campañas</option>
          {campanias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          value={filtroEnlace}
          onChange={(e) => setFiltroEnlace(e.target.value as "" | "nunca" | "enviado")}
          style={campo}
        >
          <option value="">Con o sin enlace</option>
          <option value="nunca">Nunca enviado</option>
          <option value="enviado">Enviado, sin usar</option>
        </select>
        <span style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
          {ninos === null
            ? ""
            : `${String(visibles.length)} niño${visibles.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {aviso !== null && <p style={{ color: "#1b5e20", fontWeight: 600 }}>{aviso}</p>}

      {ninos === null ? (
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      ) : visibles.length === 0 ? (
        <p style={{ color: "var(--texto-suave)" }}>No hay niños sin perfil con estos filtros. 🎉</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f7fb" }}>
                <th style={celda}>Niño</th>
                <th style={celda}>Contrato</th>
                <th style={celda}>Programa</th>
                <th style={celda}>Apoderado</th>
                <th style={celda}>Enlace</th>
                {puedeEnviar && <th style={celda}>Enviar</th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((n) => {
                const num = numeroContrato({ externalRef: n.externalRef, numero: n.numero });
                const enMarcha = n.inicioCurso !== null && n.inicioCurso <= hoy;
                const est = estadoEnlace(n);
                const abierto = abiertos.has(n.childPersonId);
                const columnas = puedeEnviar ? 6 : 5;
                return (
                  <Fragment key={n.childPersonId}>
                    <tr>
                      <td style={celda}>
                        <Link
                          href={`/panel/personas/${n.childPersonId}`}
                          style={{ fontWeight: 700 }}
                        >
                          {n.nombre}
                        </Link>
                        <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                          {n.documento} · {n.username ?? "sin usuario"} · {n.pais}
                        </div>
                      </td>
                      <td style={celda}>
                        <Link href={`/panel/contratos/${n.contractId}`}>{num.numero}</Link>
                      </td>
                      <td style={celda}>
                        {n.campania ?? "Sin matrícula"}
                        {n.salon !== null && (
                          <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                            {n.salon}
                            {n.inicioCurso !== null &&
                              ` · ${enMarcha ? "en curso desde" : "inicia"} ${n.inicioCurso}`}
                          </div>
                        )}
                        {n.tieneWelcome && (
                          <div style={{ color: "#1b5e20", fontSize: "0.78rem" }}>
                            👋 Welcome agendado
                          </div>
                        )}
                      </td>
                      <td style={celda}>{n.apoderado ?? "—"}</td>
                      <td style={{ ...celda, color: est.color, fontWeight: 600 }}>
                        {est.texto}
                        {n.envios.length > 0 && (
                          <div>
                            <button
                              type="button"
                              aria-expanded={abierto}
                              onClick={() => alternar(n.childPersonId)}
                              style={{
                                border: "none",
                                background: "none",
                                padding: 0,
                                cursor: "pointer",
                                color: "var(--lgs-azul)",
                                fontWeight: 600,
                                fontSize: "0.78rem",
                              }}
                            >
                              {abierto ? "▾" : "▸"} {n.envios.length}{" "}
                              {n.envios.length === 1 ? "envío" : "envíos"} · último{" "}
                              {fechaHora(n.envios[0]?.en ?? "")}
                            </button>
                          </div>
                        )}
                      </td>
                      {puedeEnviar && (
                        <td style={celda}>
                          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              style={{
                                ...boton,
                                // Con el curso andando ya no hay Welcome que agendar.
                                borderColor: enMarcha ? "#e3e7f0" : "var(--lgs-azul)",
                              }}
                              disabled={enviando !== null}
                              onClick={() => void enviar(n, false)}
                            >
                              🔗 Con Welcome
                            </button>
                            <button
                              type="button"
                              style={{
                                ...boton,
                                borderColor: enMarcha ? "var(--lgs-azul)" : "#e3e7f0",
                              }}
                              disabled={enviando !== null}
                              onClick={() => void enviar(n, true)}
                            >
                              🔗 Sin Welcome
                            </button>
                          </div>
                          {enviando === n.childPersonId && (
                            <span style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>
                              Enviando…
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                    {abierto && (
                      <tr>
                        <td colSpan={columnas} style={{ ...celda, background: "#f8faff" }}>
                          <strong style={{ fontSize: "0.8rem" }}>
                            Envíos del enlace a {n.apoderado ?? "su apoderado"}
                          </strong>
                          <ul
                            style={{
                              margin: "0.3rem 0 0",
                              paddingLeft: "1.1rem",
                              fontSize: "0.82rem",
                            }}
                          >
                            {n.envios.map((e, i) => (
                              <li key={`${e.en}-${String(i)}`}>
                                {fechaHora(e.en)} · {e.sinWelcome ? "Sin Welcome" : "Con Welcome"} ·{" "}
                                <span
                                  style={{ color: e.ok ? "#1b5e20" : "#c62828", fontWeight: 600 }}
                                >
                                  {e.ok
                                    ? "Enviado"
                                    : `Falló${e.error !== null ? `: ${e.error}` : ""}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
