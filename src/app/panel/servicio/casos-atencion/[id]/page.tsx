"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { numeroContrato } from "@/ui/numero-contrato";
import { campoServicio, rotuloServicio } from "../../FiltrosServicio";
import { colorEstado, etiqueta, useVocabularioCasos } from "../casos-ui";
import { GestionarCasoModal } from "../GestionarCasoModal";

/**
 * Un caso de atención, completo: lo que reportó el guía, el contexto del niño
 * (derivado, no copiado), los intentos de contacto con la familia, el acuerdo,
 * el seguimiento y las acciones del área. Abrirlo marca sus reportes como
 * leídos. Cerrado, es de solo lectura.
 */

interface Evento {
  tipo: "REPORTE" | "ESTADO" | "NOTA" | "CONTACTO";
  fecha: string;
  autor: string | null;
  texto: string;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
  area: string | null;
  canal: string | null;
  intento: number | null;
  resultado: string | null;
  guia: string | null;
  fechaSesion: string | null;
  tema: string | null;
}

interface Caso {
  id: string;
  codigo: string;
  tema: string;
  estado: string;
  area: string | null;
  origen: string;
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
  acuerdo: string | null;
  fechaCompromiso: string | null;
  responsable: string | null;
  abiertoPor: string | null;
  cerradoPor: string | null;
  reincidencia: "BAJA" | "MEDIA" | "ALTA";
  movimientos: number;
  seguimiento: Evento[];
  contactos: { canal: string; intento: number; resultado: string; fecha: string }[];
  otros: { id: string; codigo: string; tema: string; estado: string; abiertoEn: string }[];
}

const caja: CSSProperties = {
  background: "white",
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1rem 1.1rem",
};
const boton: CSSProperties = {
  padding: "0.45rem 0.9rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.85rem",
};
const REINCIDENCIA = {
  BAJA: { color: "#1b5e20", fondo: "#e8f5e9" },
  MEDIA: { color: "#b57a00", fondo: "#fff8e1" },
  ALTA: { color: "#b71c1c", fondo: "#ffebee" },
};
const ICONO: Record<Evento["tipo"], string> = {
  REPORTE: "⚠️",
  ESTADO: "🔀",
  NOTA: "📝",
  CONTACTO: "📞",
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });

export default function CasoPage() {
  const { id } = useParams<{ id: string }>();
  const voc = useVocabularioCasos();
  const [caso, setCaso] = useState<Caso | null>(null);
  // Contactos/acuerdo/notas, asignar/escalar y cerrar: cada uno con su opción.
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [puedeAsignar, setPuedeAsignar] = useState(false);
  const [puedeCerrar, setPuedeCerrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [modal, setModal] = useState<"asignar" | "cerrar" | null>(null);
  const [quien, setQuien] = useState("");
  // Formularios.
  const [acuerdo, setAcuerdo] = useState("");
  const [fechaCompromiso, setFechaCompromiso] = useState("");
  const [responsable, setResponsable] = useState("");
  const [canal, setCanal] = useState("LLAMADA");
  const [resultado, setResultado] = useState("CONTESTO");
  const [observacion, setObservacion] = useState("");
  const [nota, setNota] = useState("");

  const aplicar = useCallback((c: Caso) => {
    setCaso(c);
    setAcuerdo(c.acuerdo ?? "");
    setFechaCompromiso(c.fechaCompromiso ?? "");
    setResponsable(c.responsable ?? "");
  }, []);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/casos/${id}`);
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar el caso.");
      return;
    }
    const d = (await res.json()) as {
      caso: Caso;
      puedeGestionar: boolean;
      puedeAsignar?: boolean;
      puedeCerrar?: boolean;
    };
    aplicar(d.caso);
    setPuedeGestionar(d.puedeGestionar);
    setPuedeAsignar(d.puedeAsignar === true);
    setPuedeCerrar(d.puedeCerrar === true);
  }, [id, aplicar]);

  useEffect(() => {
    async function inicial() {
      await cargar();
      const res = await apiFetch("/api/auth/me");
      if (res.ok) {
        const me = (await res.json()) as {
          user: { nombre?: string | null; username: string } | null;
        };
        setQuien(me.user?.nombre ?? me.user?.username ?? "");
      }
    }
    void inicial();
  }, [cargar]);

  async function accion(cuerpo: Record<string, unknown>, exito: string, despues?: () => void) {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch(`/api/casos/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo guardar.");
        return;
      }
      aplicar(((await res.json()) as { caso: Caso }).caso);
      setAviso(exito);
      despues?.();
    } finally {
      setOcupado(false);
    }
  }

  if (caso === null) {
    return (
      <main style={{ padding: "2rem" }}>
        {error !== null ? (
          <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
            {error}
          </p>
        ) : (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        )}
      </main>
    );
  }

  const cerrado = caso.cerradoEn !== null;
  const editable = puedeGestionar && !cerrado;
  const contrato = numeroContrato({
    externalRef: caso.externalRef,
    numero: caso.contratoNumero,
  }).numero;
  // La misma regla del dominio: sin área, a cualquiera; desde un área, solo se
  // escala a Dirección, que es la última.
  const puedeDerivar = caso.area !== voc.escalaA;

  return (
    <main
      style={{
        padding: "2rem",
        maxWidth: "76rem",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <Link href="/panel/servicio/casos-atencion" style={{ fontSize: "0.85rem" }}>
        ← Casos de atención
      </Link>

      {/* Encabezado */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.6rem", margin: 0 }}>
            Caso {caso.codigo}{" "}
            <span
              style={{ fontSize: "0.9rem", ...colorEstiloPastilla(colorEstado(voc, caso.estado)) }}
            >
              {etiqueta(voc.estados, caso.estado)}
            </span>
            {caso.noContinua && (
              <span
                style={{
                  fontSize: "0.9rem",
                  marginLeft: "0.4rem",
                  ...colorEstiloPastilla({ color: "#b71c1c", fondo: "#ffebee" }),
                }}
              >
                No continúa con el curso
              </span>
            )}
          </h1>
          <p style={{ margin: "0.3rem 0 0", color: "var(--texto-suave)" }}>
            <Link href={`/panel/personas/${caso.childPersonId}`} style={{ fontWeight: 700 }}>
              {caso.nombre}
            </Link>{" "}
            · {etiqueta(voc.temas, caso.tema)} ·{" "}
            {caso.area !== null ? `En ${etiqueta(voc.areas, caso.area)}` : "Sin asignar"} · abierto
            por {caso.abiertoPor ?? "—"} el {fechaHora(caso.abiertoEn)}
            {cerrado &&
              ` · cerrado por ${caso.cerradoPor ?? "—"} el ${fechaHora(caso.cerradoEn ?? "")}`}
          </p>
        </div>
        {!cerrado && (puedeAsignar || puedeCerrar) && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {puedeAsignar && puedeDerivar && (
              <button type="button" style={boton} onClick={() => setModal("asignar")}>
                {caso.area === null
                  ? "Asignar a un área"
                  : `Escalar a ${etiqueta(voc.areas, voc.escalaA)}`}
              </button>
            )}
            {puedeCerrar && (
              <button
                type="button"
                style={{ ...boton, border: "none", background: "var(--lgs-azul)", color: "white" }}
                onClick={() => setModal("cerrar")}
              >
                Cerrar caso
              </button>
            )}
          </div>
        )}
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, margin: 0 }}>
          {error}
        </p>
      )}
      {aviso !== null && <p style={{ color: "#1b5e20", fontWeight: 600, margin: 0 }}>{aviso}</p>}
      {cerrado && (
        <p
          style={{
            margin: 0,
            padding: "0.6rem 0.8rem",
            borderRadius: "0.6rem",
            background: "#eceff1",
            fontSize: "0.88rem",
          }}
        >
          🔒 Caso cerrado: es de solo lectura. Si el problema vuelve, el guía o Servicio abren uno
          nuevo.
        </p>
      )}

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
          gap: "0.7rem",
        }}
      >
        {[
          ["N.º de caso del niño", String(caso.numeroCaso)],
          ["Reportes", String(caso.reportes)],
          ["Seguimiento", `${String(caso.movimientos)} movim.`],
        ].map(([t, v]) => (
          <div key={t} style={caja}>
            <div style={{ fontSize: "0.75rem", color: "var(--texto-suave)", fontWeight: 700 }}>
              {t}
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>{v}</div>
          </div>
        ))}
        <div style={caja}>
          <div style={{ fontSize: "0.75rem", color: "var(--texto-suave)", fontWeight: 700 }}>
            Reincidencia
          </div>
          <span
            style={{ fontSize: "1.1rem", ...colorEstiloPastilla(REINCIDENCIA[caso.reincidencia]) }}
          >
            {caso.reincidencia}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(22rem, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Contexto (derivado) */}
        <section style={caja}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Contexto</h2>
          <dl
            style={{
              margin: 0,
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "0.3rem 0.8rem",
              fontSize: "0.88rem",
            }}
          >
            <dt style={{ color: "var(--texto-suave)" }}>Documento</dt>
            <dd style={{ margin: 0 }}>
              {caso.documento} · {caso.pais}
            </dd>
            <dt style={{ color: "var(--texto-suave)" }}>Usuario</dt>
            <dd style={{ margin: 0 }}>{caso.username ?? "—"}</dd>
            <dt style={{ color: "var(--texto-suave)" }}>Contrato</dt>
            <dd style={{ margin: 0 }}>{contrato}</dd>
            <dt style={{ color: "var(--texto-suave)" }}>Programa</dt>
            <dd style={{ margin: 0 }}>
              {[caso.campania, caso.curso, caso.salon].filter((x) => x !== null).join(" · ") ||
                "Sin matrícula"}
            </dd>
            <dt style={{ color: "var(--texto-suave)" }}>Guía del salón</dt>
            <dd style={{ margin: 0 }}>{caso.guia ?? "—"}</dd>
            <dt style={{ color: "var(--texto-suave)" }}>Apoderado</dt>
            <dd style={{ margin: 0 }}>
              {caso.apoderado ?? "—"}
              {caso.telefono !== null && ` · ${caso.telefono}`}
            </dd>
          </dl>
        </section>

        {/* Contactos con la familia */}
        <section style={caja}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Contacto con la familia</h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              fontSize: "0.86rem",
            }}
          >
            {voc.canales.map((c) => {
              const intentos = caso.contactos.filter((x) => x.canal === c);
              return (
                <div
                  key={c}
                  style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}
                >
                  <strong style={{ minWidth: "6rem" }}>
                    {c === "LLAMADA" ? "📞 Llamada" : c === "WHATSAPP" ? "💬 WhatsApp" : "✉️ Email"}
                  </strong>
                  {intentos.length === 0 ? (
                    <span style={{ color: "var(--texto-suave)" }}>sin intentos</span>
                  ) : (
                    intentos.map((x) => (
                      <span
                        key={x.intento}
                        title={fechaHora(x.fecha)}
                        style={colorEstiloPastilla(
                          x.resultado === "CONTESTO" || x.resultado === "RESPONDIO"
                            ? { color: "#1b5e20", fondo: "#e8f5e9" }
                            : { color: "#b57a00", fondo: "#fff8e1" },
                        )}
                      >
                        #{x.intento} {etiqueta(voc.resultados, x.resultado)}
                      </span>
                    ))
                  )}
                </div>
              );
            })}
          </div>
          {editable && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
                marginTop: "0.7rem",
              }}
            >
              <select
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
                style={campoServicio}
              >
                {voc.canales.map((c) => (
                  <option key={c} value={c}>
                    {c === "LLAMADA" ? "Llamada" : c === "WHATSAPP" ? "WhatsApp" : "Email"}
                  </option>
                ))}
              </select>
              <select
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                style={campoServicio}
              >
                {voc.resultados.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.etiqueta}
                  </option>
                ))}
              </select>
              <input
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Observación (opcional)"
                maxLength={2000}
                style={{ ...campoServicio, gridColumn: "span 2" }}
              />
              <button
                type="button"
                disabled={ocupado}
                style={{ ...boton, gridColumn: "span 2" }}
                onClick={() =>
                  void accion(
                    {
                      accion: "contacto",
                      canal,
                      resultado,
                      observacion: observacion === "" ? null : observacion,
                    },
                    "Intento de contacto registrado.",
                    () => setObservacion(""),
                  )
                }
              >
                + Registrar intento de contacto
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Acuerdo con la familia */}
      <section style={caja}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Acuerdo con la familia</h2>
        <div
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.6rem" }}
          className="caso-acuerdo"
        >
          <label>
            <span style={rotuloServicio}>Acuerdo</span>
            <textarea
              value={acuerdo}
              onChange={(e) => setAcuerdo(e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={!editable}
              style={{ ...campoServicio, fontFamily: "inherit" }}
            />
          </label>
          <label>
            <span style={rotuloServicio}>Fecha de compromiso</span>
            <input
              type="date"
              value={fechaCompromiso}
              onChange={(e) => setFechaCompromiso(e.target.value)}
              disabled={!editable}
              style={campoServicio}
            />
          </label>
          <label>
            <span style={rotuloServicio}>Responsable</span>
            <input
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              maxLength={200}
              disabled={!editable}
              style={campoServicio}
            />
          </label>
        </div>
        {editable && (
          <button
            type="button"
            disabled={ocupado}
            style={{ ...boton, marginTop: "0.6rem" }}
            onClick={() =>
              void accion(
                { accion: "gestion", acuerdo, fechaCompromiso, responsable },
                "Acuerdo guardado.",
              )
            }
          >
            Guardar acuerdo
          </button>
        )}
        <style>{`@media (max-width: 760px) { .caso-acuerdo { grid-template-columns: 1fr !important; } }`}</style>
      </section>

      {/* Seguimiento */}
      <section style={caja}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.6rem" }}>Seguimiento</h2>
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.55rem",
          }}
        >
          {caso.seguimiento.map((e, i) => (
            <li
              key={`${e.tipo}-${String(i)}`}
              style={{
                display: "flex",
                gap: "0.6rem",
                padding: "0.55rem 0.7rem",
                borderRadius: "0.6rem",
                background: e.tipo === "REPORTE" ? "#fff8f8" : "#fafbfe",
                border: `1px solid ${e.tipo === "REPORTE" ? "#ffcdd2" : "#edf0f6"}`,
                fontSize: "0.87rem",
              }}
            >
              <span aria-hidden>{ICONO[e.tipo]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "var(--texto-suave)", fontSize: "0.76rem" }}>
                  {fechaHora(e.fecha)} · {e.autor ?? "—"}
                  {e.tipo === "REPORTE" &&
                    ` · reporte${e.guia !== null ? ` de ${e.guia}` : ""}${e.fechaSesion !== null ? ` (sesión del ${e.fechaSesion})` : ""} · ${etiqueta(voc.temas, e.tema)}`}
                  {e.tipo === "ESTADO" &&
                    ` · ${e.estadoAnterior !== null ? `${etiqueta(voc.estados, e.estadoAnterior)} → ` : ""}${etiqueta(voc.estados, e.estadoNuevo)}`}
                  {e.tipo === "CONTACTO" &&
                    ` · ${e.canal ?? ""} #${String(e.intento ?? "")} · ${etiqueta(voc.resultados, e.resultado)}`}
                </div>
                {e.texto !== "" && <div style={{ whiteSpace: "pre-wrap" }}>{e.texto}</div>}
              </div>
            </li>
          ))}
        </ol>
        {editable && (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.7rem" }}>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Agregar una nota al seguimiento"
              maxLength={2000}
              style={{ ...campoServicio, flex: 1 }}
            />
            <button
              type="button"
              disabled={ocupado || nota.trim().length < 2}
              style={boton}
              onClick={() =>
                void accion({ accion: "nota", texto: nota }, "Nota agregada.", () => setNota(""))
              }
            >
              Agregar
            </button>
          </div>
        )}
      </section>

      {caso.otros.length > 0 && (
        <section style={caja}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Otros casos de {caso.nombre}</h2>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.87rem" }}>
            {caso.otros.map((o) => (
              <li key={o.id}>
                <Link href={`/panel/servicio/casos-atencion/${o.id}`} style={{ fontWeight: 700 }}>
                  {o.codigo}
                </Link>{" "}
                · {etiqueta(voc.temas, o.tema)} · {etiqueta(voc.estados, o.estado)} ·{" "}
                {new Date(o.abiertoEn).toLocaleDateString("es")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {modal !== null && (
        <GestionarCasoModal
          caso={{ id: caso.id, codigo: caso.codigo, nombre: caso.nombre, area: caso.area, acuerdo }}
          modo={modal}
          quienCierra={quien}
          onCerrar={() => setModal(null)}
          onHecho={(texto) => {
            setModal(null);
            setAviso(texto);
            void cargar();
          }}
        />
      )}
    </main>
  );
}

function colorEstiloPastilla(c: { color: string; fondo: string }): CSSProperties {
  return {
    display: "inline-block",
    padding: "0.1rem 0.55rem",
    borderRadius: "999px",
    fontWeight: 700,
    color: c.color,
    background: c.fondo,
    verticalAlign: "middle",
  };
}
