"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/**
 * Piezas compartidas de Gestión de Usuarios: tarjetas, campos y la caja de
 * credenciales. Solo presentación; las reglas viven en el servidor.
 */

export const PAISES = [
  { code: "CL", nombre: "Chile" },
  { code: "CO", nombre: "Colombia" },
  { code: "EC", nombre: "Ecuador" },
  { code: "PE", nombre: "Perú" },
] as const;

export const nombrePais = (code: string | null): string =>
  PAISES.find((p) => p.code === code)?.nombre ?? code ?? "Global";

/** Cada tipo de usuario con su color e icono, igual en el tablero y en su alta. */
export const TIPOS = {
  estudiante: { icono: "🎓", color: "#5c6bc0", fondo: "#e8eaf6", titulo: "Estudiante" },
  administrativo: { icono: "💼", color: "#1e88e5", fondo: "#e3f2fd", titulo: "Administrativo" },
  guia: { icono: "🧑‍🏫", color: "#2e9d6a", fondo: "#e0f5ec", titulo: "Guía" },
  otro: { icono: "👤", color: "#757575", fondo: "#f0f0f0", titulo: "Otro" },
} as const;

export const tarjeta: CSSProperties = {
  background: "white",
  border: "1px solid #e6e9f2",
  borderRadius: "1.1rem",
  padding: "1.5rem",
  boxShadow: "0 1px 3px rgba(20, 30, 60, 0.05)",
};

export const input: CSSProperties = {
  width: "100%",
  padding: "0.62rem 0.8rem",
  borderRadius: "0.6rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.95rem",
  background: "white",
  boxSizing: "border-box",
};

export const boton: CSSProperties = {
  padding: "0.42rem 0.9rem",
  borderRadius: "0.55rem",
  border: "1px solid #e3e7f0",
  background: "white",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

export function botonPrimario(color: string, deshabilitado = false): CSSProperties {
  return {
    padding: "0.7rem 1.4rem",
    borderRadius: "0.7rem",
    border: "none",
    background: color,
    color: "white",
    fontWeight: 700,
    fontSize: "0.95rem",
    cursor: deshabilitado ? "wait" : "pointer",
    opacity: deshabilitado ? 0.6 : 1,
  };
}

/** Rejilla de dos columnas que se apila en pantallas angostas. */
export const rejilla: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
  gap: "1rem 1.25rem",
};

export function Campo({
  etiqueta,
  obligatorio = false,
  ancho = false,
  ayuda,
  children,
}: {
  etiqueta: string;
  obligatorio?: boolean;
  /** Ocupa toda la fila. */
  ancho?: boolean;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        ...(ancho && { gridColumn: "1 / -1" }),
      }}
    >
      <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>
        {etiqueta}
        {obligatorio && <span style={{ color: "#e53935" }}> *</span>}
      </span>
      {children}
      {ayuda !== undefined && (
        <span style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>{ayuda}</span>
      )}
    </label>
  );
}

export function VolverGestion() {
  return (
    <Link
      href="/panel/usuarios"
      style={{ fontSize: "0.88rem", color: "var(--lgs-azul)", fontWeight: 600 }}
    >
      ← Gestión de usuarios
    </Link>
  );
}

export function Encabezado({
  tipo,
  titulo,
  descripcion,
}: {
  tipo: keyof typeof TIPOS;
  titulo: string;
  descripcion: string;
}) {
  const t = TIPOS[tipo];
  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center", margin: "0.8rem 0 1.2rem" }}>
      <span
        aria-hidden
        style={{
          width: "3.2rem",
          height: "3.2rem",
          borderRadius: "50%",
          background: t.fondo,
          display: "grid",
          placeItems: "center",
          fontSize: "1.5rem",
          flexShrink: 0,
        }}
      >
        {t.icono}
      </span>
      <div>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{titulo}</h1>
        <p style={{ margin: "0.2rem 0 0", color: "var(--texto-suave)", fontSize: "0.92rem" }}>
          {descripcion}
        </p>
      </div>
    </div>
  );
}

export function Aviso({ tipo, children }: { tipo: "error" | "ok" | "info"; children: ReactNode }) {
  const colores = {
    error: { fondo: "#fdecea", borde: "#f5c2c0", texto: "#b71c1c", icono: "⊗" },
    ok: { fondo: "#e8f5e9", borde: "#a5d6a7", texto: "#1b5e20", icono: "✓" },
    info: { fondo: "#fff8e1", borde: "#ffe08a", texto: "#6b5a1e", icono: "ℹ" },
  }[tipo];
  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      style={{
        display: "flex",
        gap: "0.55rem",
        alignItems: "flex-start",
        background: colores.fondo,
        border: `1px solid ${colores.borde}`,
        color: colores.texto,
        borderRadius: "0.7rem",
        padding: "0.75rem 0.9rem",
        fontSize: "0.9rem",
      }}
    >
      <span aria-hidden style={{ fontWeight: 800 }}>
        {colores.icono}
      </span>
      <div>{children}</div>
    </div>
  );
}

/** Usuario y clave recién generados: se muestran UNA vez. */
export function CajaCredenciales({
  titulo,
  username,
  clave,
  children,
  onCerrar,
}: {
  titulo: string;
  username: string;
  clave: string | null;
  children?: ReactNode;
  onCerrar: () => void;
}) {
  return (
    <div
      style={{
        padding: "1.1rem 1.25rem",
        background: "#e8f5e9",
        border: "2px solid var(--lgs-verde)",
        borderRadius: "0.9rem",
      }}
    >
      <strong>{titulo}</strong>
      <p style={{ margin: "0.5rem 0 0", fontFamily: "monospace", fontSize: "1.05rem" }}>
        Usuario: <strong>{username}</strong>
        {clave !== null && (
          <>
            {" "}
            · Clave: <strong>{clave}</strong>
          </>
        )}
      </p>
      <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem", color: "var(--texto-suave)" }}>
        Se muestra UNA vez aquí: entrégala ahora. Al entrar se le pedirá cambiarla.
      </p>
      {children}
      <button style={{ ...boton, marginTop: "0.7rem" }} onClick={onCerrar}>
        Entendido, cerrar
      </button>
    </div>
  );
}

/** Copia del mapa sin esa llave (p. ej. ocultar la clave de un usuario). */
export function sinLlave<T>(mapa: Record<string, T>, llave: string): Record<string, T> {
  const copia = { ...mapa };
  delete copia[llave];
  return copia;
}

/** Lo que devuelve "Ver clave": la clave, o por qué no se puede mostrar. */
export type ConsultaClave =
  { clave: string } | { clave: null; motivo: "SIN_COPIA" | "BOVEDA_APAGADA" | "ILEGIBLE" };

export const MOTIVO_SIN_CLAVE: Record<string, string> = {
  SIN_COPIA: "Sin copia: la cuenta es anterior a la bóveda. Restablécela para generar una.",
  BOVEDA_APAGADA: "La bóveda de claves no está configurada (PASSWORD_VAULT_KEY).",
  ILEGIBLE: "La copia no se pudo leer (¿cambió la llave?). Restablécela para reponerla.",
};

/** La clave consultada, o el motivo por el que no se puede mostrar. */
export function ClaveConsultada({ consulta }: { consulta: ConsultaClave }) {
  return consulta.clave !== null ? (
    <code
      style={{
        fontSize: "0.95rem",
        padding: "0.2rem 0.55rem",
        borderRadius: "0.4rem",
        background: "#fce4ec",
        color: "#880e4f",
      }}
    >
      {consulta.clave}
    </code>
  ) : (
    <span style={{ fontSize: "0.8rem", color: "#c62828" }}>
      {MOTIVO_SIN_CLAVE[consulta.motivo]}
    </span>
  );
}

/** Mensaje de error de una respuesta de la API, o uno genérico. */
export async function mensajeDeError(res: Response, generico: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as {
    error?: { message?: string; details?: string[] };
  } | null;
  const detalles = data?.error?.details?.join(" ") ?? "";
  return `${data?.error?.message ?? generico} ${detalles}`.trim();
}
