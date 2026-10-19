"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { descargarCsv } from "@/ui/csv";
import { SoloSi } from "@/ui/SoloSi";

/**
 * Fichas de los guías: datos de contacto y su sala de Zoom.
 *
 * Replica el alta de MOSAICO (/nuevo-guia) con una diferencia: la CUENTA se
 * crea en Usuarios y roles (usuario + rol con alcance por país) y aquí se
 * completa su ficha. No hay dos identidades para la misma persona.
 */

interface Ficha {
  guiaUserId: string;
  username: string;
  nombres: string | null;
  apellidos: string | null;
  docNumero: string | null;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  domicilio: string | null;
  fechaNacimiento: string | null;
  zoomUrl: string | null;
  /** Foto de su ficha. La sirve `/api/scheduling/guias/[id]/foto`. */
  fotoFileId: string | null;
  /** Salones activos que tiene asignados. */
  salonesActivos: number;
  /** Estado de su cuenta: desactivado no entra al panel. */
  estado: "ACTIVO" | "INACTIVO";
}

type FiltroEstado = "ACTIVO" | "INACTIVO" | "TODOS";
const ETIQUETA_FILTRO: Record<FiltroEstado, string> = {
  ACTIVO: "Activos",
  INACTIVO: "Inactivos",
  TODOS: "Todos",
};

interface Enlace {
  guiaUserId: string;
  estado: "VIGENTE" | "USADA" | "REVOCADA" | "VENCIDA";
  expiraEn: string;
  usadoEn: string | null;
}

const PAISES = ["CL", "CO", "EC", "PE"];

const COLOR_ENLACE: Record<Enlace["estado"], { bg: string; c: string; txt: string }> = {
  VIGENTE: { bg: "#e8f5e9", c: "#1b5e20", txt: "Enlace enviado" },
  USADA: { bg: "#e3f2fd", c: "#0d47a1", txt: "Se registró" },
  VENCIDA: { bg: "#fff3e0", c: "#e65100", txt: "Enlace vencido" },
  REVOCADA: { bg: "#eceff1", c: "#455a64", txt: "Enlace revocado" },
};

const campo: CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  fontFamily: "inherit",
};
const rotulo: CSSProperties = {
  display: "block",
  fontSize: "0.76rem",
  fontWeight: 700,
  marginBottom: "0.15rem",
};
const tarjeta: CSSProperties = {
  background: "white",
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1rem 1.1rem",
};

const nombreDeGuia = (g: Ficha): string =>
  g.nombres !== null && g.apellidos !== null ? `${g.nombres} ${g.apellidos}` : g.username;

/**
 * Cara del guía junto a su nombre. Quien coordina reconoce antes una cara que
 * un usuario generado, y la foto ya se pedía en el alta sin mostrarse en
 * ninguna pantalla. Sin foto, la inicial.
 */
function FotoGuia({ guia }: { guia: Ficha }) {
  const lado = "2.4rem";
  if (guia.fotoFileId === null) {
    return (
      <span
        aria-hidden
        style={{
          width: lado,
          height: lado,
          flexShrink: 0,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontWeight: 800,
          color: "white",
          background: "linear-gradient(135deg, var(--lgs-azul) 0%, var(--lgs-magenta) 100%)",
        }}
      >
        {nombreDeGuia(guia).charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // La sirve una ruta AUTENTICADA: `next/image` no puede optimizarla.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // `v` cambia con la foto: la ruta cachea una hora y la URL es la del guía.
      src={`/api/scheduling/guias/${guia.guiaUserId}/foto?v=${guia.fotoFileId}`}
      alt=""
      style={{
        width: lado,
        height: lado,
        flexShrink: 0,
        borderRadius: "50%",
        objectFit: "cover",
        background: "#eef2ff",
      }}
    />
  );
}

function PastillaEstado({ estado }: { estado: Ficha["estado"] }) {
  const activo = estado === "ACTIVO";
  return (
    <span
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        fontSize: "0.72rem",
        fontWeight: 700,
        padding: "0.1rem 0.5rem",
        borderRadius: "1rem",
        whiteSpace: "nowrap",
        background: activo ? "#e8f5e9" : "#ffebee",
        color: activo ? "#1b5e20" : "#c62828",
      }}
    >
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

const VACIA = {
  nombres: "",
  apellidos: "",
  docNumero: "",
  email: "",
  telefono: "",
  pais: "",
  domicilio: "",
  fechaNacimiento: "",
  zoomUrl: "",
};

/** CSV con la ficha de todos los guías (sin foto: solo si la tiene). */
function descargarGuias(guias: Ficha[], enlaces: Record<string, Enlace>) {
  descargarCsv(
    "guias.csv",
    [
      "Nombres",
      "Apellidos",
      "Usuario",
      "Documento",
      "Fecha de nacimiento",
      "Correo",
      "Teléfono",
      "País",
      "Domicilio",
      "Sala de Zoom",
      "Tiene foto",
      "Salones activos",
      "Enlace de ficha",
      "Estado",
    ],
    guias.map((g) => {
      const e = enlaces[g.guiaUserId];
      return [
        g.nombres,
        g.apellidos,
        g.username,
        g.docNumero,
        g.fechaNacimiento,
        g.email,
        g.telefono,
        g.pais,
        g.domicilio,
        g.zoomUrl,
        g.fotoFileId !== null,
        g.salonesActivos,
        e === undefined ? "" : COLOR_ENLACE[e.estado].txt,
        g.estado === "ACTIVO" ? "Activo" : "Inactivo",
      ];
    }),
  );
}

const formDe = (g: Ficha) => ({
  nombres: g.nombres ?? "",
  apellidos: g.apellidos ?? "",
  docNumero: g.docNumero ?? "",
  email: g.email ?? "",
  telefono: g.telefono ?? "",
  pais: g.pais ?? "",
  domicilio: g.domicilio ?? "",
  fechaNacimiento: g.fechaNacimiento ?? "",
  zoomUrl: g.zoomUrl ?? "",
});

export default function GuiasPage() {
  const [guias, setGuias] = useState<Ficha[] | null>(null);
  const [enlaces, setEnlaces] = useState<Record<string, Enlace>>({});
  const [enlaceNuevo, setEnlaceNuevo] = useState<string | null>(null);
  const [diasVigencia, setDiasVigencia] = useState(7);
  const [copiado, setCopiado] = useState(false);
  const [sel, setSel] = useState<Ficha | null>(null);
  const [form, setForm] = useState({ ...VACIA });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [buscar, setBuscar] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("ACTIVO");
  /** La ficha abierta desde la lista dejó una entrada en el historial. */
  const empujado = useRef(false);
  const primeraCarga = useRef(true);

  /** La ficha se ve en solo lectura; "Editar ficha" (con su permiso) la abre. */
  const [editando, setEditando] = useState(false);
  const [fotoNueva, setFotoNueva] = useState<File | null>(null);
  const [previoFoto, setPrevioFoto] = useState<string | null>(null);

  const elegirFoto = (f: File | null) => {
    setFotoNueva(f);
    setPrevioFoto((anterior) => {
      if (anterior !== null) URL.revokeObjectURL(anterior);
      return f === null ? null : URL.createObjectURL(f);
    });
  };

  const abrir = useCallback((g: Ficha, empujar = true) => {
    setSel(g);
    setAviso(null);
    setError(null);
    setEditando(false);
    setFotoNueva(null);
    setPrevioFoto(null);
    // El enlace se muestra UNA vez, al emitirlo: después solo queda su hash.
    setEnlaceNuevo(null);
    setCopiado(false);
    setForm(formDe(g));
    // La ficha tiene su URL (?guia=…): "Atrás" del navegador vuelve a la lista
    // y el enlace se puede compartir.
    if (empujar) {
      window.history.pushState(null, "", `?guia=${g.guiaUserId}`);
      empujado.current = true;
    }
    window.scrollTo({ top: 0 });
  }, []);

  const cargar = useCallback(async () => {
    const res = await apiFetch("/api/scheduling/guias");
    if (!res.ok) {
      setError("No se pudo cargar la lista de guías.");
      return;
    }
    const data = (await res.json()) as {
      guias: Ficha[];
      enlaces: Enlace[];
      diasVigencia: number;
    };
    setGuias(data.guias);
    // La ficha abierta toma lo recién guardado (nombre, estado…).
    setSel((prev) =>
      prev === null ? null : (data.guias.find((x) => x.guiaUserId === prev.guiaUserId) ?? prev),
    );
    setEnlaces(Object.fromEntries(data.enlaces.map((e) => [e.guiaUserId, e])));
    setDiasVigencia(data.diasVigencia);
    // Al entrar con ?guia=… (enlace directo o recarga) se abre esa ficha.
    if (primeraCarga.current) {
      primeraCarga.current = false;
      const id = new URLSearchParams(window.location.search).get("guia");
      const g = data.guias.find((x) => x.guiaUserId === id);
      if (g !== undefined) abrir(g, false);
    }
  }, [abrir]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  // "Atrás"/"Adelante" del navegador: la URL dice qué ficha mostrar.
  useEffect(() => {
    function alNavegar() {
      const id = new URLSearchParams(window.location.search).get("guia");
      const g = id === null ? undefined : guias?.find((x) => x.guiaUserId === id);
      if (g === undefined) {
        empujado.current = false;
        setSel(null);
        setEnlaceNuevo(null);
      } else {
        abrir(g, false);
      }
    }
    window.addEventListener("popstate", alNavegar);
    return () => window.removeEventListener("popstate", alNavegar);
  }, [guias, abrir]);

  function volver() {
    setAviso(null);
    setError(null);
    if (empujado.current) {
      window.history.back(); // el popstate cierra la ficha
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    setSel(null);
    setEnlaceNuevo(null);
  }

  const sinTildes = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const q = sinTildes(buscar.trim());
  const conteo: Record<FiltroEstado, number> = {
    ACTIVO: (guias ?? []).filter((g) => g.estado === "ACTIVO").length,
    INACTIVO: (guias ?? []).filter((g) => g.estado !== "ACTIVO").length,
    TODOS: (guias ?? []).length,
  };
  const visibles = (guias ?? []).filter(
    (g) =>
      (filtroEstado === "TODOS" || g.estado === filtroEstado) &&
      (q === "" ||
        sinTildes([nombreDeGuia(g), g.username, g.docNumero, g.email, g.pais].join(" ")).includes(
          q,
        )),
  );

  async function cambiarEstado() {
    if (sel === null) return;
    const nuevo = sel.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const pregunta =
      nuevo === "INACTIVO"
        ? `¿Desactivar a ${nombreDeGuia(sel)}? No podrá entrar al panel y se cierran sus sesiones.` +
          (sel.salonesActivos > 0
            ? `\n\nOJO: tiene ${String(sel.salonesActivos)} salón(es) activo(s) asignado(s), que seguirán a su nombre hasta que les cambies el guía.`
            : "")
        : `¿Activar de nuevo a ${nombreDeGuia(sel)}? Volverá a entrar al panel con su usuario y clave.`;
    if (!window.confirm(pregunta)) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch(`/api/scheduling/guias/${sel.guiaUserId}/estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevo }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo cambiar el estado del guía.");
        return;
      }
      setAviso(
        nuevo === "INACTIVO"
          ? `${nombreDeGuia(sel)} quedó desactivado.`
          : `${nombreDeGuia(sel)} quedó activo.`,
      );
      await cargar();
    } finally {
      setOcupado(false);
    }
  }
  const th: CSSProperties = {
    padding: "0.5rem 0.6rem",
    textAlign: "left",
    fontWeight: 600,
    color: "var(--texto-suave)",
    whiteSpace: "nowrap",
  };
  const td: CSSProperties = { padding: "0.55rem 0.6rem", verticalAlign: "middle" };

  async function emitirEnlace() {
    if (sel === null) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    setCopiado(false);
    try {
      const res = await apiFetch("/api/scheduling/guias/invitacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guiaUserId: sel.guiaUserId }),
      });
      const c: { enlace?: string; error?: { message?: string } } = await res.json();
      if (!res.ok) {
        setError(c.error?.message ?? "No se pudo generar el enlace.");
        return;
      }
      setEnlaceNuevo(c.enlace ?? null);
      setAviso("Enlace generado. Cópialo y envíaselo al guía: no se vuelve a mostrar.");
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function revocarEnlace() {
    if (sel === null) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch("/api/scheduling/guias/invitacion", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guiaUserId: sel.guiaUserId }),
      });
      if (!res.ok) {
        setError("No se pudo revocar el enlace.");
        return;
      }
      setEnlaceNuevo(null);
      setAviso("Enlace revocado: ya no sirve.");
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    if (enlaceNuevo === null) return;
    await navigator.clipboard.writeText(enlaceNuevo);
    setCopiado(true);
  }

  async function guardar() {
    if (sel === null) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch("/api/scheduling/guias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guiaUserId: sel.guiaUserId, ...form }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo guardar la ficha.");
        return;
      }
      if (fotoNueva !== null) {
        const fd = new FormData();
        fd.set("foto", fotoNueva);
        const rf = await apiFetch(`/api/scheduling/guias/${sel.guiaUserId}/foto`, {
          method: "POST",
          body: fd,
        });
        if (!rf.ok) {
          const c: { error?: { message?: string } } = await rf.json().catch(() => ({}));
          setError(`Se guardaron los datos, pero no la foto: ${c.error?.message ?? "error"}.`);
          await cargar();
          return;
        }
      }
      setAviso(`Ficha de ${nombreDeGuia(sel)} guardada.`);
      setEditando(false);
      elegirFoto(null);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  function cancelarEdicion() {
    if (sel !== null) setForm(formDe(sel));
    elegirFoto(null);
    setEditando(false);
    setError(null);
  }

  const estadoSel = sel === null ? undefined : enlaces[sel.guiaUserId];

  return (
    <main>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "0.35rem",
        }}
      >
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Guías</h1>
        <SoloSi op="op.guias.csv">
          <button
            type="button"
            onClick={() => descargarGuias(guias ?? [], enlaces)}
            disabled={guias === null || guias.length === 0}
            title="Descarga la ficha de todos los guías"
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: "0.6rem",
              border: "none",
              background: guias === null || guias.length === 0 ? "#9e9e9e" : "var(--lgs-verde)",
              color: "#1b2a10",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ⬇ Descargar CSV{guias !== null ? ` (${String(guias.length)})` : ""}
          </button>
        </SoloSi>
      </div>
      <p style={{ color: "var(--texto-suave)", marginBottom: "1.25rem" }}>
        Datos de contacto y sala de Zoom. Un guía nuevo se da de alta en{" "}
        <Link href="/panel/usuarios/guia">Usuarios y roles › Guía</Link>, con su ficha o con enlace;
        aquí se edita la ficha y se reenvía el enlace.
      </p>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, marginBottom: "0.8rem" }}>
          {error}
        </p>
      )}
      {aviso !== null && (
        <p style={{ color: "#1b5e20", fontWeight: 600, marginBottom: "0.8rem" }}>{aviso}</p>
      )}

      {sel === null ? (
        <section style={{ ...tarjeta, padding: "0.9rem 1rem" }}>
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por nombre, usuario, documento, correo o país"
            aria-label="Buscar guía"
            style={{ ...campo, maxWidth: "26rem", marginBottom: "0.6rem" }}
          />
          <div
            role="group"
            aria-label="Filtrar guías por estado"
            style={{ display: "flex", gap: "0.4rem", marginBottom: "0.75rem", flexWrap: "wrap" }}
          >
            {(["ACTIVO", "INACTIVO", "TODOS"] as const).map((op) => {
              const activo = filtroEstado === op;
              return (
                <button
                  key={op}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setFiltroEstado(op)}
                  style={{
                    padding: "0.3rem 0.8rem",
                    borderRadius: "999px",
                    border: `1.5px solid ${activo ? "var(--lgs-azul)" : "#d6dbe6"}`,
                    background: activo ? "var(--lgs-azul)" : "white",
                    color: activo ? "white" : "var(--texto-suave)",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {ETIQUETA_FILTRO[op]} ({conteo[op]})
                </button>
              );
            })}
          </div>
          {guias === null ? (
            <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
          ) : guias.length === 0 ? (
            <p style={{ color: "var(--texto-suave)" }}>
              No hay guías activos. Créalos en Usuarios y roles con el rol <strong>guia</strong>.
            </p>
          ) : visibles.length === 0 ? (
            <p style={{ color: "var(--texto-suave)" }}>
              Ningún guía {filtroEstado === "INACTIVO" ? "inactivo " : ""}coincide con la búsqueda.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid #e3e7f0" }}>
                    {[
                      "Guía",
                      "Documento",
                      "País",
                      "Correo",
                      "Teléfono",
                      "Sala de Zoom",
                      "Salones activos",
                      "Enlace de ficha",
                      "Estado",
                      "",
                    ].map((t) => (
                      <th key={t} style={th}>
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((g) => {
                    const e = enlaces[g.guiaUserId];
                    const sinZoom = g.zoomUrl === null || g.zoomUrl === "";
                    return (
                      <tr
                        key={g.guiaUserId}
                        onClick={() => abrir(g)}
                        title="Abrir la ficha del guía"
                        style={{
                          borderBottom: "1px solid #edf0f6",
                          cursor: "pointer",
                          opacity: g.estado === "ACTIVO" ? 1 : 0.6,
                        }}
                      >
                        <td style={td}>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <FotoGuia guia={g} />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: "block", fontWeight: 700 }}>
                                {nombreDeGuia(g)}
                              </span>
                              <span style={{ fontSize: "0.74rem", color: "var(--texto-suave)" }}>
                                {g.username}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td style={td}>{g.docNumero ?? "—"}</td>
                        <td style={td}>{g.pais ?? "—"}</td>
                        <td style={{ ...td, wordBreak: "break-all" }}>{g.email ?? "—"}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{g.telefono ?? "—"}</td>
                        <td style={td}>
                          {sinZoom ? (
                            <span style={{ color: "#c62828", fontWeight: 700 }}>Sin sala</span>
                          ) : (
                            <a
                              href={g.zoomUrl ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(ev) => ev.stopPropagation()}
                              style={{ fontWeight: 600 }}
                            >
                              🎥 Abrir
                            </a>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>
                          {g.salonesActivos}
                        </td>
                        <td style={td}>
                          {e === undefined ? (
                            <span style={{ color: "var(--texto-suave)" }}>—</span>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "0.1rem 0.5rem",
                                borderRadius: "1rem",
                                whiteSpace: "nowrap",
                                background: COLOR_ENLACE[e.estado].bg,
                                color: COLOR_ENLACE[e.estado].c,
                              }}
                            >
                              {COLOR_ENLACE[e.estado].txt}
                            </span>
                          )}
                        </td>
                        <td style={td}>
                          <PastillaEstado estado={g.estado} />
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>
                          <span style={{ color: "var(--lgs-azul)" }}>Ver ficha →</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <>
          <button
            type="button"
            onClick={volver}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              marginBottom: "0.75rem",
              color: "var(--lgs-azul)",
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            ← Volver a Guías
          </button>
          <section style={{ ...tarjeta, maxWidth: "52rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.7rem", flexWrap: "wrap" }}
              >
                <FotoGuia guia={sel} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>
                    {nombreDeGuia(sel)} <PastillaEstado estado={sel.estado} />
                  </h2>
                  <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                    {sel.username}
                    {sel.fotoFileId === null && " · sin foto"} · {sel.salonesActivos}{" "}
                    {sel.salonesActivos === 1 ? "salón activo" : "salones activos"}
                  </span>
                </div>
                {!editando && (
                  <SoloSi op="op.guias.ficha_editar">
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(true);
                        setAviso(null);
                      }}
                      style={{
                        padding: "0.5rem 1rem",
                        borderRadius: "0.6rem",
                        border: "1.5px solid var(--lgs-azul)",
                        background: "white",
                        color: "var(--lgs-azul-oscuro)",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        cursor: "pointer",
                      }}
                    >
                      ✏️ Editar ficha
                    </button>
                  </SoloSi>
                )}
                <SoloSi op="op.guias.estado">
                  <button
                    type="button"
                    onClick={() => void cambiarEstado()}
                    disabled={ocupado}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: "0.6rem",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      cursor: ocupado ? "wait" : "pointer",
                      ...(sel.estado === "ACTIVO"
                        ? { border: "1.5px solid #e57373", background: "white", color: "#c62828" }
                        : { border: "none", background: "var(--lgs-verde)", color: "#1b2a10" }),
                    }}
                  >
                    {sel.estado === "ACTIVO" ? "⏸ Desactivar guía" : "▶ Activar guía"}
                  </button>
                </SoloSi>
              </div>
              {sel.estado !== "ACTIVO" && (
                <p
                  style={{
                    margin: 0,
                    padding: "0.55rem 0.8rem",
                    borderRadius: "0.6rem",
                    background: "#ffebee",
                    color: "#b71c1c",
                    fontSize: "0.85rem",
                  }}
                >
                  Este guía está <strong>desactivado</strong>: no puede entrar al panel.
                </p>
              )}

              {/* Solo lectura hasta "Editar ficha": un fieldset deshabilitado
                  apaga todos sus campos de una vez. */}
              <fieldset
                className="ficha-guia"
                disabled={!editando || ocupado}
                style={{
                  border: "none",
                  padding: 0,
                  margin: 0,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.7rem",
                }}
              >
                {editando && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.8rem",
                      padding: "0.6rem 0.8rem",
                      border: "1px dashed #cfd6e6",
                      borderRadius: "0.7rem",
                      background: "#fbfcff",
                    }}
                  >
                    {previoFoto !== null ? (
                      // Vista previa local de la foto elegida (aún no subida).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previoFoto}
                        alt=""
                        style={{
                          width: "3.2rem",
                          height: "3.2rem",
                          borderRadius: "50%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <FotoGuia guia={sel} />
                    )}
                    <label style={{ flex: 1 }}>
                      <span style={rotulo}>Foto (JPG, PNG o WebP)</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => elegirFoto(e.target.files?.[0] ?? null)}
                        style={{ fontSize: "0.82rem" }}
                      />
                    </label>
                    {fotoNueva !== null && (
                      <button
                        type="button"
                        onClick={() => elegirFoto(null)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#8a2020",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                )}

                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}
                  className="guias-dos"
                >
                  <div>
                    <label style={rotulo} htmlFor="g-nom">
                      Nombres
                    </label>
                    <input
                      id="g-nom"
                      value={form.nombres}
                      onChange={(e) => setForm({ ...form, nombres: e.target.value })}
                      style={campo}
                    />
                  </div>
                  <div>
                    <label style={rotulo} htmlFor="g-ape">
                      Apellidos
                    </label>
                    <input
                      id="g-ape"
                      value={form.apellidos}
                      onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
                      style={campo}
                    />
                  </div>
                  <div>
                    <label style={rotulo} htmlFor="g-doc">
                      Documento
                    </label>
                    <input
                      id="g-doc"
                      value={form.docNumero}
                      onChange={(e) => setForm({ ...form, docNumero: e.target.value })}
                      style={campo}
                    />
                  </div>
                  <div>
                    <label style={rotulo} htmlFor="g-nac">
                      Fecha de nacimiento
                    </label>
                    <input
                      id="g-nac"
                      type="date"
                      value={form.fechaNacimiento}
                      onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
                      style={campo}
                    />
                  </div>
                  <div>
                    <label style={rotulo} htmlFor="g-mail">
                      Correo
                    </label>
                    <input
                      id="g-mail"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      style={campo}
                    />
                  </div>
                  <div>
                    <label style={rotulo} htmlFor="g-tel">
                      Teléfono
                    </label>
                    <input
                      id="g-tel"
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      style={campo}
                    />
                  </div>
                  <div>
                    <label style={rotulo} htmlFor="g-pais">
                      País
                    </label>
                    <select
                      id="g-pais"
                      value={form.pais}
                      onChange={(e) => setForm({ ...form, pais: e.target.value })}
                      style={campo}
                    >
                      <option value="">Sin país</option>
                      {PAISES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={rotulo} htmlFor="g-dom">
                      Domicilio
                    </label>
                    <input
                      id="g-dom"
                      value={form.domicilio}
                      onChange={(e) => setForm({ ...form, domicilio: e.target.value })}
                      style={campo}
                    />
                  </div>
                </div>

                <div>
                  <label style={rotulo} htmlFor="g-zoom">
                    Sala de Zoom
                  </label>
                  <input
                    id="g-zoom"
                    value={form.zoomUrl}
                    onChange={(e) => setForm({ ...form, zoomUrl: e.target.value })}
                    placeholder="https://zoom.us/j/NÚMERO"
                    style={campo}
                  />
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--texto-suave)",
                      marginTop: "0.2rem",
                    }}
                  >
                    Debe ser el enlace de la <strong>sala</strong>, no el de chat o contacto: ese
                    último le abre al alumno “Enviar solicitud de contacto” en vez de la clase. El
                    enlace de anfitrión (<code>/s/</code>) se convierte solo. Dos guías no pueden
                    compartir sala.
                  </p>
                </div>
              </fieldset>

              {editando && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void guardar()}
                    disabled={ocupado}
                    style={{
                      padding: "0.6rem 1.2rem",
                      borderRadius: "0.6rem",
                      border: "none",
                      background: "var(--lgs-azul)",
                      color: "white",
                      fontWeight: 700,
                      cursor: ocupado ? "wait" : "pointer",
                    }}
                  >
                    {ocupado ? "Guardando…" : "💾 Guardar cambios"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelarEdicion}
                    disabled={ocupado}
                    style={{
                      padding: "0.6rem 1.2rem",
                      borderRadius: "0.6rem",
                      border: "1.5px solid #d8dce6",
                      background: "white",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              )}

              <section
                style={{
                  border: "1px dashed #cfd6e6",
                  borderRadius: "0.7rem",
                  padding: "0.8rem 0.9rem",
                  background: "#fbfcff",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <strong style={{ fontSize: "0.9rem" }}>🔗 Enlace de registro</strong>
                  <p
                    style={{
                      fontSize: "0.76rem",
                      color: "var(--texto-suave)",
                      marginTop: "0.15rem",
                    }}
                  >
                    En vez de llenarle la ficha, envíale este enlace y él mismo carga sus datos, su
                    sala de Zoom y su foto. Sirve <strong>una sola vez</strong> y vence a los{" "}
                    {diasVigencia} días.
                  </p>
                </div>

                {estadoSel !== undefined && (
                  <p style={{ fontSize: "0.78rem" }}>
                    Último enlace:{" "}
                    <strong style={{ color: COLOR_ENLACE[estadoSel.estado].c }}>
                      {COLOR_ENLACE[estadoSel.estado].txt}
                    </strong>
                    {estadoSel.estado === "USADA" && estadoSel.usadoEn !== null
                      ? ` el ${new Date(estadoSel.usadoEn).toLocaleDateString("es-CL")}`
                      : estadoSel.estado === "VIGENTE"
                        ? ` · vence el ${new Date(estadoSel.expiraEn).toLocaleDateString("es-CL")}`
                        : ""}
                  </p>
                )}

                {enlaceNuevo !== null && (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.4rem",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <input
                      readOnly
                      value={enlaceNuevo}
                      onFocus={(e) => e.currentTarget.select()}
                      style={{
                        ...campo,
                        flex: 1,
                        minWidth: "14rem",
                        fontSize: "0.78rem",
                        background: "white",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void copiar()}
                      style={{
                        padding: "0.5rem 0.9rem",
                        borderRadius: "0.5rem",
                        border: "none",
                        background: copiado ? "var(--lgs-verde)" : "var(--lgs-azul)",
                        color: "white",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: "0.82rem",
                      }}
                    >
                      {copiado ? "✓ Copiado" : "Copiar"}
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <SoloSi op="op.guias.enlace">
                    <button
                      type="button"
                      onClick={() => void emitirEnlace()}
                      disabled={ocupado}
                      style={{
                        padding: "0.5rem 1rem",
                        borderRadius: "0.5rem",
                        border: "1.5px solid var(--lgs-azul)",
                        background: "white",
                        color: "var(--lgs-azul-oscuro)",
                        fontWeight: 700,
                        cursor: ocupado ? "wait" : "pointer",
                        fontSize: "0.82rem",
                      }}
                    >
                      {estadoSel?.estado === "VIGENTE"
                        ? "↻ Generar uno nuevo"
                        : "🔗 Generar enlace"}
                    </button>
                  </SoloSi>
                  {estadoSel?.estado === "VIGENTE" && (
                    <SoloSi op="op.guias.enlace">
                      <button
                        type="button"
                        onClick={() => void revocarEnlace()}
                        disabled={ocupado}
                        style={{
                          padding: "0.5rem 1rem",
                          borderRadius: "0.5rem",
                          border: "1.5px solid #e0e4ee",
                          background: "white",
                          color: "#8a2020",
                          fontWeight: 700,
                          cursor: ocupado ? "wait" : "pointer",
                          fontSize: "0.82rem",
                        }}
                      >
                        Revocar
                      </button>
                    </SoloSi>
                  )}
                </div>
              </section>
            </div>
          </section>
        </>
      )}

      <style>{`@media (max-width: 860px) { .guias-dos { grid-template-columns: 1fr !important; } }
.ficha-guia :disabled { background: #f6f8fb; color: #2b2f3a; opacity: 1; cursor: default; }`}</style>
    </main>
  );
}
