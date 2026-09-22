"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { apiFetch } from "@/ui/api-fetch";
import {
  Aviso,
  CajaCredenciales,
  ClaveConsultada,
  Encabezado,
  VolverGestion,
  boton,
  botonPrimario,
  input,
  mensajeDeError,
  nombrePais,
  sinLlave,
  tarjeta,
  type ConsultaClave,
} from "../comunes";

interface Contrato {
  id: string;
  numero: number;
  externalRef: string | null;
  estado: string;
  countryCode: string;
  tipoCurso: string;
  inicio: string;
  finalContrato: string;
  titular: string;
  titularEmail: string | null;
  titularTelefono: string | null;
  salon: string | null;
  campania: string | null;
}

interface Estudiante {
  personaId: string;
  nombre: string;
  docTipo: string;
  docNumero: string;
  fechaNacimiento: string | null;
  personaEstado: string;
  cuenta: { userId: string; username: string; estado: string } | null;
  apoderados: { nombre: string; telefono: string | null; parentesco: string | null }[];
  contratos: Contrato[];
}

const COLOR_ESTADO: Record<string, { fondo: string; texto: string }> = {
  PENDIENTE: { fondo: "#fff3cd", texto: "#7a5a00" },
  APROBADO: { fondo: "#e8f5e9", texto: "#1b5e20" },
  ONHOLD: { fondo: "#e3f2fd", texto: "#0d47a1" },
  INACTIVO: { fondo: "#f0f0f0", texto: "#616161" },
};

function Insignia({ texto, color }: { texto: string; color: { fondo: string; texto: string } }) {
  return (
    <span
      style={{
        fontSize: "0.72rem",
        fontWeight: 700,
        padding: "0.15rem 0.55rem",
        borderRadius: "0.9rem",
        background: color.fondo,
        color: color.texto,
        letterSpacing: "0.02em",
      }}
    >
      {texto}
    </span>
  );
}

function Dato({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ fontSize: "0.9rem" }}>
      <span style={{ color: "var(--texto-suave)" }}>{rotulo}: </span>
      {children}
    </div>
  );
}

export default function EstudiantePage() {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Estudiante[] | null>(null);
  const [puedeAprobar, setPuedeAprobar] = useState(false);
  const [puedeVerClaves, setPuedeVerClaves] = useState(false);
  const [claves, setClaves] = useState<Record<string, ConsultaClave>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [credenciales, setCredenciales] = useState<{
    titulo: string;
    username: string;
    clave: string;
  } | null>(null);

  async function buscar(texto = q) {
    const t = texto.trim();
    if (t.length < 2) {
      setError("Escribe al menos 2 caracteres.");
      return;
    }
    setError(null);
    const res = await apiFetch(`/api/contracts/estudiantes?q=${encodeURIComponent(t)}`);
    if (!res.ok) {
      setError(await mensajeDeError(res, "No se pudo buscar."));
      return;
    }
    const data = (await res.json()) as {
      estudiantes: Estudiante[];
      puedeAprobar: boolean;
      puedeVerClaves: boolean;
    };
    setResultados(data.estudiantes);
    setPuedeAprobar(data.puedeAprobar);
    setPuedeVerClaves(data.puedeVerClaves);
  }

  function onBuscar(event: FormEvent) {
    event.preventDefault();
    setAviso(null);
    void buscar();
  }

  async function aprobar(e: Estudiante, c: Contrato) {
    const renovacion = e.cuenta !== null;
    const texto = renovacion
      ? `¿Aprobar el contrato N° ${String(c.numero)} de ${e.nombre}? Se reactiva su cuenta ${e.cuenta?.username ?? ""} (mismo usuario y clave).`
      : `¿Aprobar el contrato N° ${String(c.numero)} de ${e.nombre}? Se crea su cuenta de alumno y se muestra la clave una vez.`;
    if (!window.confirm(texto)) return;
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/contracts/${c.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo aprobar el contrato."));
        return;
      }
      const r = (await res.json()) as {
        credenciales: { username: string; passwordInicial: string } | null;
        enrollmentId: string | null;
        reactivado: string | null;
      };
      if (r.credenciales !== null) {
        setCredenciales({
          titulo: "✅ Contrato aprobado y cuenta de alumno creada",
          username: r.credenciales.username,
          clave: r.credenciales.passwordInicial,
        });
      }
      const partes = [`Contrato N° ${String(c.numero)} aprobado.`];
      if (r.reactivado !== null) partes.push(`Cuenta ${e.cuenta?.username ?? ""} reactivada.`);
      partes.push(
        r.enrollmentId !== null
          ? "Quedó matriculado en su salón."
          : "Sin salón todavía: matricúlalo desde Contratos.",
      );
      setAviso(partes.join(" "));
      await buscar();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function restablecer(cuenta: { userId: string; username: string }) {
    if (
      !window.confirm(
        `¿Restablecer la clave de ${cuenta.username}? Se genera una nueva y deberá cambiarla al entrar.`,
      )
    ) {
      return;
    }
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/identity/users/${cuenta.userId}/restablecer-clave`, {
        method: "POST",
      });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo restablecer la clave."));
        return;
      }
      const d = (await res.json()) as { username: string; clave: string };
      setCredenciales({ titulo: "🔑 Clave restablecida", username: d.username, clave: d.clave });
      setClaves((c) => sinLlave(c, cuenta.userId));
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  async function verClave(userId: string) {
    if (claves[userId] !== undefined) {
      setClaves((c) => sinLlave(c, userId));
      return;
    }
    const res = await apiFetch(`/api/identity/users/${userId}/clave`);
    if (!res.ok) {
      setError(await mensajeDeError(res, "No se pudo consultar la clave."));
      return;
    }
    const d = (await res.json()) as ConsultaClave;
    setClaves((c) => ({ ...c, [userId]: d }));
  }

  /** Qué pasa con la cuenta y qué se puede hacer, según su estado y sus contratos. */
  function panelCuenta(e: Estudiante) {
    const pendiente = e.contratos.find((c) => c.estado === "PENDIENTE");
    const botonAprobar =
      pendiente !== undefined && puedeAprobar ? (
        <button
          style={botonPrimario("#5c6bc0", ocupado)}
          disabled={ocupado}
          onClick={() => void aprobar(e, pendiente)}
        >
          {e.cuenta === null
            ? `✓ Aprobar contrato N° ${String(pendiente.numero)} y crear cuenta`
            : `✓ Aprobar contrato N° ${String(pendiente.numero)} y reactivar`}
        </button>
      ) : null;

    if (e.cuenta === null) {
      return (
        <>
          <Aviso tipo="info">
            Aún no tiene cuenta. En KIDS la cuenta del alumno{" "}
            <strong>nace al aprobar su contrato</strong>
            {pendiente === undefined && " — y no tiene ninguno pendiente de aprobar"}.
          </Aviso>
          {botonAprobar}
        </>
      );
    }
    const c = claves[e.cuenta.userId];
    const activa = e.cuenta.estado === "ACTIVO";
    return (
      <>
        {activa ? (
          <Aviso tipo="ok">
            Ya tiene cuenta: <strong>{e.cuenta.username}</strong> (activa). No se puede duplicar.
          </Aviso>
        ) : (
          <Aviso tipo="error">
            Cuenta <strong>{e.cuenta.username}</strong> INACTIVA: su contrato venció o se inactivó.
            Se reactiva al aprobar un contrato nuevo (renovación), con el mismo usuario.
          </Aviso>
        )}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          {botonAprobar}
          <button
            style={boton}
            disabled={ocupado}
            onClick={() => e.cuenta !== null && void restablecer(e.cuenta)}
          >
            🔑 Restablecer clave
          </button>
          {puedeVerClaves && (
            <button
              style={boton}
              onClick={() => e.cuenta !== null && void verClave(e.cuenta.userId)}
            >
              {c !== undefined ? "🙈 Ocultar clave" : "👁 Ver clave"}
            </button>
          )}
          {c !== undefined && <ClaveConsultada consulta={c} />}
        </div>
      </>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "58rem", margin: "0 auto" }}>
      <VolverGestion />
      <Encabezado
        tipo="estudiante"
        titulo="Estudiante"
        descripcion="Busca al niño en KIDS. Su cuenta (rol alumno) nace al aprobar su contrato y se reactiva con la renovación."
      />

      <form
        onSubmit={onBuscar}
        style={{ ...tarjeta, display: "flex", gap: "0.6rem", flexWrap: "wrap" }}
      >
        <input
          autoFocus
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          placeholder="N° de contrato, N° LGS, documento, nombre o usuario…"
          style={{ ...input, flex: 1, minWidth: "16rem" }}
        />
        <button type="submit" style={botonPrimario("#5c6bc0")}>
          Buscar
        </button>
      </form>

      <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {credenciales !== null && (
          <CajaCredenciales
            titulo={credenciales.titulo}
            username={credenciales.username}
            clave={credenciales.clave}
            onCerrar={() => setCredenciales(null)}
          />
        )}
        {aviso !== null && <Aviso tipo="ok">{aviso}</Aviso>}
        {error !== null && <Aviso tipo="error">{error}</Aviso>}

        {resultados !== null && resultados.length === 0 && (
          <Aviso tipo="info">
            No se encontró ningún niño con esos datos. Si es nuevo, se registra con su contrato en{" "}
            <Link href="/panel/reservas">Reservas</Link> o{" "}
            <Link href="/panel/contratos">Contratos</Link>.
          </Aviso>
        )}

        {resultados?.map((e) => (
          <article key={e.personaId} style={tarjeta}>
            <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: "#2e7d32", fontSize: "1.1rem" }}>✓</span>
              <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Encontrado en KIDS</h2>
              <Insignia texto="BENEFICIARIO" color={{ fondo: "#e8eaf6", texto: "#3949ab" }} />
              {e.personaEstado !== "ACTIVA" && (
                <Insignia
                  texto="INACTIVO"
                  color={COLOR_ESTADO.INACTIVO ?? { fondo: "", texto: "" }}
                />
              )}
            </div>

            <div
              style={{
                marginTop: "0.9rem",
                padding: "0.9rem 1rem",
                background: "#f7f8fb",
                borderRadius: "0.7rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
                gap: "0.45rem 1.5rem",
              }}
            >
              <Dato rotulo="Nombre">{e.nombre}</Dato>
              <Dato rotulo="Documento">
                {e.docTipo} {e.docNumero}
              </Dato>
              <Dato rotulo="Nacimiento">{e.fechaNacimiento ?? "—"}</Dato>
              <Dato rotulo="Plataforma">
                {[...new Set(e.contratos.map((c) => nombrePais(c.countryCode)))].join(", ")}
              </Dato>
              {e.apoderados.map((a, i) => (
                <Dato key={i} rotulo={a.parentesco ?? "Apoderado"}>
                  {a.nombre}
                  {a.telefono !== null && ` · ${a.telefono}`}
                </Dato>
              ))}
            </div>

            <div style={{ marginTop: "0.9rem", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--texto-suave)" }}>
                    <th style={{ padding: "0.35rem" }}>Contrato</th>
                    <th style={{ padding: "0.35rem" }}>Curso</th>
                    <th style={{ padding: "0.35rem" }}>Vigencia</th>
                    <th style={{ padding: "0.35rem" }}>Salón</th>
                    <th style={{ padding: "0.35rem" }}>Titular</th>
                    <th style={{ padding: "0.35rem" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {e.contratos.map((c) => (
                    <tr key={c.id} style={{ borderTop: "1px solid #eef0f5" }}>
                      <td style={{ padding: "0.4rem 0.35rem" }}>
                        N° {c.numero}
                        {c.externalRef !== null && (
                          <span style={{ color: "var(--texto-suave)" }}> · {c.externalRef}</span>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.35rem" }}>{c.tipoCurso}</td>
                      <td style={{ padding: "0.4rem 0.35rem" }}>
                        {c.inicio} → {c.finalContrato}
                      </td>
                      <td style={{ padding: "0.4rem 0.35rem" }}>{c.salon ?? "—"}</td>
                      <td style={{ padding: "0.4rem 0.35rem" }}>
                        {c.titular}
                        {c.titularEmail !== null && (
                          <span style={{ display: "block", color: "var(--texto-suave)" }}>
                            {c.titularEmail}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.35rem" }}>
                        <Insignia
                          texto={c.estado}
                          color={COLOR_ESTADO[c.estado] ?? { fondo: "#f0f0f0", texto: "#616161" }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: "1rem",
                paddingTop: "1rem",
                borderTop: "1px solid #eef0f5",
                display: "flex",
                flexDirection: "column",
                gap: "0.7rem",
              }}
            >
              {panelCuenta(e)}
              <Link href={`/panel/personas/${e.personaId}`} style={{ fontSize: "0.85rem" }}>
                ✏️ Editar los datos del niño (Kids)
              </Link>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
