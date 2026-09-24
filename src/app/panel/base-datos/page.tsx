"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Explorador de la base de datos (solo superadmin).
 *
 * Mira cualquier tabla y la escribe. Lo que hace que esto no sea un pie de
 * plomo vive en el servidor (`modules/dbadmin`): las credenciales no se leen,
 * los identificadores se cotejan contra el esquema, las tablas que alimentan
 * invariantes piden confirmación y cada escritura queda auditada. Aquí solo se
 * dibuja, y se repite el aviso para que nadie escriba a ciegas.
 */

interface TablaInfo {
  nombre: string;
  modulo: string;
  filasAprox: number;
  sensible: boolean;
}

interface ColumnaInfo {
  nombre: string;
  tipo: string;
  nullable: boolean;
  porDefecto: string | null;
  esPk: boolean;
  oculta: boolean;
  editable: boolean;
}

interface Esquema {
  tabla: string;
  columnas: ColumnaInfo[];
  pk: string | null;
  sensible: boolean;
  motivo: string | null;
}

interface Pagina {
  esquema: Esquema;
  filas: Record<string, unknown>[];
  total: number;
  pagina: number;
  tamano: number;
}

const TAMANOS = [25, 50, 100, 200];

const caja: CSSProperties = {
  background: "white",
  border: "1px solid #e6e9f2",
  borderRadius: "0.8rem",
  padding: "0.9rem 1rem",
};
const boton: CSSProperties = {
  padding: "0.4rem 0.8rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.82rem",
  cursor: "pointer",
  color: "inherit",
};
const entrada: CSSProperties = {
  padding: "0.4rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.85rem",
  fontFamily: "inherit",
};

/** Lo que se ve en la celda: null y objetos tienen que distinguirse del texto. */
function pintar(valor: unknown): string {
  if (valor === null || valor === undefined) return "∅";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

export default function BaseDatosPage() {
  const [tablas, setTablas] = useState<TablaInfo[]>([]);
  const [filtroTablas, setFiltroTablas] = useState("");
  const [tabla, setTabla] = useState<string | null>(null);
  const [datos, setDatos] = useState<Pagina | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(50);
  const [orden, setOrden] = useState<string | null>(null);
  const [descendente, setDescendente] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [buscarAplicado, setBuscarAplicado] = useState("");

  /** Marcado "sí, sé lo que hago" para las tablas que lo exigen. */
  const [confirmado, setConfirmado] = useState(false);
  const [editando, setEditando] = useState<{ id: string; columna: string } | null>(null);
  const [borrador, setBorrador] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [nueva, setNueva] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch("/api/dbadmin/tablas");
      if (!res.ok) {
        setError(
          res.status === 403
            ? "Esta pantalla es solo para el superadmin."
            : "No se pudo leer la lista de tablas.",
        );
        return;
      }
      const data = (await res.json()) as { tablas: TablaInfo[] };
      setTablas(data.tablas);
    }
    void cargar();
  }, []);

  const cargarFilas = useCallback(async () => {
    if (tabla === null) return;
    {
      const q = new URLSearchParams({
        pagina: String(pagina),
        tamano: String(tamano),
        dir: descendente ? "desc" : "asc",
      });
      if (orden !== null) q.set("orden", orden);
      if (buscarAplicado !== "") q.set("buscar", buscarAplicado);
      const res = await apiFetch(`/api/dbadmin/tablas/${tabla}?${q.toString()}`);
      if (!res.ok) {
        const c = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(c.error?.message ?? "No se pudo leer la tabla.");
        setDatos(null);
        return;
      }
      setError(null);
      setDatos((await res.json()) as Pagina);
    }
  }, [tabla, pagina, tamano, orden, descendente, buscarAplicado]);

  useEffect(() => {
    // El "cargando…" aparece solo si la consulta tarda: con una tabla chica
    // llega antes que el ojo, y parpadear molesta más que informar. Además así
    // no se llama a setState en el cuerpo del efecto.
    let vivo = true;
    const lento = setTimeout(() => {
      if (vivo) setCargando(true);
    }, 150);
    async function run() {
      try {
        await cargarFilas();
      } finally {
        vivo = false;
        clearTimeout(lento);
        setCargando(false);
      }
    }
    void run();
  }, [cargarFilas]);

  function abrir(nombre: string) {
    setTabla(nombre);
    setPagina(1);
    setOrden(null);
    setDescendente(false);
    setBuscar("");
    setBuscarAplicado("");
    setConfirmado(false);
    setSeleccion(new Set());
    setNueva(null);
    setAviso(null);
    setError(null);
  }

  /** Escribe una celda. El servidor vuelve a validar todo esto. */
  async function guardarCelda(id: string, columna: string, texto: string) {
    if (tabla === null) return;
    setEditando(null);
    // "∅" (o vacío en columna que admite nulos) se manda como NULL de verdad:
    // no es lo mismo que la cadena vacía y en la base se nota.
    const col = datos?.esquema.columnas.find((c) => c.nombre === columna);
    const valor = texto === "∅" || (texto === "" && col?.nullable === true) ? null : texto;
    const res = await apiFetch(`/api/dbadmin/tablas/${tabla}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, columna, valor, confirmado }),
    });
    const c = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) {
      setError(c.error?.message ?? "No se pudo guardar.");
      return;
    }
    setAviso(`✔ ${columna} actualizado.`);
    await cargarFilas();
  }

  async function borrarSeleccion() {
    if (tabla === null || seleccion.size === 0) return;
    if (!window.confirm(`¿Borrar ${String(seleccion.size)} fila(s) de ${tabla}?`)) return;
    const res = await apiFetch(`/api/dbadmin/tablas/${tabla}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...seleccion], confirmado }),
    });
    const c = (await res.json().catch(() => ({}))) as {
      borradas?: number;
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(c.error?.message ?? "No se pudo borrar.");
      return;
    }
    setAviso(`✔ ${String(c.borradas ?? 0)} fila(s) borrada(s).`);
    setSeleccion(new Set());
    await cargarFilas();
  }

  async function insertar() {
    if (tabla === null || nueva === null) return;
    const valores: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(nueva)) {
      if (v !== "") valores[k] = v === "∅" ? null : v;
    }
    const res = await apiFetch(`/api/dbadmin/tablas/${tabla}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valores, confirmado }),
    });
    const c = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) {
      setError(c.error?.message ?? "No se pudo insertar.");
      return;
    }
    setAviso("✔ Fila insertada.");
    setNueva(null);
    await cargarFilas();
  }

  const porModulo = useMemo(() => {
    const filtradas = tablas.filter((t) => t.nombre.includes(filtroTablas.trim().toLowerCase()));
    const mapa = new Map<string, TablaInfo[]>();
    for (const t of filtradas) {
      mapa.set(t.modulo, [...(mapa.get(t.modulo) ?? []), t]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tablas, filtroTablas]);

  const esquema = datos?.esquema ?? null;
  const pk = esquema?.pk ?? null;
  const paginas = datos === null ? 1 : Math.max(Math.ceil(datos.total / datos.tamano), 1);

  return (
    <main style={{ padding: "1.5rem 2rem", maxWidth: "110rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem" }}>🗄️ Base de datos</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.88rem", marginBottom: "1rem" }}>
        Todas las tablas de KIDS2026. Se puede mirar y escribir; cada cambio queda en la auditoría
        con el valor anterior. Las columnas de credenciales se muestran como <code>•••</code> y no
        se editan aquí.
      </p>

      {error !== null && (
        <p
          role="alert"
          style={{
            ...caja,
            background: "#fdecea",
            borderColor: "#f5c2c0",
            color: "#b71c1c",
            marginBottom: "0.8rem",
            fontSize: "0.88rem",
          }}
        >
          {error}
        </p>
      )}
      {aviso !== null && (
        <p
          style={{
            ...caja,
            background: "#e8f5e9",
            borderColor: "#c8e6c9",
            marginBottom: "0.8rem",
            fontSize: "0.88rem",
          }}
        >
          {aviso}
        </p>
      )}

      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        {/* ── Lista de tablas ─────────────────────────────── */}
        <aside
          style={{ ...caja, width: "17rem", flexShrink: 0, maxHeight: "76vh", overflowY: "auto" }}
        >
          <input
            value={filtroTablas}
            onChange={(e) => setFiltroTablas(e.target.value)}
            placeholder="Buscar tabla…"
            style={{ ...entrada, width: "100%", marginBottom: "0.6rem" }}
          />
          {porModulo.map(([modulo, lista]) => (
            <div key={modulo} style={{ marginBottom: "0.7rem" }}>
              <div
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  color: "var(--texto-suave)",
                  marginBottom: "0.25rem",
                }}
              >
                {modulo}
              </div>
              {lista.map((t) => (
                <button
                  key={t.nombre}
                  type="button"
                  onClick={() => abrir(t.nombre)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.4rem",
                    width: "100%",
                    padding: "0.3rem 0.45rem",
                    borderRadius: "0.45rem",
                    border: "none",
                    background: t.nombre === tabla ? "#eef2ff" : "transparent",
                    fontWeight: t.nombre === tabla ? 800 : 500,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "inherit",
                  }}
                >
                  <span>
                    {t.sensible && <span title="Pide confirmación para escribir">⚠ </span>}
                    {t.nombre}
                  </span>
                  <span
                    title="Filas aproximadas (estimación del planificador)"
                    style={{ color: "var(--texto-suave)", fontSize: "0.72rem" }}
                  >
                    ~{t.filasAprox}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* ── Tabla ───────────────────────────────────────── */}
        <section style={{ ...caja, flex: 1, minWidth: 0 }}>
          {tabla === null ? (
            <p style={{ color: "var(--texto-suave)" }}>Elige una tabla de la izquierda.</p>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: "0.7rem",
                }}
              >
                <strong style={{ fontSize: "1rem" }}>{tabla}</strong>
                <span style={{ color: "var(--texto-suave)", fontSize: "0.8rem" }}>
                  {datos?.total ?? 0} fila(s)
                </span>
                <input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setPagina(1);
                      setBuscarAplicado(buscar);
                    }
                  }}
                  placeholder="Buscar en la tabla… (Enter)"
                  style={{ ...entrada, minWidth: "14rem" }}
                />
                <button
                  type="button"
                  style={boton}
                  onClick={() => {
                    setPagina(1);
                    setBuscarAplicado(buscar);
                  }}
                >
                  Buscar
                </button>
                <a
                  href={`/api/dbadmin/tablas/${tabla}?formato=csv${
                    buscarAplicado === "" ? "" : `&buscar=${encodeURIComponent(buscarAplicado)}`
                  }`}
                  style={{ ...boton, textDecoration: "none" }}
                >
                  ⬇️ CSV
                </a>
                {pk !== null && (
                  <button
                    type="button"
                    style={boton}
                    onClick={() =>
                      setNueva(
                        Object.fromEntries(
                          (esquema?.columnas ?? [])
                            .filter((c) => !c.oculta)
                            .map((c) => [c.nombre, ""]),
                        ),
                      )
                    }
                  >
                    + Nueva fila
                  </button>
                )}
                {seleccion.size > 0 && (
                  <button
                    type="button"
                    style={{ ...boton, borderColor: "#f5c2c0", color: "#b71c1c" }}
                    onClick={() => void borrarSeleccion()}
                  >
                    Borrar {seleccion.size}
                  </button>
                )}
              </div>

              {esquema?.sensible === true && (
                <label
                  style={{
                    ...caja,
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "flex-start",
                    background: "#fff8e1",
                    borderColor: "#ffe0a3",
                    marginBottom: "0.7rem",
                    fontSize: "0.83rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={confirmado}
                    onChange={(e) => setConfirmado(e.target.checked)}
                    style={{ marginTop: "0.15rem" }}
                  />
                  <span>
                    <strong>Cuidado.</strong> {esquema.motivo} Marca esta casilla para escribir
                    igual.
                  </span>
                </label>
              )}

              {pk === null && (
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "#b26a00",
                    marginBottom: "0.5rem",
                  }}
                >
                  Sin clave primaria de una sola columna: esta tabla se puede mirar y exportar, pero
                  no editar fila por fila.
                </p>
              )}

              {nueva !== null && esquema !== null && (
                <div style={{ ...caja, marginBottom: "0.7rem", background: "#f7f9ff" }}>
                  <strong style={{ fontSize: "0.88rem" }}>Nueva fila en {tabla}</strong>
                  <p style={{ fontSize: "0.76rem", color: "var(--texto-suave)" }}>
                    Deja vacío lo que deba tomar su valor por defecto. Escribe <code>∅</code> para
                    guardar NULL.
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
                      gap: "0.5rem",
                      margin: "0.6rem 0",
                    }}
                  >
                    {esquema.columnas
                      .filter((c) => !c.oculta)
                      .map((c) => (
                        <label key={c.nombre} style={{ fontSize: "0.78rem" }}>
                          <span style={{ fontWeight: 700 }}>{c.nombre}</span>{" "}
                          <span style={{ color: "var(--texto-suave)" }}>
                            {c.tipo}
                            {c.nullable ? "" : " *"}
                          </span>
                          <input
                            value={nueva[c.nombre] ?? ""}
                            onChange={(e) => setNueva({ ...nueva, [c.nombre]: e.target.value })}
                            placeholder={c.porDefecto ?? ""}
                            style={{ ...entrada, width: "100%" }}
                          />
                        </label>
                      ))}
                  </div>
                  <button type="button" style={boton} onClick={() => void insertar()}>
                    Guardar fila
                  </button>{" "}
                  <button type="button" style={boton} onClick={() => setNueva(null)}>
                    Cancelar
                  </button>
                </div>
              )}

              <div style={{ overflowX: "auto", maxHeight: "60vh" }}>
                <table style={{ borderCollapse: "collapse", fontSize: "0.8rem", width: "100%" }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: "#f7f9ff" }}>
                      {pk !== null && <th style={{ padding: "0.35rem" }}></th>}
                      {(esquema?.columnas ?? []).map((c) => (
                        <th
                          key={c.nombre}
                          onClick={() => {
                            if (c.oculta) return;
                            setDescendente(orden === c.nombre ? !descendente : false);
                            setOrden(c.nombre);
                          }}
                          style={{
                            padding: "0.4rem 0.5rem",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                            cursor: c.oculta ? "default" : "pointer",
                            borderBottom: "2px solid #e6e9f2",
                          }}
                          title={`${c.tipo}${c.nullable ? "" : " · obligatoria"}${
                            c.esPk ? " · clave primaria" : ""
                          }`}
                        >
                          {c.esPk && "🔑 "}
                          {c.nombre}
                          {orden === c.nombre && (descendente ? " ▼" : " ▲")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(datos?.filas ?? []).map((fila, i) => {
                      const id = pk === null ? String(i) : String(fila[pk] ?? "");
                      return (
                        <tr key={id} style={{ borderBottom: "1px solid #eef1f7" }}>
                          {pk !== null && (
                            <td style={{ padding: "0.3rem" }}>
                              <input
                                type="checkbox"
                                checked={seleccion.has(id)}
                                onChange={(e) => {
                                  const s = new Set(seleccion);
                                  if (e.target.checked) s.add(id);
                                  else s.delete(id);
                                  setSeleccion(s);
                                }}
                              />
                            </td>
                          )}
                          {(esquema?.columnas ?? []).map((c) => {
                            const editable = c.editable && pk !== null;
                            const esta =
                              editando !== null &&
                              editando.id === id &&
                              editando.columna === c.nombre;
                            return (
                              <td
                                key={c.nombre}
                                onDoubleClick={() => {
                                  if (!editable) return;
                                  setEditando({ id, columna: c.nombre });
                                  setBorrador(pintar(fila[c.nombre]));
                                }}
                                style={{
                                  padding: "0.3rem 0.5rem",
                                  maxWidth: "22rem",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  color: c.oculta ? "var(--texto-suave)" : "inherit",
                                  cursor: editable ? "text" : "default",
                                }}
                                title={editable ? "Doble clic para editar" : pintar(fila[c.nombre])}
                              >
                                {esta ? (
                                  <input
                                    autoFocus
                                    value={borrador}
                                    onChange={(e) => setBorrador(e.target.value)}
                                    onBlur={() => void guardarCelda(id, c.nombre, borrador)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        void guardarCelda(id, c.nombre, borrador);
                                      }
                                      if (e.key === "Escape") setEditando(null);
                                    }}
                                    style={{ ...entrada, width: "100%" }}
                                  />
                                ) : (
                                  pintar(fila[c.nombre])
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  marginTop: "0.7rem",
                  fontSize: "0.82rem",
                }}
              >
                <button
                  type="button"
                  style={boton}
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => Math.max(p - 1, 1))}
                >
                  ← Anterior
                </button>
                <span>
                  Página {pagina} de {paginas}
                </span>
                <button
                  type="button"
                  style={boton}
                  disabled={pagina >= paginas}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Siguiente →
                </button>
                <select
                  value={tamano}
                  onChange={(e) => {
                    setTamano(Number(e.target.value));
                    setPagina(1);
                  }}
                  style={entrada}
                >
                  {TAMANOS.map((t) => (
                    <option key={t} value={t}>
                      {t} por página
                    </option>
                  ))}
                </select>
                {cargando && <span style={{ color: "var(--texto-suave)" }}>cargando…</span>}
                <span style={{ color: "var(--texto-suave)" }}>
                  Doble clic en una celda para editarla.
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
