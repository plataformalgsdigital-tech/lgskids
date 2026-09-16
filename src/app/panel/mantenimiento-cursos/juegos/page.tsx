"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Colocar los JUEGOS de una unidad sobre su lámina.
 *
 * Los juegos NO se crean aquí: son las **actividades de las lecciones**, que se
 * cargan en Gestión de Contenido o por CSV. Esta pantalla solo decide QUÉ TROZO
 * de la lámina abre cada una; el nombre y el enlace no se tocan.
 *
 * Se marca un RECUADRO, no un punto: el enlace es el propio cartel ya dibujado
 * en la lámina, así que al niño no se le pinta nada encima — la zona va
 * transparente y solo se ilumina al tocarla.
 *
 * Solo caen en el mapa las lecciones de "Unidad 1".."Unidad 4". La "Unidad 0"
 * es la bienvenida, y repasos y evaluaciones no tienen casilla.
 */

interface Juego {
  cursoRefId: string;
  indice: number;
  leccion: string;
  nombre: string;
  enlace: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface SinCasilla {
  leccion: string;
  unidad: string;
  actividades: number;
}

interface Zona {
  ancho: number;
  alto: number;
}

interface Arrastre {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const CURSOS = ["JUNIOR", "YOUNGSTER"];
const NIVELES = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"];
/** Paradas de la isla: el Welcome (0) y las cuatro unidades. */
const UNIDADES = [0, 1, 2, 3, 4];
const etiquetaParada = (p: number) => (p === 0 ? "Welcome" : `Unidad ${String(p)}`);
/** Bajo esto el gesto fue un clic, no un arrastre: se usa el tamaño estándar. */
const MINIMO_ARRASTRE = 1.5;

const input: CSSProperties = {
  padding: "0.5rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.88rem",
  fontFamily: "inherit",
  background: "white",
};
const rotulo: CSSProperties = { fontSize: "0.78rem", fontWeight: 600 };

export default function JuegosUnidadPage() {
  const [curso, setCurso] = useState("JUNIOR");
  const [nivel, setNivel] = useState("ROOKIE");
  const [unidad, setUnidad] = useState(1);

  const [juegos, setJuegos] = useState<Juego[]>([]);
  const [sinCasilla, setSinCasilla] = useState<SinCasilla[]>([]);
  const [zona, setZona] = useState<Zona | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lamina, setLamina] = useState<string | null>(null);
  /** Juego que se está ubicando: el siguiente gesto sobre la lámina lo fija. */
  const [ubicando, setUbicando] = useState<number | null>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const res = await apiFetch(
      `/api/catalog/unidad-juegos?curso=${curso}&nivel=${nivel}&unidad=${String(unidad)}`,
    );
    if (!res.ok) {
      setError("No se pudieron cargar los juegos.");
      setCargando(false);
      return;
    }
    setError(null);
    setAviso(null);
    const c = (await res.json()) as { juegos: Juego[]; sinCasilla: SinCasilla[]; zona: Zona };
    setJuegos(c.juegos);
    setSinCasilla(c.sinCasilla);
    setZona(c.zona);
    setUbicando(null);
    setArrastre(null);

    const img = await apiFetch(
      `/api/catalog/imagen-curso?tipo=unidad&curso=${curso}&nivel=${nivel}&unidad=${String(unidad)}`,
    );
    setLamina(img.ok ? (((await img.json()) as { url: string | null }).url ?? null) : null);
    setCargando(false);
  }, [curso, nivel, unidad]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  /** Coordenadas del puntero en % de la lámina. */
  function pct(e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    };
  }

  function empezar(e: React.MouseEvent<HTMLDivElement>) {
    if (ubicando === null) return;
    const p = pct(e);
    setArrastre({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }

  function mover(e: React.MouseEvent<HTMLDivElement>) {
    if (arrastre === null) return;
    const p = pct(e);
    setArrastre({ ...arrastre, x1: p.x, y1: p.y });
  }

  /** Suelta el recuadro sobre el cartel. Un clic simple usa el tamaño estándar. */
  function soltar() {
    if (arrastre === null || ubicando === null || zona === null) return;
    const ancho = Math.abs(arrastre.x1 - arrastre.x0);
    const alto = Math.abs(arrastre.y1 - arrastre.y0);
    const chico = ancho < MINIMO_ARRASTRE || alto < MINIMO_ARRASTRE;
    const redondo = (v: number) => Math.round(v * 10) / 10;
    const caja = chico
      ? { x: arrastre.x0, y: arrastre.y0, w: zona.ancho, h: zona.alto }
      : {
          x: (arrastre.x0 + arrastre.x1) / 2,
          y: (arrastre.y0 + arrastre.y1) / 2,
          w: ancho,
          h: alto,
        };
    setJuegos((prev) =>
      prev.map((j, k) =>
        k === ubicando
          ? {
              ...j,
              x: redondo(caja.x),
              y: redondo(caja.y),
              w: redondo(caja.w),
              h: redondo(caja.h),
            }
          : j,
      ),
    );
    setArrastre(null);
    setUbicando(null);
    setAviso(null);
  }

  function quitarPosicion(i: number) {
    setJuegos((prev) =>
      prev.map((j, k) => {
        if (k !== i) return j;
        const resto = { ...j };
        delete resto.x;
        delete resto.y;
        delete resto.w;
        delete resto.h;
        return resto;
      }),
    );
    setAviso(null);
  }

  async function guardar() {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch("/api/catalog/unidad-juegos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posiciones: juegos.map((j) => ({
            cursoRefId: j.cursoRefId,
            indice: j.indice,
            ...(j.x !== undefined && j.y !== undefined
              ? {
                  x: j.x,
                  y: j.y,
                  ...(j.w !== undefined ? { w: j.w } : {}),
                  ...(j.h !== undefined ? { h: j.h } : {}),
                }
              : {}),
          })),
        }),
      });
      const c: { actualizadas?: number; error?: { message?: string } } = await res.json();
      if (!res.ok) {
        setError(c.error?.message ?? "No se pudieron guardar las posiciones.");
        return;
      }
      const sobre = juegos.filter((j) => j.x !== undefined).length;
      setAviso(`Guardado: ${String(sobre)} de ${String(juegos.length)} sobre la lámina.`);
    } finally {
      setOcupado(false);
    }
  }

  /** Recuadro en curso mientras se arrastra. */
  const cajaArrastre =
    arrastre === null
      ? null
      : {
          left: Math.min(arrastre.x0, arrastre.x1),
          top: Math.min(arrastre.y0, arrastre.y1),
          width: Math.abs(arrastre.x1 - arrastre.x0),
          height: Math.abs(arrastre.y1 - arrastre.y0),
        };

  return (
    <main style={{ padding: "2rem", maxWidth: "56rem", margin: "0 auto" }}>
      <Link href="/panel/mantenimiento-cursos" style={{ fontSize: "0.85rem" }}>
        ← Mantenimiento Académico
      </Link>
      <h1 style={{ fontSize: "1.6rem", margin: "0.5rem 0 0" }}>Enlaces de juegos</h1>
      <p style={{ color: "var(--texto-suave)", marginTop: "0.25rem" }}>
        Marca sobre la lámina el cartel que abre cada <strong>actividad</strong> de las lecciones de
        esta unidad. Los juegos se crean en{" "}
        <Link href="/panel/mantenimiento-cursos/gestion-contenido">Gestión de Contenido</Link>; aquí
        solo se decide qué trozo de la imagen es el enlace. Al niño no se le pinta nada encima: toca
        el cartel y se le abre.
      </p>

      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", marginTop: "1.2rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={rotulo}>Curso</span>
          <select value={curso} onChange={(e) => setCurso(e.target.value)} style={input}>
            {CURSOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={rotulo}>Nivel</span>
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} style={input}>
            {NIVELES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={rotulo}>Parada</span>
          <select value={unidad} onChange={(e) => setUnidad(Number(e.target.value))} style={input}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {etiquetaParada(u)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, marginTop: "1rem" }}>
          {error}
        </p>
      )}
      {aviso !== null && (
        <p style={{ color: "#1b5e20", fontWeight: 600, marginTop: "1rem" }}>{aviso}</p>
      )}

      <section
        style={{
          marginTop: "1.2rem",
          background: "white",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "1rem",
        }}
      >
        {cargando ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : juegos.length === 0 ? (
          <p style={{ color: "var(--texto-suave)" }}>
            Las lecciones de <strong>Unidad {unidad}</strong> todavía no tienen actividades.
            Cárgalas en{" "}
            <Link href="/panel/mantenimiento-cursos/gestion-contenido">Gestión de Contenido</Link> y
            vuelve aquí a colocarlas.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {juegos.map((j, i) => (
              <div
                key={`${j.cursoRefId}-${String(j.indice)}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.5rem 0.6rem",
                  borderRadius: "0.6rem",
                  background: ubicando === i ? "#eef2ff" : "#f7f9fd",
                }}
              >
                <button
                  type="button"
                  onClick={() => setUbicando(ubicando === i ? null : i)}
                  aria-label={`Marcar el cartel de ${j.nombre} sobre la lámina`}
                  title={
                    j.x === undefined
                      ? "Marcar su cartel sobre la lámina"
                      : `Zona de ${String(j.w ?? 0)}×${String(j.h ?? 0)} % · clic para volver a marcarla`
                  }
                  style={{
                    border: "1.5px solid " + (ubicando === i ? "var(--lgs-azul)" : "#e0e4ee"),
                    background: "white",
                    borderRadius: "0.5rem",
                    padding: "0.25rem 0.6rem",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {j.x === undefined ? "📍" : "✅"}
                </button>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: "0.9rem" }}>{j.nombre}</strong>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.74rem",
                      color: "var(--texto-suave)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {j.leccion} · {j.enlace}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/*
          El aviso que faltaba: si las actividades están en una lección cuya
          unidad no es casilla del mapa, la pantalla se veía vacía sin explicar
          por qué, y eso parece un fallo del sistema.
        */}
        {!cargando && sinCasilla.length > 0 && (
          <div
            style={{
              marginTop: "0.9rem",
              padding: "0.7rem 0.8rem",
              borderRadius: "0.6rem",
              background: "#fff8e1",
              border: "1px solid #ffe082",
              fontSize: "0.82rem",
            }}
          >
            <strong>Estas actividades no las abre ninguna unidad del mapa:</strong>
            <ul style={{ margin: "0.4rem 0", paddingLeft: "1.1rem" }}>
              {sinCasilla.map((s) => (
                <li key={`${s.leccion}-${s.unidad}`}>
                  {s.leccion} — unidad <strong>“{s.unidad}”</strong> ({s.actividades}{" "}
                  {s.actividades === 1 ? "actividad" : "actividades"})
                </li>
              ))}
            </ul>
            El mapa de la isla solo tiene las casillas <strong>Unidad 1</strong> a{" "}
            <strong>Unidad 4</strong>: “Unidad 0” es el cartel WELCOME, y los repasos y las
            evaluaciones no tienen casilla. Cambia la unidad de esas lecciones en{" "}
            <Link href="/panel/mantenimiento-cursos/gestion-contenido">Gestión de Contenido</Link>{" "}
            para que aparezcan aquí.
          </div>
        )}

        {juegos.length > 0 && (
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={ocupado}
            style={{
              marginTop: "0.9rem",
              padding: "0.55rem 1.2rem",
              borderRadius: "0.6rem",
              border: "none",
              background: "var(--lgs-azul)",
              color: "white",
              fontWeight: 700,
              cursor: ocupado ? "wait" : "pointer",
            }}
          >
            {ocupado ? "Guardando…" : "💾 Guardar posiciones"}
          </button>
        )}
      </section>

      {/*
        Lienzo: la lámina con las zonas marcadas. Se pinta con `height: auto`
        —igual que en el panel del niño— para que los % caigan donde él los verá.
      */}
      <section
        style={{
          marginTop: "1.2rem",
          background: "white",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "1rem",
        }}
      >
        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--texto-suave)" }}>
          LÁMINA DE LA UNIDAD
        </p>
        {lamina === null ? (
          <p style={{ color: "var(--texto-suave)", marginTop: "0.5rem" }}>
            Esta unidad todavía no tiene lámina. Súbela en{" "}
            <Link href="/panel/mantenimiento-cursos/imagenes">Imágenes de curso</Link> para poder
            marcar sus carteles.
          </p>
        ) : (
          <>
            <p
              style={{
                fontSize: "0.82rem",
                color: "var(--texto-suave)",
                margin: "0.3rem 0 0.6rem",
              }}
            >
              {ubicando === null
                ? "Toca 📍 en un juego y luego arrastra sobre su cartel para marcar el recuadro. Para quitarlo de la lámina, toca su zona."
                : `Arrastra sobre el cartel de “${juegos[ubicando]?.nombre ?? ""}”. Un clic simple usa el tamaño estándar.`}
            </p>
            <div
              onMouseDown={empezar}
              onMouseMove={mover}
              onMouseUp={soltar}
              onMouseLeave={() => setArrastre(null)}
              style={{
                position: "relative",
                maxWidth: "26rem",
                borderRadius: "0.8rem",
                overflow: "hidden",
                border: "1px solid #e3e7f0",
                cursor: ubicando === null ? "default" : "crosshair",
                userSelect: "none",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lamina}
                alt="Lámina de la unidad"
                draggable={false}
                style={{ display: "block", width: "100%", height: "auto" }}
              />
              {juegos.map((j, i) =>
                j.x === undefined || j.y === undefined ? null : (
                  <button
                    key={`${j.cursoRefId}-${String(j.indice)}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (ubicando === null) quitarPosicion(i);
                    }}
                    title={
                      ubicando === null
                        ? `${j.nombre} · clic para quitarlo de la lámina`
                        : undefined
                    }
                    style={{
                      position: "absolute",
                      left: `${String(j.x - (j.w ?? 0) / 2)}%`,
                      top: `${String(j.y - (j.h ?? 0) / 2)}%`,
                      width: `${String(j.w ?? 0)}%`,
                      height: `${String(j.h ?? 0)}%`,
                      borderRadius: "0.3rem",
                      border: "2px dashed var(--lgs-verde)",
                      background: "rgba(46,125,50,.2)",
                      color: "white",
                      fontSize: "0.58rem",
                      fontWeight: 700,
                      fontFamily: "inherit",
                      textShadow: "0 1px 3px rgba(0,0,0,.95)",
                      overflow: "hidden",
                      padding: 0,
                      cursor: ubicando === null ? "pointer" : "crosshair",
                      pointerEvents: ubicando === null ? "auto" : "none",
                    }}
                  >
                    {j.nombre}
                  </button>
                ),
              )}
              {cajaArrastre !== null && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: `${String(cajaArrastre.left)}%`,
                    top: `${String(cajaArrastre.top)}%`,
                    width: `${String(cajaArrastre.width)}%`,
                    height: `${String(cajaArrastre.height)}%`,
                    border: "2px dashed var(--lgs-azul)",
                    background: "rgba(25,118,210,.2)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
