"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import {
  Aviso,
  CajaCredenciales,
  ClaveConsultada,
  PAISES,
  TIPOS,
  VolverGestion,
  boton,
  input,
  mensajeDeError,
  sinLlave,
  tarjeta,
  type ConsultaClave,
} from "../comunes";

type Tipo = "estudiante" | "guia" | "administrativo" | "otro";

interface Usuario {
  id: string;
  username: string;
  email: string | null;
  estado: string;
  ultimoLoginEn: string | null;
  tipo: Tipo;
  personaId: string | null;
  persona: string | null;
  nombres: string | null;
  apellidos: string | null;
  telefono: string | null;
  docNumero: string | null;
  debeCambiarPassword: boolean;
  tieneCopiaClave: boolean;
  solicitudPendiente: boolean;
  motivosNoBorrar: string[];
  roles: { rol: string; pais: string | null }[];
}

interface Rol {
  code: string;
  nombre: string;
}

const LIMITE = 500;
const SISTEMA = "sistema-lgs";

const FILTROS: { valor: Tipo | ""; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos" },
  { valor: "estudiante", etiqueta: "🎓 Estudiantes" },
  { valor: "administrativo", etiqueta: "💼 Administrativos" },
  { valor: "guia", etiqueta: "🧑‍🏫 Guías" },
  { valor: "otro", etiqueta: "Otros" },
];

const celda: CSSProperties = { padding: "0.5rem 0.45rem", verticalAlign: "top" };

/** CSV con `;` y BOM: así lo abre bien el Excel en español. Nunca lleva claves. */
function descargarCsv(usuarios: Usuario[]) {
  const cols = [
    "usuario",
    "nombre",
    "tipo",
    "roles",
    "correo",
    "telefono",
    "documento",
    "estado",
    "ultimo_ingreso",
    "cambiar_clave_al_entrar",
  ];
  const esc = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const filas = usuarios.map((u) =>
    [
      u.username,
      u.persona ?? "",
      TIPOS[u.tipo].titulo,
      u.roles.map((r) => `${r.rol}${r.pais !== null ? ` (${r.pais})` : ""}`).join(", "),
      u.email ?? "",
      u.telefono ?? "",
      u.docNumero ?? "",
      u.estado,
      u.ultimoLoginEn !== null ? new Date(u.ultimoLoginEn).toISOString() : "",
      u.debeCambiarPassword ? "sí" : "no",
    ]
      .map(esc)
      .join(";"),
  );
  const blob = new Blob([`﻿${[cols.join(";"), ...filas].join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ConsultarUsuariosPage() {
  const [tipo, setTipo] = useState<Tipo | "">("");
  const [estado, setEstado] = useState<"" | "ACTIVO" | "INACTIVO">("");
  const [buscar, setBuscar] = useState("");
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [puedeVerClaves, setPuedeVerClaves] = useState(false);
  const [yo, setYo] = useState<string | null>(null);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [claves, setClaves] = useState<Record<string, ConsultaClave>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [credenciales, setCredenciales] = useState<{ username: string; clave: string } | null>(
    null,
  );
  // Asignar rol y editar ficha, sobre la fila abierta.
  const [rolElegido, setRolElegido] = useState("");
  const [paisElegido, setPaisElegido] = useState("");
  const [ficha, setFicha] = useState<{
    nombres: string;
    apellidos: string;
    email: string;
    telefono: string;
    docNumero: string;
  } | null>(null);

  const cargar = useCallback(async (f: { tipo: string; estado: string; buscar: string }) => {
    const p = new URLSearchParams({ limit: String(LIMITE) });
    if (f.tipo !== "") p.set("tipo", f.tipo);
    if (f.estado !== "") p.set("estado", f.estado);
    if (f.buscar.trim() !== "") p.set("buscar", f.buscar.trim());
    const res = await apiFetch(`/api/identity/users?${p.toString()}`);
    if (!res.ok) {
      setError(await mensajeDeError(res, "No se pudo cargar la lista."));
      return;
    }
    const data = (await res.json()) as { usuarios: Usuario[]; puedeVerClaves: boolean };
    setUsuarios(data.usuarios);
    setPuedeVerClaves(data.puedeVerClaves);
  }, []);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      await cargar({ tipo: "", estado: "", buscar: "" });
      const [resMe, resRoles] = await Promise.all([
        apiFetch("/api/auth/me"),
        apiFetch("/api/access/roles"),
      ]);
      if (!vigente) return;
      if (resMe.ok) {
        const me = (await resMe.json()) as { user: { id: string } | null };
        setYo(me.user?.id ?? null);
      }
      if (resRoles.ok) {
        const r = (await resRoles.json()) as { roles: Rol[] };
        // El rol de alumno lo pone el contrato; el de guía, su propia alta.
        setRoles(r.roles.filter((x) => x.code !== "alumno"));
      }
    })();
    return () => {
      vigente = false;
    };
  }, [cargar]);

  const filtros = { tipo, estado, buscar };
  const recargar = () => cargar(filtros);

  function elegirTipo(t: Tipo | "") {
    setTipo(t);
    setAbierto(null);
    void cargar({ ...filtros, tipo: t });
  }

  /** Corre una acción sobre la cuenta y recarga; los errores del servidor se muestran tal cual. */
  async function accion(fn: () => Promise<Response>, ok: string, generico: string) {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(await mensajeDeError(res, generico));
        return false;
      }
      setAviso(ok);
      await recargar();
      return true;
    } catch {
      setError("Error de conexión.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const patch = (u: Usuario, cuerpo: object) =>
    apiFetch(`/api/identity/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });

  async function restablecer(u: Usuario) {
    if (
      !window.confirm(
        `¿Restablecer la clave de ${u.username}? Se genera una nueva, se cierran sus sesiones y deberá cambiarla al entrar.`,
      )
    ) {
      return;
    }
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/identity/users/${u.id}/restablecer-clave`, {
        method: "POST",
      });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo restablecer la clave."));
        return;
      }
      setCredenciales((await res.json()) as { username: string; clave: string });
      setClaves((c) => sinLlave(c, u.id));
      await recargar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function verClave(u: Usuario) {
    if (claves[u.id] !== undefined) {
      setClaves((c) => sinLlave(c, u.id));
      return;
    }
    const res = await apiFetch(`/api/identity/users/${u.id}/clave`);
    if (!res.ok) {
      setError(await mensajeDeError(res, "No se pudo consultar la clave."));
      return;
    }
    const d = (await res.json()) as ConsultaClave;
    setClaves((c) => ({ ...c, [u.id]: d }));
  }

  function rolesBody(u: Usuario, rol: string, pais: string | null) {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, roleCode: rol, countryCode: pais }),
    };
  }

  function abrir(u: Usuario) {
    setAbierto(abierto === u.id ? null : u.id);
    setRolElegido("");
    setPaisElegido("");
    setFicha(null);
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "80rem", margin: "0 auto" }}>
      <VolverGestion />
      <h1 style={{ fontSize: "1.5rem", margin: "0.8rem 0 0.3rem" }}>Consultar usuarios</h1>
      <p style={{ margin: 0, color: "var(--texto-suave)", fontSize: "0.9rem" }}>
        Consulta, edita, inactiva o exporta las cuentas. Cada tipo se edita donde vive su ficha.
      </p>

      <div style={{ ...tarjeta, marginTop: "1rem", padding: "1rem" }}>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => elegirTipo(f.valor)}
              style={{
                ...boton,
                borderRadius: "1.2rem",
                background: tipo === f.valor ? "#3f51b5" : "white",
                color: tipo === f.valor ? "white" : "inherit",
                borderColor: tipo === f.valor ? "#3f51b5" : "#e3e7f0",
              }}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
        <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            placeholder="Buscar por usuario, nombre, correo o documento…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void recargar();
            }}
            style={{ ...input, flex: 1, minWidth: "16rem", width: "auto" }}
          />
          <select
            value={estado}
            onChange={(e) => {
              const v = e.target.value as "" | "ACTIVO" | "INACTIVO";
              setEstado(v);
              void cargar({ ...filtros, estado: v });
            }}
            style={{ ...input, width: "auto" }}
          >
            <option value="">Activos e inactivos</option>
            <option value="ACTIVO">Solo activos</option>
            <option value="INACTIVO">Solo inactivos</option>
          </select>
          <button style={boton} onClick={() => void recargar()}>
            Buscar
          </button>
          <button
            style={{ ...boton, borderColor: "var(--lgs-verde)" }}
            disabled={usuarios === null || usuarios.length === 0}
            onClick={() => usuarios !== null && descargarCsv(usuarios)}
            title="Exporta la lista filtrada. Las claves NO se exportan."
          >
            ⬇ Exportar CSV
          </button>
        </div>
      </div>

      <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
        {credenciales !== null && (
          <CajaCredenciales
            titulo="🔑 Clave restablecida"
            username={credenciales.username}
            clave={credenciales.clave}
            onCerrar={() => setCredenciales(null)}
          />
        )}
        {aviso !== null && <Aviso tipo="ok">{aviso}</Aviso>}
        {error !== null && <Aviso tipo="error">{error}</Aviso>}
        {usuarios !== null && usuarios.length >= LIMITE && (
          <Aviso tipo="info">
            Se muestran los primeros {LIMITE}. Afina con el buscador o los filtros.
          </Aviso>
        )}
      </div>

      <div style={{ ...tarjeta, marginTop: "1rem", padding: "0.4rem", overflowX: "auto" }}>
        {usuarios === null ? (
          <p style={{ padding: "1rem", color: "var(--texto-suave)" }}>Cargando…</p>
        ) : usuarios.length === 0 ? (
          <p style={{ padding: "1rem", color: "var(--texto-suave)" }}>
            No hay usuarios con ese filtro.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                <th style={celda}>Usuario</th>
                <th style={celda}>Nombre</th>
                <th style={celda}>Tipo · roles</th>
                <th style={celda}>Correo</th>
                <th style={celda}>Teléfono</th>
                <th style={celda}>Estado</th>
                <th style={celda}>Último ingreso</th>
                <th style={celda} />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const t = TIPOS[u.tipo];
                const esSistema = u.username === SISTEMA;
                const esYo = u.id === yo;
                return (
                  <Fragment key={u.id}>
                    <tr
                      style={{
                        borderTop: "1px solid #eef0f5",
                        background: abierto === u.id ? "#f7f8fd" : undefined,
                        opacity: u.estado === "ACTIVO" ? 1 : 0.6,
                      }}
                    >
                      <td style={celda}>
                        <strong>{u.username}</strong>
                        {u.solicitudPendiente && (
                          <span title="Pidió clave nueva" style={{ marginLeft: "0.3rem" }}>
                            🔔
                          </span>
                        )}
                        {u.debeCambiarPassword && (
                          <span style={{ display: "block", fontSize: "0.72rem", color: "#b26a00" }}>
                            debe cambiar clave
                          </span>
                        )}
                      </td>
                      <td style={celda}>
                        {u.persona ?? "—"}
                        {u.docNumero !== null && (
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.75rem",
                              color: "var(--texto-suave)",
                            }}
                          >
                            Doc. {u.docNumero}
                          </span>
                        )}
                      </td>
                      <td style={celda}>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "0.12rem 0.5rem",
                            borderRadius: "0.9rem",
                            background: t.fondo,
                            color: t.color,
                          }}
                        >
                          {t.icono} {t.titulo}
                        </span>
                        <span
                          style={{
                            display: "block",
                            marginTop: "0.2rem",
                            fontSize: "0.75rem",
                            color: "var(--texto-suave)",
                          }}
                        >
                          {u.roles.length === 0
                            ? "sin roles"
                            : u.roles
                                .map((r) => `${r.rol}${r.pais !== null ? ` (${r.pais})` : ""}`)
                                .join(", ")}
                        </span>
                      </td>
                      <td style={celda}>{u.email ?? "—"}</td>
                      <td style={celda}>{u.telefono ?? "—"}</td>
                      <td style={celda}>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: u.estado === "ACTIVO" ? "#1b5e20" : "#b71c1c",
                          }}
                        >
                          {u.estado}
                        </span>
                      </td>
                      <td style={celda}>
                        {u.ultimoLoginEn !== null
                          ? new Date(u.ultimoLoginEn).toLocaleDateString("es")
                          : "nunca"}
                      </td>
                      <td style={{ ...celda, textAlign: "right" }}>
                        {!esSistema && (
                          <button style={boton} onClick={() => abrir(u)}>
                            {abierto === u.id ? "Cerrar" : "Acciones"}
                          </button>
                        )}
                      </td>
                    </tr>

                    {abierto === u.id && (
                      <tr style={{ background: "#f7f8fd" }}>
                        <td colSpan={8} style={{ padding: "0.3rem 0.8rem 1rem" }}>
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              flexWrap: "wrap",
                              alignItems: "center",
                            }}
                          >
                            <label
                              style={{
                                display: "inline-flex",
                                gap: "0.35rem",
                                alignItems: "center",
                                fontSize: "0.82rem",
                                cursor: "pointer",
                              }}
                              title="Al entrar se le pide cambiar la clave antes de usar la plataforma."
                            >
                              <input
                                type="checkbox"
                                checked={u.debeCambiarPassword}
                                disabled={ocupado}
                                onChange={(e) =>
                                  void accion(
                                    () => patch(u, { debeCambiarPassword: e.target.checked }),
                                    e.target.checked
                                      ? `${u.username} deberá cambiar su clave al entrar.`
                                      : `${u.username} ya no está obligado a cambiar su clave.`,
                                    "No se pudo cambiar la opción.",
                                  )
                                }
                              />
                              Cambiar clave al entrar
                            </label>
                            <button
                              style={boton}
                              disabled={ocupado}
                              onClick={() => void restablecer(u)}
                            >
                              🔑 Restablecer clave
                            </button>
                            {puedeVerClaves && (
                              <button style={boton} onClick={() => void verClave(u)}>
                                {claves[u.id] !== undefined ? "🙈 Ocultar clave" : "👁 Ver clave"}
                              </button>
                            )}
                            {claves[u.id] !== undefined && (
                              <ClaveConsultada consulta={claves[u.id] as ConsultaClave} />
                            )}
                          </div>

                          <div
                            style={{
                              marginTop: "0.7rem",
                              display: "flex",
                              gap: "0.4rem",
                              flexWrap: "wrap",
                              alignItems: "center",
                              fontSize: "0.82rem",
                            }}
                          >
                            <strong>Roles:</strong>
                            {u.roles.map((r) => (
                              <span
                                key={`${r.rol}-${r.pais ?? ""}`}
                                style={{
                                  display: "inline-flex",
                                  gap: "0.3rem",
                                  alignItems: "center",
                                  padding: "0.15rem 0.3rem 0.15rem 0.6rem",
                                  borderRadius: "0.9rem",
                                  background: "#e3f2fd",
                                  color: "#0d47a1",
                                  fontWeight: 600,
                                }}
                              >
                                {r.rol} {r.pais !== null ? `(${r.pais})` : "(global)"}
                                {r.rol !== "alumno" && !esYo && (
                                  <button
                                    aria-label={`Quitar rol ${r.rol}`}
                                    title="Quitar este rol"
                                    disabled={ocupado}
                                    onClick={() => {
                                      if (
                                        !window.confirm(`¿Quitar el rol ${r.rol} a ${u.username}?`)
                                      )
                                        return;
                                      void accion(
                                        () =>
                                          apiFetch("/api/access/user-roles", {
                                            ...rolesBody(u, r.rol, r.pais),
                                            method: "DELETE",
                                          }),
                                        `Rol ${r.rol} quitado a ${u.username}.`,
                                        "No se pudo quitar el rol.",
                                      );
                                    }}
                                    style={{
                                      border: "none",
                                      background: "transparent",
                                      cursor: "pointer",
                                      color: "#0d47a1",
                                      fontWeight: 800,
                                    }}
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            ))}
                            <select
                              value={rolElegido}
                              onChange={(e) => setRolElegido(e.target.value)}
                              style={{ ...input, width: "auto", padding: "0.3rem 0.5rem" }}
                            >
                              <option value="">+ Asignar rol…</option>
                              {roles.map((r) => (
                                <option key={r.code} value={r.code}>
                                  {r.nombre}
                                </option>
                              ))}
                            </select>
                            {rolElegido !== "" && (
                              <>
                                <select
                                  value={paisElegido}
                                  onChange={(e) => setPaisElegido(e.target.value)}
                                  style={{ ...input, width: "auto", padding: "0.3rem 0.5rem" }}
                                >
                                  <option value="">Global</option>
                                  {PAISES.map((p) => (
                                    <option key={p.code} value={p.code}>
                                      {p.nombre}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  style={{ ...boton, borderColor: "var(--lgs-verde)" }}
                                  disabled={ocupado}
                                  onClick={() =>
                                    void accion(
                                      () =>
                                        apiFetch(
                                          "/api/access/user-roles",
                                          rolesBody(u, rolElegido, paisElegido || null),
                                        ),
                                      `Rol ${rolElegido} asignado a ${u.username}.`,
                                      "No se pudo asignar el rol.",
                                    ).then((hecho) => {
                                      if (hecho) setRolElegido("");
                                    })
                                  }
                                >
                                  Confirmar
                                </button>
                              </>
                            )}
                          </div>

                          <div
                            style={{
                              marginTop: "0.8rem",
                              display: "flex",
                              gap: "0.5rem",
                              flexWrap: "wrap",
                              alignItems: "center",
                            }}
                          >
                            {u.tipo === "estudiante" && u.personaId !== null && (
                              <Link href={`/panel/personas/${u.personaId}`} style={boton}>
                                ✏️ Editar datos del niño (Kids)
                              </Link>
                            )}
                            {u.tipo === "guia" && (
                              <Link href="/panel/guias" style={boton}>
                                ✏️ Editar ficha del guía (Guías)
                              </Link>
                            )}
                            {(u.tipo === "administrativo" || u.tipo === "otro") && (
                              <button
                                style={boton}
                                onClick={() =>
                                  setFicha(
                                    ficha === null
                                      ? {
                                          nombres: u.nombres ?? "",
                                          apellidos: u.apellidos ?? "",
                                          email: u.email ?? "",
                                          telefono: u.telefono ?? "",
                                          docNumero: u.docNumero ?? "",
                                        }
                                      : null,
                                  )
                                }
                              >
                                ✏️ {ficha === null ? "Editar datos" : "Cancelar edición"}
                              </button>
                            )}
                            {u.tipo === "estudiante" ? (
                              <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                                La cuenta del alumno sigue a su contrato: se activa al aprobarlo y
                                se apaga al vencer.
                              </span>
                            ) : (
                              !esYo && (
                                <button
                                  style={boton}
                                  disabled={ocupado}
                                  onClick={() => {
                                    const nuevo = u.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
                                    if (
                                      nuevo === "INACTIVO" &&
                                      !window.confirm(
                                        `¿Inactivar a ${u.username}? No podrá entrar y se cierran sus sesiones. Se puede reactivar.`,
                                      )
                                    )
                                      return;
                                    void accion(
                                      () => patch(u, { estado: nuevo }),
                                      nuevo === "INACTIVO"
                                        ? `${u.username} inactivado.`
                                        : `${u.username} reactivado.`,
                                      "No se pudo cambiar el estado.",
                                    );
                                  }}
                                >
                                  {u.estado === "ACTIVO" ? "⏸ Inactivar" : "▶ Reactivar"}
                                </button>
                              )
                            )}
                            {!esYo && (
                              <button
                                style={{
                                  ...boton,
                                  color: u.motivosNoBorrar.length === 0 ? "#b71c1c" : "#9e9e9e",
                                }}
                                disabled={ocupado || u.motivosNoBorrar.length > 0}
                                title={
                                  u.motivosNoBorrar.length > 0
                                    ? `No se puede eliminar: ${u.motivosNoBorrar.join(", ")}. Inactívala en su lugar.`
                                    : "Borra la cuenta: solo si se creó por error y nunca se usó."
                                }
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `¿ELIMINAR la cuenta ${u.username}? No se puede deshacer.`,
                                    )
                                  )
                                    return;
                                  void accion(
                                    () =>
                                      apiFetch(`/api/identity/users/${u.id}`, { method: "DELETE" }),
                                    `Cuenta ${u.username} eliminada.`,
                                    "No se pudo eliminar la cuenta.",
                                  ).then((hecho) => {
                                    if (hecho) setAbierto(null);
                                  });
                                }}
                              >
                                🗑 Eliminar
                              </button>
                            )}
                            {!esYo && u.motivosNoBorrar.length > 0 && (
                              <span style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>
                                No se puede eliminar: {u.motivosNoBorrar.join(", ")}.
                              </span>
                            )}
                          </div>

                          {ficha !== null && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void accion(
                                  () => patch(u, { ficha }),
                                  `Datos de ${u.username} guardados.`,
                                  "No se pudieron guardar los datos.",
                                ).then((hecho) => {
                                  if (hecho) setFicha(null);
                                });
                              }}
                              style={{
                                marginTop: "0.8rem",
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
                                gap: "0.5rem",
                              }}
                            >
                              {(
                                [
                                  ["nombres", "Nombre *"],
                                  ["apellidos", "Apellido *"],
                                  ["email", "Correo"],
                                  ["telefono", "Celular"],
                                  ["docNumero", "N° de identificación"],
                                ] as const
                              ).map(([campo, etiqueta]) => (
                                <input
                                  key={campo}
                                  placeholder={etiqueta}
                                  aria-label={etiqueta}
                                  required={campo === "nombres" || campo === "apellidos"}
                                  type={campo === "email" ? "email" : "text"}
                                  value={ficha[campo]}
                                  onChange={(e) => setFicha({ ...ficha, [campo]: e.target.value })}
                                  style={{ ...input, padding: "0.45rem 0.6rem" }}
                                />
                              ))}
                              <button
                                type="submit"
                                disabled={ocupado}
                                style={{ ...boton, borderColor: "var(--lgs-verde)" }}
                              >
                                💾 Guardar
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
