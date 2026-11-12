"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Datos {
  nino: {
    nombres: string;
    apellidos: string;
    docTipo: string;
    docNumero: string;
    username: string | null;
    fechaNacimiento: string | null;
    email: string | null;
    telefono: string | null;
  };
  apoderado: {
    nombres: string;
    apellidos: string;
    docTipo: string;
    docNumero: string;
    email: string | null;
    telefono: string | null;
    parentesco: string | null;
    esTitular: boolean;
    otrosNinos: number;
  } | null;
}

const btn: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.6rem",
  border: "1px solid #d8dce6",
  background: "white",
  fontWeight: 600,
  cursor: "pointer",
};
const campo: CSSProperties = {
  padding: "0.45rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
  width: "100%",
  boxSizing: "border-box",
};
const fijo: CSSProperties = { ...campo, background: "#f3f5f9", color: "#5a6172" };

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 }}>
      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--texto-suave)" }}>
        {etiqueta}
      </span>
      {children}
    </label>
  );
}

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
  gap: "0.7rem",
};

/**
 * "✏️ Editar datos" de la ficha del niño. Se editan sus datos personales y los
 * de su apoderado. Nombre, documento y usuario del niño se ven pero NO se
 * cambian, y nada de lo académico ni del contrato está aquí (el servidor ni lo
 * recibe).
 */
export function EditarDatosModal({
  childPersonId,
  onCerrar,
}: {
  childPersonId: string;
  onCerrar: (guardado: boolean) => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch(`/api/contracts/ninos/${childPersonId}/datos`);
      const d: Datos & { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(d.error?.message ?? "No se pudieron cargar los datos.");
        return;
      }
      setDatos(d);
    }
    void cargar();
  }, [childPersonId]);

  const nino = (k: "fechaNacimiento" | "email" | "telefono", v: string) =>
    setDatos((d) => (d === null ? d : { ...d, nino: { ...d.nino, [k]: v } }));
  const apod = (k: "nombres" | "apellidos" | "email" | "telefono" | "parentesco", v: string) =>
    setDatos((d) =>
      d === null || d.apoderado === null ? d : { ...d, apoderado: { ...d.apoderado, [k]: v } },
    );

  async function guardar() {
    if (datos === null) return;
    if (datos.nino.fechaNacimiento === null || datos.nino.fechaNacimiento === "") {
      setError("La fecha de nacimiento es obligatoria.");
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      const a = datos.apoderado;
      const res = await apiFetch(`/api/contracts/ninos/${childPersonId}/datos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nino: {
            fechaNacimiento: datos.nino.fechaNacimiento,
            email: datos.nino.email ?? "",
            telefono: datos.nino.telefono ?? "",
          },
          apoderado:
            a === null
              ? null
              : {
                  nombres: a.nombres,
                  apellidos: a.apellidos,
                  email: a.email ?? "",
                  telefono: a.telefono ?? "",
                  parentesco: a.parentesco ?? "",
                },
        }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo guardar.");
        return;
      }
      onCerrar(true);
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  const a = datos?.apoderado ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editar datos del niño y del apoderado"
      onClick={() => onCerrar(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "1rem",
          padding: "1.4rem",
          width: "min(44rem, 100%)",
          maxHeight: "92vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>✏️ Editar datos</h2>
        {datos === null ? (
          <p style={{ margin: 0, color: "var(--texto-suave)" }}>{error ?? "Cargando…"}</p>
        ) : (
          <>
            <section style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Niño</h3>
              <div style={grid}>
                <Campo etiqueta="Nombres (no se edita)">
                  <input value={datos.nino.nombres} disabled style={fijo} />
                </Campo>
                <Campo etiqueta="Apellidos (no se edita)">
                  <input value={datos.nino.apellidos} disabled style={fijo} />
                </Campo>
                <Campo etiqueta="Documento (no se edita)">
                  <input
                    value={`${datos.nino.docTipo} ${datos.nino.docNumero}`}
                    disabled
                    style={fijo}
                  />
                </Campo>
                <Campo etiqueta="Usuario (no se edita)">
                  <input value={datos.nino.username ?? "—"} disabled style={fijo} />
                </Campo>
                <Campo etiqueta="Fecha de nacimiento">
                  <input
                    type="date"
                    value={datos.nino.fechaNacimiento ?? ""}
                    onChange={(e) => nino("fechaNacimiento", e.target.value)}
                    style={campo}
                  />
                </Campo>
                <Campo etiqueta="Correo">
                  <input
                    type="email"
                    value={datos.nino.email ?? ""}
                    onChange={(e) => nino("email", e.target.value)}
                    style={campo}
                  />
                </Campo>
                <Campo etiqueta="Teléfono">
                  <input
                    value={datos.nino.telefono ?? ""}
                    onChange={(e) => nino("telefono", e.target.value)}
                    style={campo}
                  />
                </Campo>
              </div>
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Apoderado</h3>
              {a === null ? (
                <p style={{ margin: 0, color: "var(--texto-suave)", fontSize: "0.88rem" }}>
                  Este niño no tiene apoderado registrado.
                </p>
              ) : (
                <>
                  {(a.esTitular || a.otrosNinos > 0) && (
                    <p
                      style={{
                        margin: 0,
                        padding: "0.5rem 0.7rem",
                        borderRadius: "0.6rem",
                        background: "#fff8e1",
                        color: "#6d4c00",
                        fontSize: "0.82rem",
                      }}
                    >
                      {a.esTitular &&
                        "Es también el TITULAR del contrato: su nombre no se cambia aquí. "}
                      {a.otrosNinos > 0 &&
                        `Es apoderado de ${String(a.otrosNinos)} niño(s) más: el cambio también se verá en sus fichas.`}
                    </p>
                  )}
                  <div style={grid}>
                    <Campo etiqueta={a.esTitular ? "Nombres (titular, no se edita)" : "Nombres"}>
                      <input
                        value={a.nombres}
                        disabled={a.esTitular}
                        onChange={(e) => apod("nombres", e.target.value)}
                        style={a.esTitular ? fijo : campo}
                      />
                    </Campo>
                    <Campo
                      etiqueta={a.esTitular ? "Apellidos (titular, no se edita)" : "Apellidos"}
                    >
                      <input
                        value={a.apellidos}
                        disabled={a.esTitular}
                        onChange={(e) => apod("apellidos", e.target.value)}
                        style={a.esTitular ? fijo : campo}
                      />
                    </Campo>
                    <Campo etiqueta="Documento (no se edita)">
                      <input value={`${a.docTipo} ${a.docNumero}`} disabled style={fijo} />
                    </Campo>
                    <Campo etiqueta="Parentesco">
                      <input
                        value={a.parentesco ?? ""}
                        onChange={(e) => apod("parentesco", e.target.value)}
                        style={campo}
                      />
                    </Campo>
                    <Campo etiqueta="Correo">
                      <input
                        type="email"
                        value={a.email ?? ""}
                        onChange={(e) => apod("email", e.target.value)}
                        style={campo}
                      />
                    </Campo>
                    <Campo etiqueta="Teléfono (WhatsApp, con indicativo)">
                      <input
                        value={a.telefono ?? ""}
                        onChange={(e) => apod("telefono", e.target.value)}
                        style={campo}
                      />
                    </Campo>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                    Si el niño usa el mismo correo o teléfono del apoderado y aquí cambias el del
                    apoderado, el niño toma el nuevo.
                  </p>
                </>
              )}
            </section>

            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--texto-suave)" }}>
              Lo académico (salón, curso, nivel) y el contrato no se editan aquí.
            </p>
            {error !== null && (
              <p role="alert" style={{ margin: 0, color: "#c62828", fontWeight: 600 }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" onClick={() => onCerrar(false)} style={btn}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={ocupado}
                style={{
                  ...btn,
                  border: "none",
                  background: ocupado ? "#9e9e9e" : "var(--lgs-azul)",
                  color: "white",
                  fontWeight: 700,
                }}
              >
                {ocupado ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
