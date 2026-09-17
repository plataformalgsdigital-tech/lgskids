"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { estadoZoom } from "@/ui/zoom-window";
import { ZoomAccessButton } from "@/ui/ZoomAccessButton";
import { Personaje, VacioConPersonaje, poseZoom } from "@/ui/Personaje";
import { apiFetch } from "@/ui/api-fetch";
import { cerrarSesion, useReinicioAlVolver } from "@/ui/sesion";

/** Marca que ya se ofreció subir la foto: no se insiste en cada visita. */
const FOTO_OFRECIDA = "lgs-kids:foto-ofrecida";

interface Dashboard {
  alumno: { nombre: string } | null;
  matricula: {
    salon: string;
    campania: string;
    tipoCurso: string;
    guia: string | null;
    meetingUrl: string | null;
  } | null;
  asistencia?: {
    asistidas: number;
    ausentes: number;
    justificadas: number;
    totalSesiones: number;
  };
  proxima?: {
    sessionId: string;
    tipo: string;
    fecha: string;
    startsAt: string;
    duracionMin: number;
    guia: string | null;
  } | null;
  /** Talleres próximos del salón: actividad puntual, no el horario de siempre. */
  talleres?: {
    sessionId: string;
    tipo: string;
    fecha: string;
    startsAt: string;
    duracionMin: number;
    guia: string | null;
    observaciones: string | null;
    nivel: string | null;
  }[];
  agenda?: {
    sessionId: string;
    tipo: string;
    fecha: string;
    startsAt: string;
    guia: string | null;
  }[];
  progreso?: {
    niveles: {
      levelId: string;
      codigo: string;
      nombre: string;
      orden: number;
      leccionesCompletadas: number;
      totalLecciones: number;
      levelUpAprobado: boolean;
      estado: "EN_CURSO" | "COMPLETADO" | "PENDIENTE";
      medalla: boolean;
    }[];
    diploma: boolean;
  };
  comentarios?: ComentarioGuia[];
  historial?: {
    sessionId: string;
    tipo: string;
    fecha: string;
    numero: number;
    estado: "PRESENTE" | "AUSENTE" | "JUSTIFICADO" | null;
  }[];
  imagenCursoUrl?: string | null;
  premios?: Record<string, string | null>; // premio por código de nivel (imagen)
  /** Láminas de unidad: { NIVEL: { "1": url|null, ... } } */
  unidades?: Record<string, Record<string, string | null>> | null;
  /**
   * Juegos por unidad: { NIVEL: { "1": [{nombre,enlace}], ... } }. `x`/`y` es el
   * centro de su cartel sobre la lámina y `w`/`h` el recuadro que lo cubre.
   */
  juegosUnidad?: Record<
    string,
    Record<
      string,
      { nombre: string; enlace: string; x?: number; y?: number; w?: number; h?: number }[]
    >
  > | null;
  bannersNivel?: Record<string, string | null>; // mapa de isla por código de nivel
  mapaCursoUrl?: string | null; // mapa del curso completo
  voboUrl?: string | null; // sello VoBo
  hotspots?: {
    isla: Record<string, HotspotData>;
    mapa: Record<string, HotspotData>;
  };
}

interface ComentarioGuia {
  sessionId: string;
  fecha: string;
  tipo: string;
  numero: number;
  guia: string | null;
  comentario: string;
}

interface Perfil {
  nombre: string;
  correo: string | null;
  telefono: string | null;
  cumpleanos: string | null;
  usuario: string | null;
  apoderado: {
    nombre: string;
    parentesco: string | null;
    telefono: string | null;
    email: string | null;
  } | null;
  tieneFoto: boolean;
  fotoUrl: string | null;
}

interface HotspotData {
  unidades: { x: number; y: number }[];
  premio: { x: number; y: number } | null;
  centro: { x: number; y: number } | null;
}

const COLOR_NIVEL: Record<string, string> = {
  ROOKIE: "var(--lgs-verde)",
  CHAMPION: "var(--lgs-cian)",
  ELITE: "var(--lgs-amarillo)",
  LEGENDARY: "var(--lgs-magenta)",
  ULTIMATE: "var(--lgs-purpura)",
};

// Premio al final del mapa de cada nivel (icono): sombreado hasta completar, vivo al completar.
const PREMIO_NIVEL: Record<string, string> = {
  ROOKIE: "🧭",
  CHAMPION: "🔑",
  ELITE: "👑",
  LEGENDARY: "⭐",
  ULTIMATE: "💰",
};

const DESC_CURSO: Record<string, { titulo: string; edad: string; desc: string }> = {
  JUNIOR: {
    titulo: "JUNIOR",
    edad: "6–9 años",
    desc: "Inglés en vivo con juegos, canciones y misiones para dar tus primeros pasos con confianza.",
  },
  YOUNGSTER: {
    titulo: "YOUNGSTER",
    edad: "10–13 años",
    desc: "Inglés en vivo con retos, conversación y proyectos para dominar el idioma paso a paso.",
  },
};

const card: CSSProperties = {
  background: "white",
  borderRadius: "1rem",
  padding: "1.25rem",
  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
};

// Ruta del logo de WhatsApp (relleno blanco sobre el círculo de color).
const WHATSAPP_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

// Canales de asistencia (WhatsApp). TODO: reemplazar `tel` por los números reales.
const SOPORTE: { label: string; tel: string; color: string; msg: string }[] = [
  {
    label: "Soporte Usuario",
    tel: "573000000000",
    color: "var(--lgs-azul)",
    msg: "Hola, necesito ayuda con mi cuenta de LGS Kids.",
  },
  {
    label: "Soporte Académico",
    tel: "573000000000",
    color: "var(--lgs-verde)",
    msg: "Hola, tengo una duda académica de LGS Kids.",
  },
  {
    label: "Finanzas",
    tel: "573000000000",
    color: "var(--lgs-magenta)",
    msg: "Hola, tengo una consulta de pagos de LGS Kids.",
  },
];

// Barra de navegación bajo el encabezado (estilo MOSAICO). Los que tienen href
// hacen scroll a la sección de la página; el resto queda como acceso futuro.
const NAV_ITEMS: {
  label: string;
  emoji: string;
  href?: string;
  menu?: boolean;
  action?: "comovoy" | "historial" | "avance" | "perfil";
}[] = [
  { label: "Actividades", emoji: "✨", menu: true },
  { label: "Recursos", emoji: "🔗", menu: true },
  // Material: aquí irá el nuevo cuadernillo, diseñado desde cero. El visor
  // anterior se retiró (2026-09-17); hasta entonces queda como acceso futuro.
  { label: "Material", emoji: "📖" },
  { label: "Historial", emoji: "📘", action: "historial" },
  { label: "Avance", emoji: "🗺️", action: "avance" },
  { label: "¿Cómo voy?", emoji: "📊", action: "comovoy" },
  { label: "Instructivos", emoji: "🎥" },
  { label: "Perfil", emoji: "👤", action: "perfil" },
];

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
}
function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MiPanelPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [ahora, setAhora] = useState<number>(() => Date.now());
  const [ingreso, setIngreso] = useState(false); // ya entró a la clase (reconexión)
  const [verImagen, setVerImagen] = useState(false); // lightbox del banner del curso
  const [verComoVoy, setVerComoVoy] = useState(false); // modal "¿Cómo voy?"
  const [verHistorial, setVerHistorial] = useState(false); // modal "Historial de clases"
  const [verAvance, setVerAvance] = useState(false); // modal "Avance" (mapa del curso)
  const [verPerfil, setVerPerfil] = useState(false); // modal "Perfil"
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  // Sella el ofrecimiento inicial de foto para no insistir en cada visita.
  const [fotoOfrecida, setFotoOfrecida] = useState(false);
  const [avanceNivel, setAvanceNivel] = useState<string | null>(null);
  /** Unidad abierta desde el mapa de la isla: { nivel, unidad 1..4 }. */
  const [unidadAbierta, setUnidadAbierta] = useState<{ nivel: string; unidad: number } | null>(
    null,
  ); // isla abierta (código de nivel) o null = mapa
  const [nivelesAbiertos, setNivelesAbiertos] = useState<Set<string>>(() => new Set()); // acordeón de niveles

  function toggleNivel(levelId: string) {
    setNivelesAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(levelId)) next.delete(levelId);
      else next.add(levelId);
      return next;
    });
  }

  useReinicioAlVolver();

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Cerrar overlays (lightbox / modales) con la tecla Escape
  useEffect(() => {
    if (!verImagen && !verComoVoy && !verHistorial && !verAvance) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setVerImagen(false);
        setVerComoVoy(false);
        setVerHistorial(false);
        if (avanceNivel !== null) setAvanceNivel(null);
        else setVerAvance(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [verImagen, verComoVoy, verHistorial, verAvance, verPerfil, avanceNivel]);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      let res = await fetch("/api/student/dashboard");
      if (res.status === 401) {
        const refresh = await fetch("/api/auth/refresh", { method: "POST" });
        if (!refresh.ok) {
          router.replace("/login");
          return;
        }
        res = await fetch("/api/student/dashboard");
      }
      if (res.status === 403) {
        router.replace("/panel");
        return;
      }
      if (!res.ok) {
        router.replace("/login");
        return;
      }
      if (!cancelado) setData((await res.json()) as Dashboard);
    }
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelado = false;
    async function cargarPerfil() {
      const res = await apiFetch("/api/student/perfil");
      if (!res.ok || cancelado) return;
      const cuerpo = (await res.json()) as { perfil: Perfil | null };
      if (cancelado || cuerpo.perfil === null) return;
      setPerfil(cuerpo.perfil);
      // Primera vez sin foto: se abre el perfil para ofrecerla. Se marca en el
      // navegador para no insistir en cada visita.
      if (!cuerpo.perfil.tieneFoto && localStorage.getItem(FOTO_OFRECIDA) === null) {
        localStorage.setItem(FOTO_OFRECIDA, "1");
        setFotoOfrecida(true);
        setVerPerfil(true);
      }
    }
    void cargarPerfil();
    return () => {
      cancelado = true;
    };
  }, []);

  async function subirFoto(archivo: File) {
    setSubiendoFoto(true);
    setErrorFoto(null);
    try {
      const form = new FormData();
      form.append("foto", archivo);
      const res = await apiFetch("/api/student/perfil", { method: "POST", body: form });
      if (!res.ok) {
        const cuerpo: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setErrorFoto(cuerpo.error?.message ?? "No se pudo subir la foto.");
        return;
      }
      const recarga = await apiFetch("/api/student/perfil");
      if (!recarga.ok) return;
      const cuerpo = (await recarga.json()) as { perfil: Perfil | null };
      if (cuerpo.perfil === null) return;
      // La URL de la foto no cambia: se le agrega una marca para recargarla.
      setPerfil({
        ...cuerpo.perfil,
        fotoUrl: "/api/student/perfil/foto?v=" + String(Date.now()),
      });
      setFotoOfrecida(false);
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function salir() {
    await cerrarSesion();
  }

  const proxSessionId = data?.proxima?.sessionId ?? null;
  useEffect(() => {
    function sync() {
      try {
        setIngreso(
          proxSessionId !== null && localStorage.getItem(`zoom-acceso-${proxSessionId}`) === "1",
        );
      } catch {
        setIngreso(false);
      }
    }
    sync();
  }, [proxSessionId]);

  function entrarZoom() {
    if (proxSessionId !== null) {
      try {
        localStorage.setItem(`zoom-acceso-${proxSessionId}`, "1");
      } catch {
        /* localStorage no disponible: la reconexión no persiste, no es crítico */
      }
    }
    setIngreso(true);
  }

  if (data === null) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando tu panel…</p>
      </main>
    );
  }

  const niveles = data.progreso?.niveles ?? [];
  const nivelActual =
    niveles.find((n) => n.estado === "EN_CURSO") ?? niveles.find((n) => n.estado !== "COMPLETADO");
  const ordenActual = nivelActual?.orden;
  const nivelAnterior =
    ordenActual !== undefined ? niveles.find((n) => n.orden === ordenActual - 1) : undefined;
  const nivelProximo =
    ordenActual !== undefined ? niveles.find((n) => n.orden === ordenActual + 1) : undefined;
  const totalLecc = niveles.reduce((a, n) => a + n.totalLecciones, 0);
  const compl = niveles.reduce((a, n) => a + n.leccionesCompletadas, 0);
  const leccionActual =
    nivelActual !== undefined
      ? Math.min(nivelActual.leccionesCompletadas + 1, nivelActual.totalLecciones)
      : null;

  const inicioProxima = data.proxima != null ? new Date(data.proxima.startsAt).getTime() : null;
  const estadoZoomActual =
    inicioProxima !== null && data.proxima != null
      ? estadoZoom({
          inicioMs: inicioProxima,
          ahoraMs: ahora,
          duracionMin: Number(data.proxima.duracionMin) || 60,
          tieneAcceso: ingreso,
        })
      : null;

  const nombreAlumno = data.alumno?.nombre ?? "";
  const partesNombre = nombreAlumno.split(" ").filter(Boolean);
  const iniciales =
    (
      (partesNombre[0]?.[0] ?? "") +
      (partesNombre.length > 1 ? (partesNombre[partesNombre.length - 1]?.[0] ?? "") : "")
    ).toUpperCase() || "🙂";

  const tipo = data.matricula?.tipoCurso ?? "JUNIOR";
  const curso = DESC_CURSO[tipo] ?? DESC_CURSO["JUNIOR"]!;
  // Los personajes solo acompañan a JUNIOR; en Youngster resultan infantiles.
  const esJunior = tipo === "JUNIOR";
  const colorNivel =
    nivelActual !== undefined
      ? (COLOR_NIVEL[nivelActual.codigo] ?? "var(--lgs-azul)")
      : "var(--lgs-azul)";

  const moduloBox: CSSProperties = {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    padding: "0.6rem 0.4rem",
    borderRadius: "0.7rem",
    border: "1px solid #e3e7f0",
    background: "#fafbfe",
  };

  // Métricas del nivel actual para el modal "¿Cómo voy?"
  const pctNivelActual =
    nivelActual !== undefined
      ? Math.round(
          (nivelActual.leccionesCompletadas / Math.max(nivelActual.totalLecciones, 1)) * 100,
        )
      : 0;
  const faltanNivel =
    nivelActual !== undefined
      ? Math.max(nivelActual.totalLecciones - nivelActual.leccionesCompletadas, 0)
      : 0;
  const asistPct =
    data.asistencia != null && data.asistencia.totalSesiones > 0
      ? Math.round((data.asistencia.asistidas / data.asistencia.totalSesiones) * 100)
      : 0;
  const nivelesCompletados = niveles.filter((n) => n.estado === "COMPLETADO").length;

  // Acordeón de niveles → Stages (se muestra dentro del modal "¿Cómo voy?")
  const listaNiveles = (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {niveles.map((nivel) => {
        const completado = nivel.estado === "COMPLETADO";
        const abierto = nivelesAbiertos.has(nivel.levelId);
        const colorN = COLOR_NIVEL[nivel.codigo] ?? "var(--lgs-azul)";
        return (
          <div
            key={nivel.levelId}
            style={{
              border: "1px solid #edf0f6",
              borderLeft: `5px solid ${colorN}`,
              borderRadius: "0.7rem",
              overflow: "hidden",
              opacity: nivel.estado === "PENDIENTE" ? 0.7 : 1,
            }}
          >
            {/* Header clicable: despliega/colapsa las Stages */}
            <button
              type="button"
              onClick={() => toggleNivel(nivel.levelId)}
              aria-expanded={abierto}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.7rem 0.9rem",
                background: abierto ? "#fafbfe" : "transparent",
                border: "none",
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
              }}
            >
              {/* Premio del mapa: imagen si existe (respaldo emoji); sombreado hasta completar, vivo al completar */}
              {(() => {
                const premioUrl = data.premios?.[nivel.codigo] ?? null;
                const estilo: CSSProperties = {
                  flex: "none",
                  width: "1.9rem",
                  height: "1.9rem",
                  filter: completado ? "none" : "grayscale(1)",
                  opacity: completado ? 1 : 0.35,
                  transform: completado ? "scale(1)" : "scale(0.92)",
                  transition: "opacity .2s, filter .2s, transform .2s",
                };
                return premioUrl !== null ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={completado ? "lgs-shine" : undefined}
                    src={premioUrl}
                    alt={`Premio ${nivel.nombre}`}
                    title={completado ? "¡Premio conseguido!" : "Premio por completar el nivel"}
                    style={{ ...estilo, objectFit: "contain" }}
                  />
                ) : (
                  <span
                    aria-hidden
                    className={completado ? "lgs-shine" : undefined}
                    title={completado ? "¡Premio conseguido!" : "Premio por completar el nivel"}
                    style={{
                      ...estilo,
                      fontSize: "1.7rem",
                      lineHeight: "1.9rem",
                      textAlign: "center",
                    }}
                  >
                    {PREMIO_NIVEL[nivel.codigo] ?? "🏅"}
                  </span>
                );
              })()}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <strong>{nivel.nombre}</strong>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--texto-suave)",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    {nivel.leccionesCompletadas}/{nivel.totalLecciones} ·{" "}
                    {nivel.levelUpAprobado ? "Level Up ✅" : "Level Up ⏳"}
                    <span
                      aria-hidden
                      style={{
                        fontSize: "0.7rem",
                        transition: "transform .2s",
                        transform: abierto ? "rotate(90deg)" : "none",
                        color: colorN,
                        fontWeight: 900,
                      }}
                    >
                      ▸
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    marginTop: "0.4rem",
                    height: "0.45rem",
                    borderRadius: "0.25rem",
                    background: "#eef1f7",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(nivel.leccionesCompletadas / Math.max(nivel.totalLecciones, 1)) * 100}%`,
                      height: "100%",
                      background: colorN,
                    }}
                  />
                </div>
              </div>
            </button>

            {/* Stages del nivel (Stage 1..N + Level Up) */}
            {abierto && (
              <div
                style={{
                  padding: "0.2rem 0.9rem 0.8rem 0.9rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                {Array.from({ length: nivel.totalLecciones }).map((_, i) => {
                  const n = i + 1;
                  const hecha = n <= nivel.leccionesCompletadas;
                  const enCurso =
                    n === nivel.leccionesCompletadas + 1 && nivel.estado !== "COMPLETADO";
                  return (
                    <div
                      key={n}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.5rem",
                        background: enCurso ? "#f3eefc" : "#fafbfe",
                        border: `1px solid ${enCurso ? colorN : "#edf0f6"}`,
                      }}
                    >
                      <span aria-hidden style={{ fontSize: "1rem" }}>
                        {hecha ? "✅" : enCurso ? "▶️" : "🔒"}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Unidad {n}</span>
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: "0.76rem",
                          color: "var(--texto-suave)",
                        }}
                      >
                        {hecha ? "Completada" : enCurso ? "En curso" : "Bloqueada"}
                      </span>
                    </div>
                  );
                })}
                {/* Level Up final del nivel */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "0.5rem",
                    background: "#fff8e1",
                    border: "1px solid var(--lgs-amarillo)",
                  }}
                >
                  <span aria-hidden style={{ fontSize: "1rem" }}>
                    {nivel.levelUpAprobado ? "🏆" : "⏳"}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: "0.88rem" }}>Level Up</span>
                  <span
                    style={{ marginLeft: "auto", fontSize: "0.76rem", color: "var(--texto-suave)" }}
                  >
                    {nivel.levelUpAprobado ? "Aprobado" : "Pendiente"}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // Contenido del historial de clases (se muestra dentro del modal "Historial")
  const listaHistorial =
    data.historial === undefined || data.historial.length === 0 ? (
      esJunior ? (
        <VacioConPersonaje
          quien="emma-triste"
          titulo="Todavía no hay clases dictadas."
          detalle="Cuando tengas tu primera sesión, aquí vas a ver si asististe."
        />
      ) : (
        <p style={{ color: "var(--texto-suave)" }}>Todavía no hay clases dictadas.</p>
      )
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {data.historial.map((h) => {
          const b =
            h.estado === "PRESENTE"
              ? { txt: "✔ Asistió", c: "#1b5e20", bg: "#e8f5e9" }
              : h.estado === "AUSENTE"
                ? { txt: "✘ Ausente", c: "#c62828", bg: "#ffebee" }
                : h.estado === "JUSTIFICADO"
                  ? { txt: "📝 Justificado", c: "#8a6d00", bg: "#fff8e1" }
                  : { txt: "— sin registro —", c: "#9e9e9e", bg: "#f5f5f5" };
          return (
            <div
              key={h.sessionId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 0.9rem",
                borderRadius: "0.6rem",
                background: "#fafbfe",
                flexWrap: "wrap",
                gap: "0.3rem",
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {h.tipo === "CLUB" ? "🎉 Club" : `📘 Sesión ${h.numero}`} ·{" "}
                {fechaLarga(`${h.fecha}T12:00:00`)}
              </span>
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: b.c,
                  background: b.bg,
                  padding: "0.15rem 0.6rem",
                  borderRadius: "1rem",
                }}
              >
                {b.txt}
              </span>
            </div>
          );
        })}
      </div>
    );

  // Sello VoBo (imagen subida o respaldo con check verde)
  const voboEl = (size: string) =>
    data.voboUrl != null ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="lgs-float"
        src={data.voboUrl}
        alt="VoBo"
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,.35))",
        }}
      />
    ) : (
      <span
        className="lgs-float"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "#fff",
          border: "2px solid var(--lgs-verde)",
          display: "grid",
          placeItems: "center",
          fontSize: `calc(${size} * 0.58)`,
          boxShadow: "0 2px 6px rgba(0,0,0,.3)",
        }}
      >
        ✅
      </span>
    );

  // Marcador posicionado por hotspot (%). `node` es el contenido (VoBo, premio…).
  /**
   * Botón de una unidad sobre un mapa de isla. `marca` pone
   * `pointerEvents:none` en el contenedor, así que el botón lo repone; y frena
   * la propagación porque el banner de arriba abre el lightbox al clic.
   *
   * Se pintan TODAS las unidades, no solo las vistas: la lámina se puede
   * consultar aunque el niño no haya llegado.
   */
  const botonUnidad = (nivelCodigo: string, indice: number, vistas: number, tam: string) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setUnidadAbierta({ nivel: nivelCodigo, unidad: indice + 1 });
      }}
      title={`Unidad ${String(indice + 1)}`}
      aria-label={`Abrir la Unidad ${String(indice + 1)}`}
      style={{
        pointerEvents: "auto",
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
        display: "block",
        width: tam,
        height: tam,
      }}
    >
      {indice < vistas ? (
        voboEl(tam)
      ) : (
        <span
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            border: "2px dashed rgba(255,255,255,.75)",
            background: "rgba(20,25,50,.25)",
          }}
        />
      )}
    </button>
  );

  const marca = (key: string, p: { x: number; y: number }, node: ReactNode) => (
    <div
      key={key}
      style={{
        position: "absolute",
        left: `${p.x}%`,
        top: `${p.y}%`,
        transform: "translate(-50%,-50%)",
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {node}
    </div>
  );

  // Línea de ruta (dotted) que une las unidades y termina en el premio/centro,
  // con puntos que se MUEVEN a lo largo del camino (animación). Coordenadas en %.
  const rutaSVG = (puntos: { x: number; y: number }[]) => {
    if (puntos.length < 2) return null;
    const pts = puntos.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        {/* Realce suave para contraste sobre el mapa */}
        <polyline
          points={pts}
          fill="none"
          stroke="rgba(20,25,50,0.35)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Ruta punteada animada */}
        <polyline
          className="lgs-ruta"
          points={pts}
          fill="none"
          stroke="#ffe27a"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="0.1 9"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #eef4ff 0%, #f7f0ff 100%)",
      }}
    >
      {/* Animaciones (Fase C): VoBo flota, premio brilla, unidad actual late. Respeta reduce-motion. */}
      <style>{`
        @keyframes lgsFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes lgsPulse{0%{transform:scale(.7);opacity:.9}100%{transform:scale(1.9);opacity:0}}
        @keyframes lgsShine{0%,100%{filter:drop-shadow(0 0 1px rgba(255,214,0,.45))}50%{filter:drop-shadow(0 0 9px rgba(255,214,0,.95))}}
        @keyframes lgsRuta{to{stroke-dashoffset:-90}}
        .lgs-float{animation:lgsFloat 2.6s ease-in-out infinite}
        .lgs-ring{animation:lgsPulse 1.4s ease-out infinite}
        .lgs-shine{animation:lgsShine 1.8s ease-in-out infinite}
        .lgs-ruta{animation:lgsRuta 3s linear infinite}
        /* Cartel-enlace de la lámina: transparente para no tapar el dibujo,
           con un halo que late para decir "esto se toca". */
        @keyframes lgsCartel{0%,100%{box-shadow:0 0 0 0 rgba(255,214,0,0)}50%{box-shadow:0 0 14px 3px rgba(255,214,0,.55)}}
        .lgs-cartel{animation:lgsCartel 2.4s ease-in-out infinite;background:transparent;outline:none}
        .lgs-cartel:hover,.lgs-cartel:focus-visible{animation:none;background:rgba(255,214,0,.28);box-shadow:0 0 0 3px rgba(255,214,0,.95)}
        @media (prefers-reduced-motion:reduce){.lgs-float,.lgs-ring,.lgs-shine,.lgs-ruta,.lgs-cartel{animation:none}}
        /* Dos columnas 5/4: la izquierda carga el banner del curso, que es la
           pieza alta. Debajo de 62rem se apilan. */
        .lgs-dos-col{grid-template-columns:1fr}
        @media (min-width:62rem){.lgs-dos-col{grid-template-columns:5fr 4fr}}
      `}</style>
      {/* Barra superior */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "0.85rem 1.5rem",
          background: "white",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: "2.9rem",
              height: "2.9rem",
              flex: "none",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              color: "white",
              background: "linear-gradient(135deg, var(--lgs-azul) 0%, var(--lgs-magenta) 100%)",
            }}
          >
            {iniciales}
          </span>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: "1.25rem",
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              ¡Hola, {nombreAlumno || "campeón"}! 👋
            </h1>
            <p style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>Panel del estudiante</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flex: "none" }}>
          {nivelActual !== undefined && (
            <span
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "1rem",
                fontWeight: 800,
                fontSize: "0.82rem",
                color: "white",
                background: colorNivel,
                whiteSpace: "nowrap",
              }}
            >
              {nivelActual.nombre}
              {leccionActual !== null && ` · Lección ${String(leccionActual).padStart(2, "0")}`}
            </span>
          )}
          <button
            onClick={() => void salir()}
            title="Cerrar sesión"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.6rem",
              border: "1px solid #e3e7f0",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {/* Barra de secciones (estilo MOSAICO): un botón de Clubes + accesos hasta Perfil */}
      <nav
        aria-label="Secciones del panel"
        style={{
          background: "white",
          borderTop: "1px solid #eef1f7",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
          padding: "0.5rem 1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => document.getElementById("agenda")?.scrollIntoView({ behavior: "smooth" })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            padding: "0.5rem 1.1rem",
            borderRadius: "0.6rem",
            border: "none",
            background: "var(--lgs-verde)",
            color: "#1b2a10",
            fontWeight: 800,
            fontSize: "0.9rem",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          📅 Inscripción Clubes
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.15rem",
            marginLeft: "auto",
            flexWrap: "wrap",
          }}
        >
          {NAV_ITEMS.map((it) => {
            const base: CSSProperties = {
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.5rem 0.7rem",
              borderRadius: "0.6rem",
              color: "var(--texto-suave)",
              fontWeight: 700,
              fontSize: "0.85rem",
              textDecoration: "none",
              whiteSpace: "nowrap",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            };
            const inner = (
              <>
                <span aria-hidden style={{ fontSize: "0.95rem" }}>
                  {it.emoji}
                </span>
                <span>{it.label}</span>
                {it.menu === true && (
                  <span aria-hidden style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                    ▾
                  </span>
                )}
              </>
            );
            if (it.href !== undefined) {
              return (
                <a key={it.label} href={it.href} style={base}>
                  {inner}
                </a>
              );
            }
            if (it.action === "comovoy") {
              return (
                <button
                  key={it.label}
                  type="button"
                  onClick={() => setVerComoVoy(true)}
                  style={base}
                >
                  {inner}
                </button>
              );
            }
            if (it.action === "historial") {
              return (
                <button
                  key={it.label}
                  type="button"
                  onClick={() => setVerHistorial(true)}
                  style={base}
                >
                  {inner}
                </button>
              );
            }
            if (it.action === "perfil") {
              return (
                <button
                  key={it.label}
                  type="button"
                  onClick={() => setVerPerfil(true)}
                  style={base}
                >
                  {inner}
                </button>
              );
            }
            if (it.action === "avance") {
              return (
                <button
                  key={it.label}
                  type="button"
                  onClick={() => {
                    setAvanceNivel(null);
                    setVerAvance(true);
                  }}
                  style={base}
                >
                  {inner}
                </button>
              );
            }
            return (
              <button
                key={it.label}
                type="button"
                title="Próximamente"
                style={{ ...base, opacity: 0.6 }}
              >
                {inner}
              </button>
            );
          })}
        </div>
      </nav>

      {data.matricula === null ? (
        <main style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", color: "var(--texto-suave)" }}>
            Aún no estás matriculado en un salón. En cuanto tu apoderado complete la inscripción,
            aquí verás tus clases. 🎒
          </p>
        </main>
      ) : (
        <main
          style={{
            maxWidth: "72rem",
            margin: "0 auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Encabezado del curso: el texto vive AQUÍ (no sobre la imagen) para que el banner se vea limpio */}
          <section
            style={{
              ...card,
              padding: "0.75rem 1rem",
              borderLeft: `5px solid ${colorNivel}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  color: "var(--texto-suave)",
                  letterSpacing: "0.08em",
                }}
              >
                LGS KIDS · {curso.edad}
              </span>
              <div
                style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}
              >
                <h2 style={{ fontSize: "1.25rem", fontWeight: 900, lineHeight: 1.1, margin: 0 }}>
                  {curso.titulo}
                </h2>
                <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                  {curso.desc}
                </span>
              </div>
            </div>
            {nivelActual !== undefined && (
              <span
                style={{
                  flex: "none",
                  padding: "0.3rem 0.8rem",
                  borderRadius: "1rem",
                  background: colorNivel,
                  color: "white",
                  fontWeight: 800,
                  fontSize: "0.8rem",
                  whiteSpace: "nowrap",
                }}
              >
                Nivel {nivelActual.nombre}
              </span>
            )}
          </section>

          <div
            style={{
              display: "grid",
              gap: "1.25rem",
            }}
            className="lgs-dos-col"
          >
            {/* Columna izquierda: imagen del curso + info + sesión próxima */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Banner del curso: imagen LIMPIA (el texto vive en el encabezado, arriba). Clic → verla en grande. */}
              <div
                onClick={data.imagenCursoUrl != null ? () => setVerImagen(true) : undefined}
                role={data.imagenCursoUrl != null ? "button" : undefined}
                tabIndex={data.imagenCursoUrl != null ? 0 : undefined}
                onKeyDown={
                  data.imagenCursoUrl != null
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setVerImagen(true);
                        }
                      }
                    : undefined
                }
                aria-label={
                  data.imagenCursoUrl != null ? "Ver la imagen del curso en grande" : undefined
                }
                title={data.imagenCursoUrl != null ? "Clic para ver más grande" : undefined}
                style={{
                  position: "relative",
                  borderRadius: "1rem",
                  overflow: "hidden",
                  aspectRatio: "16 / 9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: data.imagenCursoUrl != null ? "zoom-in" : "default",
                  background:
                    data.imagenCursoUrl == null
                      ? `linear-gradient(140deg, ${colorNivel} 0%, #1b2140 130%)`
                      : "#0a0e1e",
                  boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
                }}
              >
                {data.imagenCursoUrl != null ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={data.imagenCursoUrl}
                      alt={`Curso ${curso.titulo}${nivelActual !== undefined ? ` · Nivel ${nivelActual.nombre}` : ""}`}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                    {/*
                      Unidades sobre el banner del panel: el niño no tiene por
                      qué entrar a Avance para abrir su unidad. Los hotspots van
                      en % de la IMAGEN y el banner se pinta con `cover` en
                      16:9, que es la proporción recomendada del arte.
                    */}
                    {(data.hotspots?.isla?.[nivelActual?.codigo ?? ""]?.unidades ?? []).map(
                      (p, i) =>
                        marca(
                          `banner-u${String(i)}`,
                          p,
                          botonUnidad(
                            nivelActual?.codigo ?? "",
                            i,
                            nivelActual?.leccionesCompletadas ?? 0,
                            "2.1rem",
                          ),
                        ),
                    )}
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        bottom: "0.5rem",
                        right: "0.6rem",
                        padding: "0.2rem 0.55rem",
                        borderRadius: "1rem",
                        background: "rgba(10,14,30,0.55)",
                        color: "white",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      🔍 Ver grande
                    </span>
                  </>
                ) : (
                  <span aria-hidden style={{ fontSize: "3.5rem", opacity: 0.85, lineHeight: 1 }}>
                    {tipo === "YOUNGSTER" ? "🚀" : "🧩"}
                  </span>
                )}
              </div>

              {/* Info del curso */}
              <section style={{ ...card, borderLeft: `6px solid ${colorNivel}` }}>
                <p style={{ fontSize: "1.2rem", fontWeight: 800 }}>{tipo}</p>
                <p style={{ fontSize: "0.9rem", color: "var(--texto-suave)" }}>
                  Campaña: {data.matricula.campania} · Salón: {data.matricula.salon}
                </p>
                {data.matricula.guia !== null && (
                  <p style={{ marginTop: "0.6rem", fontSize: "0.9rem" }}>
                    <span
                      style={{ color: "var(--texto-suave)", fontSize: "0.78rem", fontWeight: 700 }}
                    >
                      GUÍA
                    </span>
                    <br />
                    {data.matricula.guia}
                  </p>
                )}
              </section>

              {/* Sesión próxima */}
              <section style={card}>
                <h2
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 800,
                    color: "var(--lgs-purpura)",
                    letterSpacing: "0.05em",
                  }}
                >
                  SESIÓN PRÓXIMA
                </h2>
                {data.proxima != null ? (
                  <>
                    <p style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: "0.35rem" }}>
                      {data.proxima.tipo === "CLUB" ? "Club" : "Sesión"} ·{" "}
                      {fechaLarga(data.proxima.startsAt)}
                    </p>
                    <p style={{ fontSize: "0.9rem", color: "var(--texto-suave)" }}>
                      {hora(data.proxima.startsAt)} (tu hora local)
                      {data.proxima.guia !== null && ` · con ${data.proxima.guia}`}
                    </p>
                    <div style={{ marginTop: "0.8rem" }}>
                      <p
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: "var(--texto-suave)",
                          marginBottom: "0.35rem",
                        }}
                      >
                        LINK DE INGRESO
                      </p>
                      {data.matricula.meetingUrl !== null && estadoZoomActual !== null ? (
                        <>
                          {/* Rocky pone cara según el estado real del enlace. */}
                          {esJunior && (
                            <Personaje
                              quien={poseZoom(estadoZoomActual)}
                              alto="4.2rem"
                              className="lgs-float"
                              style={{ marginBottom: "0.4rem" }}
                            />
                          )}
                          <ZoomAccessButton
                            meetingUrl={data.matricula.meetingUrl}
                            estado={estadoZoomActual}
                            tieneAcceso={ingreso}
                            onEntrar={entrarZoom}
                          />
                        </>
                      ) : (
                        <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
                          El enlace lo asigna la guía del salón.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p
                    style={{ fontSize: "1rem", marginTop: "0.35rem", color: "var(--texto-suave)" }}
                  >
                    No hay próximas clases programadas.
                  </p>
                )}
              </section>

              {/*
                MIS TALLERES: el taller es su propio tipo de evento desde
                2026-08-28 — no es un club ni una clase del horario. Se crea
                como evento ACADÉMICO y dura una o dos horas. Va aparte porque
                el niño lo vive distinto: es una actividad puntual.
              */}
              <section style={card}>
                <h2
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 800,
                    color: "var(--lgs-cian)",
                    letterSpacing: "0.05em",
                  }}
                >
                  MIS TALLERES
                </h2>
                {(data.talleres ?? []).length > 0 ? (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                    }}
                  >
                    {(data.talleres ?? []).map((tl) => (
                      <div
                        key={tl.sessionId}
                        style={{
                          borderLeft: "4px solid var(--lgs-cian)",
                          paddingLeft: "0.7rem",
                        }}
                      >
                        <p style={{ fontSize: "1rem", fontWeight: 700 }}>
                          Taller · {fechaLarga(tl.startsAt)}
                        </p>
                        <p style={{ fontSize: "0.88rem", color: "var(--texto-suave)" }}>
                          {hora(tl.startsAt)} (tu hora local) ·{" "}
                          {tl.duracionMin >= 120 ? "2 horas" : "1 hora"}
                          {tl.guia !== null && ` · con ${tl.guia}`}
                        </p>
                        {tl.observaciones !== null && tl.observaciones !== "" && (
                          <p style={{ fontSize: "0.86rem", marginTop: "0.25rem" }}>
                            {tl.observaciones}
                          </p>
                        )}
                      </div>
                    ))}
                    <p
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--texto-suave)",
                        marginTop: "0.2rem",
                      }}
                    >
                      Se entra por el mismo enlace de tu salón, arriba.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                    {esJunior && <Personaje quien="coco" alto="3.6rem" className="lgs-float" />}
                    <p style={{ fontSize: "0.95rem", color: "var(--texto-suave)" }}>
                      Todavía no tienes talleres. Cuando tu guía programe uno, aparece aquí con su
                      información y el enlace.
                    </p>
                  </div>
                )}
              </section>
            </div>

            {/* Columna derecha: sesiones + progreso */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <section id="avance" style={{ ...card, scrollMarginTop: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Sesiones</h2>
                <div
                  style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.6rem" }}
                >
                  {[
                    {
                      n: data.asistencia?.asistidas ?? 0,
                      t: "Asistidas",
                      c: "#1b5e20",
                      bg: "#e8f5e9",
                    },
                    {
                      n: data.asistencia?.ausentes ?? 0,
                      t: "Ausentes",
                      c: "#c62828",
                      bg: "#ffebee",
                    },
                    {
                      n: data.asistencia?.justificadas ?? 0,
                      t: "Justificadas",
                      c: "#8a6d00",
                      bg: "#fff8e1",
                    },
                    {
                      n: data.asistencia?.totalSesiones ?? 0,
                      t: "Total",
                      c: "#37474f",
                      bg: "#eceff1",
                    },
                  ].map((s) => (
                    <div
                      key={s.t}
                      style={{
                        textAlign: "center",
                        padding: "0.8rem 0.3rem",
                        borderRadius: "0.8rem",
                        background: s.bg,
                      }}
                    >
                      <div style={{ fontSize: "1.7rem", fontWeight: 800, color: s.c }}>{s.n}</div>
                      <div style={{ fontSize: "0.68rem", fontWeight: 700, color: s.c }}>{s.t}</div>
                    </div>
                  ))}
                </div>

                {/* Progreso del curso */}
                <div
                  style={{
                    marginTop: "1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.82rem",
                    color: "var(--texto-suave)",
                  }}
                >
                  <span>Progreso del curso</span>
                  <span>
                    {compl} / {totalLecc} lecciones
                  </span>
                </div>
                <div
                  style={{
                    marginTop: "0.35rem",
                    height: "0.55rem",
                    borderRadius: "0.3rem",
                    background: "#eef1f7",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${totalLecc > 0 ? (compl / totalLecc) * 100 : 0}%`,
                      height: "100%",
                      background: colorNivel,
                    }}
                  />
                </div>

                {/* Nivel anterior / actual / próximo */}
                <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                  <div style={moduloBox}>
                    <div
                      style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--texto-suave)" }}
                    >
                      NIVEL ANTERIOR
                    </div>
                    <div style={{ fontWeight: 800 }}>{nivelAnterior?.nombre ?? "Welcome"}</div>
                  </div>
                  <div style={{ ...moduloBox, borderColor: colorNivel, background: "#f3eefc" }}>
                    <div
                      style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--texto-suave)" }}
                    >
                      NIVEL ACTUAL
                    </div>
                    <div style={{ fontWeight: 800 }}>{nivelActual?.nombre ?? "—"}</div>
                  </div>
                  <div style={moduloBox}>
                    <div
                      style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--texto-suave)" }}
                    >
                      NIVEL PRÓXIMO
                    </div>
                    <div style={{ fontWeight: 800 }}>{nivelProximo?.nombre ?? "—"}</div>
                  </div>
                </div>
              </section>

              {/* Mis próximas clases (en el lugar del antiguo "¿Cómo voy?") */}
              <section id="agenda" style={{ ...card, scrollMarginTop: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", marginBottom: "0.15rem" }}>
                  🗓️ Mis próximas clases
                </h2>
                <p
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--texto-suave)",
                    marginBottom: "0.75rem",
                  }}
                >
                  Sesiones y clubes de las próximas 2 semanas
                </p>
                {data.agenda === undefined || data.agenda.length === 0 ? (
                  esJunior ? (
                    <VacioConPersonaje
                      quien="simba-triste"
                      titulo="Sin clases en las próximas 2 semanas."
                      detalle="En cuanto tu salón programe una sesión o un club, aparece aquí."
                      alto="4.5rem"
                    />
                  ) : (
                    <p style={{ color: "var(--texto-suave)" }}>
                      Sin clases en las próximas 2 semanas.
                    </p>
                  )
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {data.agenda.map((ev) => (
                      <div
                        key={ev.sessionId}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.6rem 0.9rem",
                          borderRadius: "0.6rem",
                          borderLeft: `4px solid ${ev.tipo === "CLUB" ? "var(--lgs-amarillo)" : "var(--lgs-azul)"}`,
                          background: "#fafbfe",
                          flexWrap: "wrap",
                          gap: "0.3rem",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {ev.tipo === "CLUB" ? "🎉 Club" : "📘 Sesión"} · {fechaLarga(ev.startsAt)}
                        </span>
                        <span style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
                          {hora(ev.startsAt)}
                          {ev.guia !== null && ` · ${ev.guia}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Lo que el guía le escribió en sus sesiones, del más reciente
                  al más antiguo. Solo el comentario para el alumno: las notas
                  privadas del equipo nunca llegan a esta pantalla. */}
              <section id="comentarios" style={{ ...card, scrollMarginTop: "1rem", flex: 1 }}>
                <h2 style={{ fontSize: "1.1rem", marginBottom: "0.15rem" }}>
                  💬 Lo que dice mi guía
                </h2>
                <p
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--texto-suave)",
                    marginBottom: "0.75rem",
                  }}
                >
                  Comentarios de tus clases, del más reciente al más antiguo
                </p>
                {data.comentarios === undefined || data.comentarios.length === 0 ? (
                  esJunior ? (
                    <VacioConPersonaje
                      quien="coco-triste"
                      titulo="Todavía no hay comentarios."
                      detalle="Cuando tu guía te escriba algo en una clase, aparece aquí."
                      alto="5rem"
                    />
                  ) : (
                    <p style={{ color: "var(--texto-suave)" }}>Todavía no hay comentarios.</p>
                  )
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {data.comentarios.map((c) => (
                      <div
                        key={c.sessionId}
                        style={{
                          padding: "0.7rem 0.9rem",
                          borderRadius: "0.6rem",
                          background: "#fafbfe",
                          borderLeft: "4px solid var(--lgs-verde)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              color: "var(--texto-suave)",
                            }}
                          >
                            {c.tipo === "CLUB" ? "🎉 Club" : `📘 Sesión ${String(c.numero)}`} ·{" "}
                            {fechaLarga(`${c.fecha}T12:00:00`)}
                          </span>
                          {c.guia !== null && (
                            <span style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>
                              {c.guia}
                            </span>
                          )}
                        </div>
                        <p style={{ marginTop: "0.3rem", fontSize: "0.92rem" }}>{c.comentario}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>
      )}

      {/* Pie de página: asistencia por WhatsApp (colorido, con textura de puntos) */}
      <footer
        style={{
          marginTop: "1rem",
          borderTop: "1px solid #e6e9f5",
          background: "linear-gradient(160deg, #eef4ff 0%, #f7f0ff 100%)",
          backgroundImage:
            "radial-gradient(rgba(123,47,190,0.10) 1.5px, transparent 1.6px), radial-gradient(rgba(0,174,239,0.08) 1.5px, transparent 1.6px)",
          backgroundSize: "22px 22px, 22px 22px",
          backgroundPosition: "0 0, 11px 11px",
          padding: "1.75rem 1.5rem 2.5rem",
        }}
      >
        <p
          style={{
            maxWidth: "72rem",
            margin: "0 auto",
            fontSize: "0.75rem",
            fontWeight: 800,
            letterSpacing: "0.1em",
            color: "var(--texto-suave)",
          }}
        >
          🆘 ASISTENCIA LGS KIDS
        </p>
        <div
          style={{
            maxWidth: "72rem",
            margin: "1rem auto 0",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            justifyContent: "space-around",
          }}
        >
          {SOPORTE.map((s) => (
            <a
              key={s.label}
              href={`https://wa.me/${s.tel}?text=${encodeURIComponent(s.msg)}`}
              target="_blank"
              rel="noreferrer"
              title={`Escribir por WhatsApp: ${s.label}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.55rem",
                textDecoration: "none",
                minWidth: "8rem",
              }}
            >
              <span
                style={{
                  width: "3.8rem",
                  height: "3.8rem",
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,0.5), rgba(255,255,255,0) 55%), ${s.color}`,
                  boxShadow: "0 10px 22px rgba(20,30,70,0.16), inset 0 -3px 8px rgba(0,0,0,0.12)",
                  border: "3px solid rgba(255,255,255,0.7)",
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                  <path d={WHATSAPP_PATH} />
                </svg>
              </span>
              <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "#2a2f52" }}>
                {s.label}
              </span>
              <span style={{ fontSize: "0.72rem", color: "var(--texto-suave)" }}>WhatsApp</span>
            </a>
          ))}
        </div>
        <p
          style={{
            maxWidth: "72rem",
            margin: "1.5rem auto 0",
            textAlign: "center",
            fontSize: "0.75rem",
            color: "var(--texto-suave)",
          }}
        >
          LGS Kids · lgskidsplataforma.com
        </p>
      </footer>

      {/* Lightbox del banner del curso */}
      {verImagen && data.imagenCursoUrl != null && (
        <div
          onClick={() => setVerImagen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen del curso ${curso.titulo}`}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(8,11,24,0.86)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            cursor: "zoom-out",
          }}
        >
          <button
            onClick={() => setVerImagen(false)}
            aria-label="Cerrar"
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              width: "2.6rem",
              height: "2.6rem",
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.15)",
              color: "white",
              fontSize: "1.3rem",
              fontWeight: 700,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.imagenCursoUrl}
            alt={`Curso ${curso.titulo}${nivelActual !== undefined ? ` · Nivel ${nivelActual.nombre}` : ""}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              borderRadius: "0.9rem",
              boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
              cursor: "default",
            }}
          />
        </div>
      )}

      {/* Modal "¿Cómo voy?" (estilo MOSAICO): progreso del nivel + Stages por nivel */}
      {verComoVoy && (
        <div
          onClick={() => setVerComoVoy(false)}
          role="dialog"
          aria-modal="true"
          aria-label="¿Cómo voy?"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(8,11,24,0.55)",
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
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            {/* Encabezado del modal */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1.1rem 1.25rem",
                borderBottom: "1px solid #eef1f7",
              }}
            >
              <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>📈 ¿Cómo voy?</h2>
              <button
                type="button"
                onClick={() => setVerComoVoy(false)}
                aria-label="Cerrar"
                style={{
                  width: "2.2rem",
                  height: "2.2rem",
                  borderRadius: "50%",
                  border: "1px solid #e3e7f0",
                  background: "white",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                  lineHeight: 1,
                  color: "var(--texto-suave)",
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {/* PROGRESO del nivel actual */}
              <div style={{ ...card, boxShadow: "none", border: "1px solid #eef1f7" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      color: "var(--texto-suave)",
                    }}
                  >
                    PROGRESO — NIVEL {(nivelActual?.nombre ?? "").toUpperCase()}
                  </span>
                  <span style={{ fontSize: "1.5rem", fontWeight: 900, color: colorNivel }}>
                    {pctNivelActual}%
                  </span>
                </div>
                <p
                  style={{ fontSize: "0.85rem", color: "var(--texto-suave)", marginTop: "0.15rem" }}
                >
                  Curso {tipo} · Nivel {nivelesCompletados}/{niveles.length} completados
                </p>
                <div
                  style={{
                    marginTop: "0.6rem",
                    height: "0.55rem",
                    borderRadius: "0.3rem",
                    background: "#eef1f7",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{ width: `${pctNivelActual}%`, height: "100%", background: colorNivel }}
                  />
                </div>
                <div
                  style={{
                    marginTop: "0.5rem",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.8rem",
                    color: "var(--texto-suave)",
                  }}
                >
                  <span>
                    {nivelActual?.leccionesCompletadas ?? 0} de {nivelActual?.totalLecciones ?? 0}{" "}
                    lecciones
                  </span>
                  <span>{asistPct}% asistencia</span>
                </div>
                <div
                  style={{
                    marginTop: "0.7rem",
                    padding: "0.7rem 0.9rem",
                    borderRadius: "0.6rem",
                    background: "#f4f6fb",
                    fontSize: "0.88rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.7rem",
                  }}
                >
                  {esJunior && (
                    /* La cara de Emma sigue al avance real: celebra, anima o piensa. */
                    <Personaje
                      quien={
                        data.progreso?.diploma === true
                          ? "emma-celebrando"
                          : faltanNivel > 0
                            ? "emma-pensativa"
                            : "emma-expectante"
                      }
                      alto="4.6rem"
                      className="lgs-float"
                    />
                  )}
                  <span>
                    {data.progreso?.diploma === true
                      ? "🎓 ¡Completaste todos los niveles! Diploma conseguido."
                      : faltanNivel > 0
                        ? `Te faltan ${faltanNivel} ${faltanNivel === 1 ? "sesión" : "sesiones"} para completar el nivel y avanzar.`
                        : "¡Completaste las sesiones del nivel! Falta aprobar el Level Up para avanzar."}
                  </span>
                </div>
              </div>

              {/* Niveles → Stages (clic para desplegar/colapsar) */}
              <div>
                <p
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    color: "var(--texto-suave)",
                    marginBottom: "0.6rem",
                  }}
                >
                  NIVELES DEL CURSO · toca un nivel para ver sus Unidades
                </p>
                {listaNiveles}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Perfil": foto, datos del alumno y contacto del apoderado */}
      {verPerfil && perfil !== null && (
        <div
          onClick={() => setVerPerfil(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Mi perfil"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(8,11,24,0.55)",
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
              maxWidth: "34rem",
              background: "white",
              borderRadius: "1rem",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1.1rem 1.25rem",
                borderBottom: "1px solid #eef1f7",
              }}
            >
              <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>👤 Mi perfil</h2>
              <button
                type="button"
                onClick={() => setVerPerfil(false)}
                aria-label="Cerrar"
                style={{
                  width: "2.2rem",
                  height: "2.2rem",
                  borderRadius: "50%",
                  border: "1px solid #e3e7f0",
                  background: "white",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                  lineHeight: 1,
                  color: "var(--texto-suave)",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "1.25rem" }}>
              {/* Primera vez: se explica por qué aparece solo */}
              {fotoOfrecida && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.8rem",
                    marginBottom: "1.1rem",
                    padding: "0.8rem 1rem",
                    borderRadius: "0.7rem",
                    background: "#f4f6fb",
                  }}
                >
                  {esJunior && <Personaje quien="rocky-picaro" alto="4rem" className="lgs-float" />}
                  <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                    ¡Ponle una foto a tu perfil! Así tu guía y tus compañeros te reconocen.
                  </p>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1.1rem",
                  flexWrap: "wrap",
                  marginBottom: "1.25rem",
                }}
              >
                <div
                  style={{
                    width: "6.5rem",
                    height: "6.5rem",
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: "#eef1f7",
                    display: "grid",
                    placeItems: "center",
                    flex: "0 0 auto",
                    border: "3px solid var(--lgs-azul)",
                  }}
                >
                  {perfil.fotoUrl !== null ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={perfil.fotoUrl}
                      alt="Mi foto"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: "2.4rem" }} aria-hidden="true">
                      🙂
                    </span>
                  )}
                </div>

                <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                  <p style={{ fontSize: "1.15rem", fontWeight: 800 }}>{perfil.nombre}</p>
                  {perfil.usuario !== null && (
                    <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
                      Usuario: {perfil.usuario}
                    </p>
                  )}
                  <label
                    style={{
                      display: "inline-block",
                      marginTop: "0.6rem",
                      padding: "0.5rem 1rem",
                      borderRadius: "0.6rem",
                      border: "1.5px solid var(--lgs-azul)",
                      color: "var(--lgs-azul)",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      cursor: subiendoFoto ? "wait" : "pointer",
                    }}
                  >
                    {subiendoFoto
                      ? "Subiendo…"
                      : perfil.tieneFoto
                        ? "Cambiar foto"
                        : "Subir mi foto"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={subiendoFoto}
                      onChange={(e) => {
                        const archivo = e.target.files?.[0];
                        e.target.value = "";
                        if (archivo !== undefined) void subirFoto(archivo);
                      }}
                      style={{ display: "none" }}
                    />
                  </label>
                  {errorFoto !== null && (
                    <p
                      role="alert"
                      style={{ color: "#c62828", fontSize: "0.85rem", marginTop: "0.4rem" }}
                    >
                      {errorFoto}
                    </p>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                  marginBottom: "1.25rem",
                }}
              >
                {[
                  {
                    t: "🎂 Cumpleaños",
                    v:
                      perfil.cumpleanos !== null
                        ? fechaLarga(`${perfil.cumpleanos}T12:00:00`)
                        : null,
                  },
                  { t: "✉️ Correo", v: perfil.correo },
                  { t: "📞 Teléfono", v: perfil.telefono },
                ].map((d) => (
                  <div
                    key={d.t}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "0.6rem",
                      padding: "0.6rem 0.9rem",
                      borderRadius: "0.6rem",
                      background: "#fafbfe",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{d.t}</span>
                    <span style={{ color: d.v !== null ? "inherit" : "var(--texto-suave)" }}>
                      {d.v ?? "Sin registrar"}
                    </span>
                  </div>
                ))}
              </div>

              <p
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  color: "var(--texto-suave)",
                  marginBottom: "0.5rem",
                }}
              >
                MI APODERADO
              </p>
              {perfil.apoderado === null ? (
                <p style={{ color: "var(--texto-suave)" }}>Sin apoderado registrado.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {[
                    { t: "👤 Nombre", v: perfil.apoderado.nombre },
                    { t: "🔗 Parentesco", v: perfil.apoderado.parentesco },
                    { t: "📞 Teléfono", v: perfil.apoderado.telefono },
                    { t: "✉️ Correo", v: perfil.apoderado.email },
                  ].map((d) => (
                    <div
                      key={d.t}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.6rem",
                        padding: "0.6rem 0.9rem",
                        borderRadius: "0.6rem",
                        background: "#fafbfe",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{d.t}</span>
                      <span style={{ color: d.v !== null ? "inherit" : "var(--texto-suave)" }}>
                        {d.v ?? "Sin registrar"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <p style={{ fontSize: "0.78rem", color: "var(--texto-suave)", marginTop: "1.1rem" }}>
                ¿Algún dato está mal? Escríbele a tu guía o a soporte: los cambia el equipo de LGS
                Kids.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Historial de clases" (se abre desde el ítem Historial del nav) */}
      {verHistorial && (
        <div
          onClick={() => setVerHistorial(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Historial de clases"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(8,11,24,0.55)",
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
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1.1rem 1.25rem",
                borderBottom: "1px solid #eef1f7",
              }}
            >
              <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>📚 Historial de clases</h2>
              <button
                type="button"
                onClick={() => setVerHistorial(false)}
                aria-label="Cerrar"
                style={{
                  width: "2.2rem",
                  height: "2.2rem",
                  borderRadius: "50%",
                  border: "1px solid #e3e7f0",
                  background: "white",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                  lineHeight: 1,
                  color: "var(--texto-suave)",
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "1.25rem" }}>{listaHistorial}</div>
          </div>
        </div>
      )}

      {/* Modal "Avance": mapa del curso → islas con VoBos y premios (hotspots) */}
      {verAvance &&
        (() => {
          const nivelIsla =
            avanceNivel !== null ? niveles.find((n) => n.codigo === avanceNivel) : null;
          const hsMapa = data.hotspots?.mapa ?? {};
          const hsIsla = data.hotspots?.isla ?? {};
          return (
            <div
              onClick={() => (avanceNivel !== null ? setAvanceNivel(null) : setVerAvance(false))}
              role="dialog"
              aria-modal="true"
              aria-label="Avance del curso"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 60,
                background: "rgba(8,11,24,0.7)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding: "1.5rem 1rem",
                overflowY: "auto",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  maxWidth: "56rem",
                  background: "white",
                  borderRadius: "1rem",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
                  overflow: "hidden",
                }}
              >
                {/* Encabezado */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    padding: "1rem 1.25rem",
                    borderBottom: "1px solid #eef1f7",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}
                  >
                    {nivelIsla != null && (
                      <button
                        type="button"
                        onClick={() => setAvanceNivel(null)}
                        aria-label="Volver al mapa"
                        style={{
                          border: "1px solid #e3e7f0",
                          background: "white",
                          borderRadius: "0.5rem",
                          padding: "0.3rem 0.6rem",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        ← Mapa
                      </button>
                    )}
                    <h2
                      style={{
                        fontSize: "1.2rem",
                        fontWeight: 800,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      🗺️{" "}
                      {nivelIsla != null ? `Isla ${nivelIsla.nombre}` : `Mapa del curso · ${tipo}`}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVerAvance(false)}
                    aria-label="Cerrar"
                    style={{
                      width: "2.2rem",
                      height: "2.2rem",
                      borderRadius: "50%",
                      border: "1px solid #e3e7f0",
                      background: "white",
                      cursor: "pointer",
                      fontSize: "1.1rem",
                      color: "var(--texto-suave)",
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ padding: "1.1rem 1.25rem 1.4rem" }}>
                  {nivelIsla == null ? (
                    /* —— Vista mapa del curso —— */
                    <>
                      {data.mapaCursoUrl != null ? (
                        <div
                          style={{
                            position: "relative",
                            borderRadius: "0.9rem",
                            overflow: "hidden",
                            border: "1px solid #e3e7f0",
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={data.mapaCursoUrl}
                            alt={`Mapa del curso ${tipo}`}
                            style={{ display: "block", width: "100%", height: "auto" }}
                          />
                          {esJunior &&
                            (() => {
                              // Simba se para en la unidad que el niño está cursando.
                              const actual = niveles.find((n) => n.estado === "EN_CURSO");
                              if (actual === undefined) return null;
                              const hs = hsMapa[actual.codigo];
                              if (hs === undefined) return null;
                              const p =
                                hs.unidades[actual.leccionesCompletadas] ??
                                hs.centro ??
                                hs.unidades.at(-1);
                              if (p === undefined || p === null) return null;
                              return marca(
                                "simba-aqui",
                                p,
                                <Personaje quien="simba" alto="3.6rem" className="lgs-float" />,
                              );
                            })()}
                          {niveles.map((n) => {
                            const hs = hsMapa[n.codigo];
                            if (hs === undefined) return null;
                            const done = n.leccionesCompletadas;
                            const completo = n.estado === "COMPLETADO";
                            return (
                              <span key={n.codigo}>
                                {rutaSVG([
                                  ...hs.unidades,
                                  ...(hs.centro != null ? [hs.centro] : []),
                                ])}
                                {hs.unidades
                                  .slice(0, done)
                                  .map((p, i) => marca(`${n.codigo}-u${i}`, p, voboEl("2.2rem")))}
                                {completo &&
                                  hs.centro != null &&
                                  marca(`${n.codigo}-c`, hs.centro, voboEl("4.2rem"))}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: "2rem",
                            textAlign: "center",
                            border: "1px dashed #d8dce6",
                            borderRadius: "0.9rem",
                            color: "var(--texto-suave)",
                          }}
                        >
                          Aún no hay “Mapa del curso completo” cargado. (Lo sube tu equipo en
                          Mantenimiento Académico.)
                        </div>
                      )}
                      {/* Islas: botones para abrir cada nivel */}
                      <div
                        style={{
                          marginTop: "0.9rem",
                          display: "flex",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        {niveles.map((n) => {
                          const c = COLOR_NIVEL[n.codigo] ?? "var(--lgs-azul)";
                          const icon =
                            n.estado === "COMPLETADO"
                              ? "🏅"
                              : n.estado === "EN_CURSO"
                                ? "▶️"
                                : "🔒";
                          return (
                            <button
                              key={n.codigo}
                              type="button"
                              onClick={() => setAvanceNivel(n.codigo)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                padding: "0.45rem 0.8rem",
                                borderRadius: "0.6rem",
                                border: `1px solid ${c}`,
                                borderLeft: `5px solid ${c}`,
                                background: "white",
                                cursor: "pointer",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                opacity: n.estado === "PENDIENTE" ? 0.7 : 1,
                              }}
                            >
                              {icon} {n.nombre}{" "}
                              <span style={{ color: "var(--texto-suave)", fontWeight: 600 }}>
                                {n.leccionesCompletadas}/{n.totalLecciones}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    /* —— Vista isla del nivel —— */
                    (() => {
                      const n = nivelIsla;
                      const banner = data.bannersNivel?.[n.codigo] ?? data.imagenCursoUrl ?? null;
                      const bloqueado = n.estado === "PENDIENTE";
                      const completo = n.estado === "COMPLETADO";
                      const hs = hsIsla[n.codigo];
                      const c = COLOR_NIVEL[n.codigo] ?? "var(--lgs-azul)";
                      return (
                        <>
                          <div
                            style={{
                              position: "relative",
                              borderRadius: "0.9rem",
                              overflow: "hidden",
                              border: "1px solid #e3e7f0",
                              background:
                                banner == null
                                  ? `linear-gradient(140deg, ${c} 0%, #1b2140 130%)`
                                  : "#0a0e1e",
                              aspectRatio: banner == null ? "16 / 9" : undefined,
                              filter: bloqueado ? "grayscale(1) brightness(0.92)" : "none",
                            }}
                          >
                            {banner != null && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={banner}
                                alt={`Isla ${n.nombre}`}
                                style={{ display: "block", width: "100%", height: "auto" }}
                              />
                            )}
                            {hs !== undefined &&
                              rutaSVG([...hs.unidades, ...(hs.premio != null ? [hs.premio] : [])])}
                            {!bloqueado && hs !== undefined && (
                              <>
                                {hs.unidades.map((p, i) =>
                                  marca(
                                    `u${i}`,
                                    p,
                                    botonUnidad(n.codigo, i, n.leccionesCompletadas, "2.8rem"),
                                  ),
                                )}
                                {/* Unidad actual: aro que late */}
                                {n.estado === "EN_CURSO" &&
                                  hs.unidades[n.leccionesCompletadas] != null &&
                                  marca(
                                    "cur",
                                    hs.unidades[n.leccionesCompletadas]!,
                                    <span
                                      className="lgs-ring"
                                      style={{
                                        display: "block",
                                        width: "1.9rem",
                                        height: "1.9rem",
                                        borderRadius: "50%",
                                        border: "3px solid var(--lgs-purpura)",
                                      }}
                                    />,
                                  )}
                                {/* Premio: solo VoBo cuando el nivel está COMPLETO (el banner ya muestra el premio) */}
                                {completo &&
                                  hs.premio != null &&
                                  marca("prem", hs.premio, voboEl("3.8rem"))}
                              </>
                            )}
                            {bloqueado && (
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  display: "grid",
                                  placeItems: "center",
                                  zIndex: 2,
                                }}
                              >
                                <span style={{ fontSize: "2.5rem" }}>🔒</span>
                              </div>
                            )}
                          </div>
                          <p
                            style={{
                              marginTop: "0.7rem",
                              fontSize: "0.9rem",
                              color: "var(--texto-suave)",
                            }}
                          >
                            {bloqueado
                              ? "Aún no llegas a este nivel."
                              : completo
                                ? "¡Nivel completado! El VoBo corona el premio."
                                : `Vas ${n.leccionesCompletadas}/${n.totalLecciones} unidades. Las vistas llevan un VoBo.`}
                            {hs === undefined &&
                              !bloqueado &&
                              " (Las posiciones se configuran en el editor de mapa.)"}
                          </p>
                        </>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/*
        Lámina de la UNIDAD: se abre al tocar "Unidad N" sobre la isla. Va
        encima del modal de Avance (zIndex mayor), porque nace desde él.
      */}
      {unidadAbierta !== null &&
        (() => {
          const { nivel, unidad } = unidadAbierta;
          const lamina = data.unidades?.[nivel]?.[String(unidad)] ?? null;
          const juegos = data.juegosUnidad?.[nivel]?.[String(unidad)] ?? [];
          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Unidad ${String(unidad)}`}
              onClick={() => setUnidadAbierta(null)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 70,
                background: "rgba(8,11,24,0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1rem",
                overflowY: "auto",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  maxWidth: "34rem",
                  background: "white",
                  borderRadius: "1rem",
                  overflow: "hidden",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.9rem 1.1rem",
                    background:
                      "linear-gradient(120deg, var(--lgs-azul) 0%, var(--lgs-purpura) 140%)",
                    color: "white",
                  }}
                >
                  <strong style={{ fontSize: "1.05rem" }}>Unidad {unidad}</strong>
                  <button
                    type="button"
                    onClick={() => setUnidadAbierta(null)}
                    aria-label="Cerrar"
                    style={{
                      width: "2rem",
                      height: "2rem",
                      borderRadius: "50%",
                      border: "none",
                      background: "rgba(255,255,255,.25)",
                      color: "white",
                      cursor: "pointer",
                      fontSize: "1rem",
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>

                {lamina !== null ? (
                  <div style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={lamina}
                      alt={`Unidad ${String(unidad)}`}
                      style={{
                        display: "block",
                        width: "100%",
                        height: "auto",
                        maxHeight: "62vh",
                        objectFit: "contain",
                      }}
                    />
                    {/*
                      Juegos UBICADOS: el enlace ES el cartel que ya está
                      dibujado en la lámina. Por eso la zona va TRANSPARENTE —
                      pintarle un botón encima tapaba el dibujo— y solo se
                      enciende al pasar por encima o al enfocarla con el
                      teclado. `lgs-cartel` late despacio para que el niño vea
                      que hay algo que tocar sin esconder la ilustración.
                    */}
                    {juegos.map((j, i) =>
                      j.x === undefined || j.y === undefined ? null : (
                        <a
                          key={i}
                          href={j.enlace}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Jugar: ${j.nombre}`}
                          aria-label={`Jugar: ${j.nombre}`}
                          className="lgs-cartel"
                          style={{
                            position: "absolute",
                            left: `${String(j.x - (j.w ?? 0) / 2)}%`,
                            top: `${String(j.y - (j.h ?? 0) / 2)}%`,
                            width: `${String(j.w ?? 0)}%`,
                            height: `${String(j.h ?? 0)}%`,
                            borderRadius: "0.4rem",
                            textDecoration: "none",
                          }}
                        />
                      ),
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "2rem 1.2rem",
                      textAlign: "center",
                      color: "var(--texto-suave)",
                    }}
                  >
                    {esJunior && <Personaje quien="coco" alto="4rem" className="lgs-float" />}
                    <p style={{ marginTop: "0.6rem" }}>Esta unidad todavía no tiene lámina.</p>
                  </div>
                )}

                {juegos.filter((j) => j.x === undefined || j.y === undefined).length > 0 && (
                  <div style={{ padding: "0.9rem 1.1rem 1.1rem" }}>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        color: "var(--lgs-verde)",
                        letterSpacing: "0.05em",
                        marginBottom: "0.5rem",
                      }}
                    >
                      JUEGOS DE LA UNIDAD
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {juegos
                        .filter((j) => j.x === undefined || j.y === undefined)
                        .map((j, i) => (
                          <a
                            key={i}
                            href={j.enlace}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.55rem 0.7rem",
                              borderRadius: "0.6rem",
                              background: "#f4f6fb",
                              fontWeight: 600,
                              color: "inherit",
                            }}
                          >
                            🎮 {j.nombre}
                          </a>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
