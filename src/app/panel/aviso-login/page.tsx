"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { SoloSi } from "@/ui/SoloSi";

/**
 * Avisos de la pantalla de login: carrusel de hasta 3 imágenes. Cada aviso se
 * agrega, quita (sin tocar los demás), ordena, prende/apaga y programa
 * (desde/hasta) por separado. Equivale al de MOSAICO2026 y LGS2026.
 *
 * Las imágenes van por el módulo `files`; la lista y el interruptor general
 * viven en `platform_config`. Apagar un aviso también deja de exponer su imagen
 * en la ruta pública, no solo de mostrarla.
 */

type Aviso = {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
  desde: string | null;
  hasta: string | null;
  subidoEn: string;
  vigente: boolean;
  url: string;
};

type Estado = {
  activo: boolean;
  hoy: string;
  max: number;
  avisos: Aviso[];
  actualizadoEn: string | null;
};

const caja: CSSProperties = {
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1.25rem",
  marginBottom: "1.25rem",
};
const input: CSSProperties = {
  padding: "0.45rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  width: "100%",
};
const botonChico: CSSProperties = {
  padding: "0.4rem 0.7rem",
  borderRadius: "0.5rem",
  border: "1px solid #d8dce6",
  background: "white",
  cursor: "pointer",
  fontSize: "0.85rem",
};

const fmt = (f: string) => f.split("-").reverse().join("/");

function estadoTexto(a: Aviso, hoy: string): { texto: string; color: string } {
  if (!a.activo) return { texto: "Apagado", color: "var(--texto-suave)" };
  if (a.desde !== null && hoy < a.desde) return { texto: `Programado desde ${fmt(a.desde)}`, color: "#1565c0" };
  if (a.hasta !== null && hoy > a.hasta) return { texto: `Venció el ${fmt(a.hasta)}`, color: "#b26a00" };
  return { texto: "Visible", color: "#1b5e20" };
}

async function mensajeError(res: Response, porDefecto: string): Promise<string> {
  const cuerpo: { error?: { message?: string } } = await res.json().catch(() => ({}));
  return cuerpo.error?.message ?? porDefecto;
}

export default function AvisoLoginPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await apiFetch("/api/catalog/aviso-login");
      if (!res.ok) {
        setError("No se pudo leer el estado de los avisos.");
        return;
      }
      setEstado((await res.json()) as Estado);
      setError(null);
    } catch {
      setError("Error de conexión.");
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  /** Ejecuta una llamada que devuelve el estado nuevo. */
  async function ejecutar(fn: () => Promise<Response>, ok: string): Promise<boolean> {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(await mensajeError(res, "No se pudo guardar."));
        return false;
      }
      setEstado((await res.json()) as Estado);
      setAviso(ok);
      return true;
    } catch {
      setError("Error de conexión.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const patch = (body: unknown) =>
    apiFetch("/api/catalog/aviso-login", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const avisos = estado?.avisos ?? [];
  const hoy = estado?.hoy ?? "";
  const max = estado?.max ?? 3;
  const encendido = estado?.activo === true;
  const visibles = avisos.filter((a) => a.vigente).length;

  function guardarLista(lista: Aviso[], ok: string) {
    return ejecutar(
      () =>
        patch({
          avisos: lista.map((a) => ({ id: a.id, nombre: a.nombre, activo: a.activo, desde: a.desde, hasta: a.hasta })),
        }),
      ok,
    );
  }

  function actualizar(id: string, cambios: Partial<Aviso>, ok: string) {
    return guardarLista(avisos.map((a) => (a.id === id ? { ...a, ...cambios } : a)), ok);
  }

  function mover(i: number, d: -1 | 1) {
    const lista = [...avisos];
    const a = lista[i];
    const b = lista[i + d];
    if (a === undefined || b === undefined) return;
    lista[i] = b;
    lista[i + d] = a;
    void guardarLista(lista, "Orden actualizado.");
  }

  function quitar(a: Aviso) {
    const resto = avisos.length - 1;
    const msg =
      resto > 0
        ? `¿Quitar el aviso "${a.nombre}"? ${resto === 1 ? "El otro aviso sigue" : `Los otros ${String(resto)} avisos siguen`} igual.`
        : `¿Quitar el aviso "${a.nombre}"? Es el único: el login quedará sin avisos.`;
    if (!window.confirm(msg)) return;
    void ejecutar(
      () => apiFetch(`/api/catalog/aviso-login?id=${encodeURIComponent(a.id)}`, { method: "DELETE" }),
      "Aviso quitado.",
    );
  }

  return (
    <div style={{ maxWidth: "48rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.35rem" }}>
        📣 Avisos de la pantalla de login
      </h1>
      <p style={{ color: "var(--texto-suave)", marginBottom: "1.5rem" }}>
        Hasta {String(max)} imágenes. Con una se muestra sola; con varias, en carrusel (flechas,
        puntos y &quot;Siguiente aviso&quot;). Salen la primera vez que alguien abre el login; si
        las cierra, no vuelven hasta que abra el navegador de nuevo.
      </p>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", marginBottom: "1rem", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {aviso !== null && <p style={{ color: "#1b5e20", marginBottom: "1rem", fontWeight: 600 }}>{aviso}</p>}

      <section style={{ ...caja, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <p style={{ fontWeight: 700 }}>
            Estado general:{" "}
            <span style={{ color: encendido ? "#1b5e20" : "var(--texto-suave)" }}>
              {encendido ? "prendido" : "apagado"}
            </span>
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
            {!encendido
              ? "Nadie ve los avisos, y las imágenes tampoco quedan expuestas."
              : visibles === 0
                ? "Prendido, pero hoy no hay avisos visibles."
                : visibles === 1
                  ? "Hoy se ve 1 aviso."
                  : `Hoy se ven ${String(visibles)} avisos en carrusel.`}
          </p>
        </div>
        <SoloSi op="op.admin.aviso_login">
          <button
            type="button"
            disabled={ocupado || estado === null}
            onClick={() =>
              void ejecutar(() => patch({ activo: !encendido }), encendido ? "Avisos apagados." : "Avisos prendidos.")
            }
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: "0.6rem",
              border: "none",
              background: encendido ? "#c62828" : "var(--lgs-verde)",
              color: "white",
              fontWeight: 700,
              cursor: ocupado ? "wait" : "pointer",
            }}
          >
            {encendido ? "Apagar avisos" : "Prender avisos"}
          </button>
        </SoloSi>
      </section>

      <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.75rem" }}>
        Avisos ({String(avisos.length)} de {String(max)}) — se muestran en este orden
      </h2>

      {estado !== null && avisos.length === 0 && (
        <p style={{ ...caja, color: "var(--texto-suave)" }}>Todavía no hay avisos cargados.</p>
      )}

      {avisos.map((a, i) => (
        <TarjetaAviso
          key={`${a.id}-${a.nombre}-${a.desde ?? ""}-${a.hasta ?? ""}`}
          aviso={a}
          posicion={i + 1}
          hoy={hoy}
          ocupado={ocupado}
          primero={i === 0}
          ultimo={i === avisos.length - 1}
          onSubir={() => mover(i, -1)}
          onBajar={() => mover(i, 1)}
          onQuitar={() => quitar(a)}
          onActivo={(v) => void actualizar(a.id, { activo: v }, v ? "Aviso prendido." : "Aviso apagado.")}
          onGuardar={(c) => void actualizar(a.id, c, "Aviso actualizado.")}
        />
      ))}

      <SoloSi op="op.admin.aviso_login">
        {estado !== null &&
          (avisos.length >= max ? (
            <p style={{ ...caja, color: "var(--texto-suave)" }}>
              Ya hay {String(max)} avisos, el máximo. Quita uno para agregar otro.
            </p>
          ) : (
            <NuevoAviso
              ocupado={ocupado}
              onAgregar={(form) =>
                ejecutar(() => apiFetch("/api/catalog/aviso-login", { method: "POST", body: form }), "Aviso agregado.")
              }
            />
          ))}
      </SoloSi>
    </div>
  );
}

function TarjetaAviso(props: {
  aviso: Aviso;
  posicion: number;
  hoy: string;
  ocupado: boolean;
  primero: boolean;
  ultimo: boolean;
  onSubir: () => void;
  onBajar: () => void;
  onQuitar: () => void;
  onActivo: (v: boolean) => void;
  onGuardar: (c: Partial<Aviso>) => void;
}) {
  const { aviso: a, ocupado } = props;
  const [nombre, setNombre] = useState(a.nombre);
  const [desde, setDesde] = useState(a.desde ?? "");
  const [hasta, setHasta] = useState(a.hasta ?? "");
  const cambiado = nombre.trim() !== a.nombre || desde !== (a.desde ?? "") || hasta !== (a.hasta ?? "");
  const est = estadoTexto(a, props.hoy);

  return (
    <section style={{ ...caja, display: "flex", gap: "1rem", flexWrap: "wrap" }}>
      <a href={a.url} target="_blank" rel="noopener noreferrer" title="Ver en tamaño completo" style={{ flex: "0 0 10rem" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={a.url}
          alt={a.nombre}
          style={{ display: "block", width: "100%", height: "auto", borderRadius: "0.6rem", border: "1px solid #e3e7f0" }}
        />
      </a>

      <div style={{ flex: "1 1 18rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontWeight: 700, color: "var(--texto-suave)" }}>#{String(props.posicion)}</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} aria-label="Nombre del aviso" style={input} />
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: est.color, whiteSpace: "nowrap" }}>{est.texto}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
          <label style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
            Mostrar desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={input} />
          </label>
          <label style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
            Mostrar hasta (inclusive)
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} style={input} />
          </label>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--texto-suave)", margin: 0 }}>
          Sin fechas = se muestra siempre mientras esté prendido.
        </p>

        <SoloSi op="op.admin.aviso_login">
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => props.onActivo(!a.activo)}
              style={{ ...botonChico, marginRight: "auto", fontWeight: 700, color: a.activo ? "#c62828" : "#1b5e20" }}
            >
              {a.activo ? "Apagar" : "Prender"}
            </button>
            {cambiado && (
              <button
                type="button"
                disabled={ocupado || (desde !== "" && hasta !== "" && desde > hasta)}
                onClick={() => props.onGuardar({ nombre: nombre.trim() || a.nombre, desde: desde || null, hasta: hasta || null })}
                style={{ ...botonChico, background: "var(--lgs-azul)", color: "white", border: "none", fontWeight: 700 }}
              >
                Guardar cambios
              </button>
            )}
            <button type="button" disabled={ocupado || props.primero} onClick={props.onSubir} aria-label="Subir" title="Mostrar antes" style={botonChico}>
              ↑
            </button>
            <button type="button" disabled={ocupado || props.ultimo} onClick={props.onBajar} aria-label="Bajar" title="Mostrar después" style={botonChico}>
              ↓
            </button>
            <button type="button" disabled={ocupado} onClick={props.onQuitar} style={{ ...botonChico, color: "#c62828", borderColor: "#f1b5b5" }}>
              Quitar
            </button>
          </div>
        </SoloSi>
      </div>
    </section>
  );
}

function NuevoAviso({ ocupado, onAgregar }: { ocupado: boolean; onAgregar: (f: FormData) => Promise<boolean> }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(
    () => () => {
      if (preview !== null) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function elegir(event: ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    event.target.value = "";
    if (f === undefined) return;
    setArchivo(f);
    setPreview(URL.createObjectURL(f));
  }

  /** Descarta la imagen elegida (aún no publicada) sin tocar los avisos existentes. */
  function descartar() {
    setArchivo(null);
    setPreview(null);
  }

  async function agregar() {
    if (archivo === null) return;
    const form = new FormData();
    form.append("archivo", archivo);
    form.append("nombre", nombre);
    form.append("desde", desde);
    form.append("hasta", hasta);
    if (await onAgregar(form)) {
      setArchivo(null);
      setPreview(null);
      setNombre("");
      setDesde("");
      setHasta("");
    }
  }

  return (
    <section style={caja}>
      <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>➕ Agregar aviso</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)", marginBottom: "0.9rem" }}>
        JPG, PNG o WebP, hasta 10 MB. Se muestra completa: usa una imagen ya diseñada al tamaño que
        quieras (vertical u horizontal cerrada, no muy alargada).
      </p>

      <label
        style={{
          display: "inline-block",
          padding: "0.6rem 1.1rem",
          borderRadius: "0.6rem",
          border: "1.5px solid var(--lgs-azul)",
          color: "var(--lgs-azul)",
          fontWeight: 700,
          cursor: ocupado ? "wait" : "pointer",
          marginBottom: "1rem",
        }}
      >
        {archivo !== null ? "Elegir otra imagen" : "Elegir imagen"}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={ocupado} onChange={elegir} style={{ display: "none" }} />
      </label>

      {archivo !== null && (
        <button
          type="button"
          disabled={ocupado}
          onClick={descartar}
          style={{ ...botonChico, color: "#c62828", borderColor: "#f1b5b5", marginLeft: "0.5rem", verticalAlign: "top", marginTop: "0.15rem" }}
        >
          Quitar imagen
        </button>
      )}

      {preview !== null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Vista previa"
          style={{ display: "block", maxWidth: "22rem", width: "100%", height: "auto", borderRadius: "0.7rem", border: "1px solid #e3e7f0", marginBottom: "1rem" }}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))", gap: "0.6rem", marginBottom: "1rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
          Nombre (referencia interna)
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Ej. Feriado 31-oct" style={input} />
        </label>
        <label style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
          Mostrar desde (opcional)
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={input} />
        </label>
        <label style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
          Mostrar hasta (opcional)
          <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} style={input} />
        </label>
      </div>

      <button
        type="button"
        disabled={ocupado || archivo === null || (desde !== "" && hasta !== "" && desde > hasta)}
        onClick={() => void agregar()}
        style={{
          padding: "0.6rem 1.2rem",
          borderRadius: "0.6rem",
          border: "none",
          background: archivo === null ? "#9e9e9e" : "var(--lgs-azul)",
          color: "white",
          fontWeight: 700,
          cursor: ocupado ? "wait" : "pointer",
        }}
      >
        {ocupado ? "Guardando…" : "Agregar y publicar"}
      </button>
    </section>
  );
}
