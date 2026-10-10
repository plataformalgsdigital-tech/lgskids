"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Personaje } from "@/ui/Personaje";

/**
 * CREACIÓN DE PERFIL DEL NIÑO (2026-10-10): la abre el enlace que recibe el
 * apoderado por WhatsApp al aprobarse el contrato.
 *
 * PÚBLICA a propósito: el niño todavía no eligió su clave. Lo que la protege es
 * el token del enlace, que el servidor valida en cada llamada; sirve UNA vez.
 * Aquí el niño ve su usuario, elige su clave, completa su perfil y AGENDA su
 * Welcome (obligatorio). Todo se guarda junto, o nada.
 */

interface Welcome {
  id: string;
  startsAt: string;
  duracionMin: number;
  guia: string;
  libres: number;
}

type Ficha =
  | { estado: "INVALIDO" }
  | { estado: "USADO" | "REVOCADO"; nombre: string }
  | {
      estado: "VIGENTE";
      nombre: string;
      usuario: string;
      fechaNacimiento: string | null;
      curso: string | null;
      salon: string | null;
      inicioCurso: string | null;
      welcomes: Welcome[];
    };

const CLAVE_MIN = 8;
const TOPE_FOTO = 10 * 1024 * 1024;

const campo: CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.75rem",
  borderRadius: "0.6rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.98rem",
  fontFamily: "inherit",
  background: "white",
};
const rotulo: CSSProperties = {
  display: "block",
  fontSize: "0.82rem",
  fontWeight: 700,
  marginBottom: "0.25rem",
  color: "#3b4256",
};
const ayuda: CSSProperties = { fontSize: "0.76rem", color: "#6b7280", marginTop: "0.2rem" };
const marco: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "1.5rem 1rem",
  background: "linear-gradient(150deg, #eef4ff 0%, #f1fbef 100%)",
};
const tarjeta: CSSProperties = {
  width: "100%",
  maxWidth: "36rem",
  background: "white",
  borderRadius: "1rem",
  overflow: "hidden",
  boxShadow: "0 18px 50px rgba(23,30,60,0.14)",
};

/** "lunes 20 de octubre · 16:00" en el reloj de quien mira. */
function cuando(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  const hora = d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  return `${dia} · ${hora}`;
}

/** Problema de la clave, con la MISMA regla del servidor (8+, letras y números). */
function problemaClave(clave: string): string | null {
  if (clave.length < CLAVE_MIN) return `Al menos ${String(CLAVE_MIN)} caracteres.`;
  if (!/[a-zA-Z]/.test(clave)) return "Debe tener al menos una letra.";
  if (!/[0-9]/.test(clave)) return "Debe tener al menos un número.";
  return null;
}

export default function CrearPerfilPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [cargaError, setCargaError] = useState<string | null>(null);

  const [clave, setClave] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [sobreTi, setSobreTi] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [welcomeId, setWelcomeId] = useState("");
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<{ usuario: string; welcome: string | null } | null>(null);

  useEffect(() => {
    async function cargar() {
      const res = await fetch(`/api/public/perfil?t=${encodeURIComponent(token)}`);
      if (!res.ok) {
        setCargaError("No pudimos abrir tu enlace. Inténtalo de nuevo en un momento.");
        return;
      }
      const f = (await res.json()) as Ficha;
      setFicha(f);
      if (f.estado === "VIGENTE") setFechaNacimiento(f.fechaNacimiento ?? "");
    }
    void cargar();
  }, [token]);

  const fotoUrl = useMemo(() => (foto === null ? null : URL.createObjectURL(foto)), [foto]);
  useEffect(
    () => () => {
      if (fotoUrl !== null) URL.revokeObjectURL(fotoUrl);
    },
    [fotoUrl],
  );

  const problemas = {
    clave: problemaClave(clave),
    confirmacion: confirmacion !== clave ? "Las dos claves no coinciden." : null,
    sobreTi: sobreTi.trim() === "" ? "Cuéntanos algo sobre ti." : null,
    hobbies: hobbies.trim() === "" ? "Cuéntanos qué te gusta hacer." : null,
    fechaNacimiento: fechaNacimiento === "" ? "Falta tu fecha de nacimiento." : null,
    foto:
      foto === null
        ? "Sube una foto tuya."
        : foto.size > TOPE_FOTO
          ? "La foto pesa más de 10 MB."
          : null,
    welcome: welcomeId === "" ? "Elige tu sesión Welcome." : null,
  };
  const valido = Object.values(problemas).every((p) => p === null);
  const mostrar = (p: string | null) =>
    intento && p !== null ? (
      <div style={{ ...ayuda, color: "#c62828", fontWeight: 600 }}>{p}</div>
    ) : null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setIntento(true);
    setError(null);
    if (!valido || foto === null) return;
    setEnviando(true);
    try {
      const form = new FormData();
      form.set("t", token);
      form.set("clave", clave);
      form.set("confirmacion", confirmacion);
      form.set("sobreTi", sobreTi);
      form.set("hobbies", hobbies);
      form.set("fechaNacimiento", fechaNacimiento);
      form.set("welcomeId", welcomeId);
      form.set("foto", foto);
      const res = await fetch("/api/public/perfil", { method: "POST", body: form });
      const cuerpo = (await res.json().catch(() => ({}))) as {
        usuario?: string;
        welcome?: { startsAt: string } | null;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(cuerpo.error?.message ?? "No se pudo guardar. Inténtalo de nuevo.");
        return;
      }
      setListo({
        usuario: cuerpo.usuario ?? "",
        welcome: cuerpo.welcome ? cuando(cuerpo.welcome.startsAt) : null,
      });
    } finally {
      setEnviando(false);
    }
  }

  if (cargaError !== null || ficha?.estado === "INVALIDO") {
    return (
      <main style={marco}>
        <div style={{ ...tarjeta, padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "2.4rem", marginBottom: "0.5rem" }}>🔒</div>
          <h1 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>Enlace no válido</h1>
          <p style={{ color: "#6b7280" }}>
            {cargaError ??
              "Revisa que el enlace esté completo, tal como llegó por WhatsApp. Si el problema sigue, escríbenos."}
          </p>
        </div>
      </main>
    );
  }

  if (ficha === null) {
    return (
      <main style={marco}>
        <p style={{ color: "#6b7280" }}>Cargando…</p>
      </main>
    );
  }

  if (listo !== null || ficha.estado !== "VIGENTE") {
    return (
      <main style={marco}>
        <div style={{ ...tarjeta, padding: "2rem", textAlign: "center" }}>
          <Personaje quien="rocky-celebrando" alto="7rem" />
          <h1 style={{ fontSize: "1.35rem", margin: "0.6rem 0 0.4rem" }}>
            {listo !== null ? "¡Tu perfil está listo!" : `¡Hola ${ficha.nombre}!`}
          </h1>
          {listo !== null ? (
            <>
              <p style={{ color: "#4b5563", marginBottom: "0.8rem" }}>
                Ya puedes entrar a la plataforma con tu usuario <strong>{listo.usuario}</strong> y
                la clave que elegiste.
              </p>
              {listo.welcome !== null && (
                <p
                  style={{
                    background: "#e8f5e9",
                    border: "1px solid #a5d6a7",
                    borderRadius: "0.7rem",
                    padding: "0.7rem",
                    marginBottom: "0.9rem",
                  }}
                >
                  👋 Tu sesión <strong>Welcome</strong> es el <strong>{listo.welcome}</strong>. ¡Te
                  esperamos!
                </p>
              )}
            </>
          ) : (
            <p style={{ color: "#4b5563", marginBottom: "0.9rem" }}>
              {ficha.estado === "USADO"
                ? "Tu perfil ya fue creado con este enlace. Entra a la plataforma con tu usuario y tu clave."
                : "Este enlace fue reemplazado por uno más nuevo. Usa el último que te llegó por WhatsApp."}
            </p>
          )}
          <a
            href="/login"
            style={{
              display: "inline-block",
              padding: "0.7rem 1.4rem",
              borderRadius: "0.6rem",
              background: "var(--lgs-purpura, #6a1b9a)",
              color: "white",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Ir a la plataforma
          </a>
        </div>
      </main>
    );
  }

  const sinWelcome = ficha.welcomes.length === 0;
  const todosLlenos = !sinWelcome && ficha.welcomes.every((w) => w.libres === 0);

  return (
    <main style={marco}>
      <form onSubmit={(e) => void enviar(e)} style={tarjeta} noValidate>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.9rem",
            padding: "1.2rem 1.4rem",
            background: "linear-gradient(135deg, #e3f2fd, #e8f5e9)",
          }}
        >
          <Personaje quien="rocky-alegre" alto="5.5rem" />
          <div>
            <h1 style={{ fontSize: "1.3rem", margin: 0 }}>
              ¡{ficha.nombre}, te estábamos esperando!
            </h1>
            <p style={{ margin: "0.25rem 0 0", color: "#4b5563", fontSize: "0.9rem" }}>
              Crea tu clave, cuéntanos de ti y elige tu sesión Welcome.
            </p>
          </div>
        </div>

        <div style={{ padding: "1.2rem 1.4rem 1.5rem", display: "grid", gap: "1rem" }}>
          <div
            style={{
              background: "#f6f8ff",
              border: "1.5px solid #dbe3ff",
              borderRadius: "0.8rem",
              padding: "0.8rem 1rem",
            }}
          >
            <div style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 700 }}>
              TU USUARIO PARA ENTRAR
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "0.02em" }}>
              {ficha.usuario}
            </div>
            {ficha.curso !== null && (
              <div style={{ fontSize: "0.82rem", color: "#4b5563" }}>
                {ficha.curso === "JUNIOR" ? "Junior" : "Youngster"} · {ficha.salon}
              </div>
            )}
          </div>

          <div
            className="perfil-dos"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}
          >
            <div>
              <label style={rotulo} htmlFor="p-clave">
                Crea tu clave *
              </label>
              <input
                id="p-clave"
                type={verClave ? "text" : "password"}
                autoComplete="new-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                style={campo}
              />
              {mostrar(problemas.clave)}
            </div>
            <div>
              <label style={rotulo} htmlFor="p-conf">
                Repite tu clave *
              </label>
              <input
                id="p-conf"
                type={verClave ? "text" : "password"}
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                style={campo}
              />
              {mostrar(problemas.confirmacion)}
            </div>
          </div>
          <div style={{ ...ayuda, marginTop: "-0.6rem" }}>
            Al menos {CLAVE_MIN} caracteres, con letras y números.{" "}
            <button
              type="button"
              onClick={() => setVerClave((v) => !v)}
              style={{
                border: "none",
                background: "none",
                color: "#1565c0",
                cursor: "pointer",
                padding: 0,
                fontSize: "inherit",
              }}
            >
              {verClave ? "Ocultar clave" : "Ver clave"}
            </button>
          </div>

          <div>
            <label style={rotulo} htmlFor="p-sobre">
              Cuéntanos sobre ti *
            </label>
            <textarea
              id="p-sobre"
              rows={3}
              maxLength={1000}
              value={sobreTi}
              onChange={(e) => setSobreTi(e.target.value)}
              placeholder="¿Cómo te llamas, cuántos años tienes, dónde vives?"
              style={campo}
            />
            {mostrar(problemas.sobreTi)}
          </div>

          <div>
            <label style={rotulo} htmlFor="p-hobbies">
              Hobbies e intereses *
            </label>
            <textarea
              id="p-hobbies"
              rows={2}
              maxLength={1000}
              value={hobbies}
              onChange={(e) => setHobbies(e.target.value)}
              placeholder="¿Qué te gusta hacer? Deportes, música, juegos…"
              style={campo}
            />
            {mostrar(problemas.hobbies)}
          </div>

          <div
            className="perfil-dos"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}
          >
            <div>
              <label style={rotulo} htmlFor="p-nac">
                Fecha de nacimiento *
              </label>
              <input
                id="p-nac"
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                style={campo}
              />
              <div style={ayuda}>Revisa que esté bien.</div>
              {mostrar(problemas.fechaNacimiento)}
            </div>
            <div>
              <label style={rotulo} htmlFor="p-foto">
                Tu foto *
              </label>
              <input
                id="p-foto"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                style={{ ...campo, padding: "0.45rem" }}
              />
              {fotoUrl !== null && (
                // eslint-disable-next-line @next/next/no-img-element -- previo local (blob:)
                <img
                  src={fotoUrl}
                  alt="Tu foto"
                  style={{
                    marginTop: "0.4rem",
                    width: "4.5rem",
                    height: "4.5rem",
                    objectFit: "cover",
                    borderRadius: "50%",
                  }}
                />
              )}
              {mostrar(problemas.foto)}
            </div>
          </div>

          <div>
            <span style={rotulo}>Elige tu sesión Welcome *</span>
            {sinWelcome || todosLlenos ? (
              <div
                style={{
                  background: "#fff8e1",
                  border: "1px solid #ffe082",
                  borderRadius: "0.7rem",
                  padding: "0.75rem 0.9rem",
                  fontSize: "0.88rem",
                }}
              >
                {sinWelcome
                  ? "Todavía no hay sesiones Welcome programadas para ti."
                  : "Todas las sesiones Welcome están llenas por ahora."}{" "}
                Vuelve a abrir este enlace más tarde, o escríbenos para que te ayudemos. Tu perfil
                se guarda cuando eliges tu Welcome.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.4rem" }}>
                {ficha.welcomes.map((w) => {
                  const lleno = w.libres === 0;
                  const elegido = welcomeId === w.id;
                  return (
                    <label
                      key={w.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        padding: "0.6rem 0.75rem",
                        borderRadius: "0.7rem",
                        border: `1.5px solid ${elegido ? "#43a047" : "#e3e7f0"}`,
                        background: elegido ? "#e8f5e9" : lleno ? "#f5f5f5" : "white",
                        opacity: lleno ? 0.55 : 1,
                        cursor: lleno ? "not-allowed" : "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="welcome"
                        value={w.id}
                        disabled={lleno}
                        checked={elegido}
                        onChange={() => setWelcomeId(w.id)}
                      />
                      <span style={{ flex: 1 }}>
                        <strong style={{ textTransform: "capitalize" }}>
                          {cuando(w.startsAt)}
                        </strong>
                        <span style={{ display: "block", fontSize: "0.8rem", color: "#6b7280" }}>
                          {String(w.duracionMin)} min · con {w.guia}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          color: lleno ? "#c62828" : "#2e7d32",
                        }}
                      >
                        {lleno ? "LLENO" : `${String(w.libres)} cupos`}
                      </span>
                    </label>
                  );
                })}
                <div style={ayuda}>La hora está en la zona horaria de este dispositivo.</div>
              </div>
            )}
            {!sinWelcome && !todosLlenos && mostrar(problemas.welcome)}
          </div>

          {error !== null && (
            <p role="alert" style={{ color: "#c62828", fontWeight: 600, margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || sinWelcome || todosLlenos}
            style={{
              padding: "0.8rem 1.4rem",
              borderRadius: "0.7rem",
              border: "none",
              fontWeight: 800,
              fontSize: "1rem",
              cursor: enviando ? "wait" : "pointer",
              background: sinWelcome || todosLlenos ? "#c9c6d8" : "var(--lgs-purpura, #6a1b9a)",
              color: "white",
              fontFamily: "inherit",
            }}
          >
            {enviando ? "Guardando…" : "Crear mi perfil"}
          </button>
        </div>
      </form>
      <style>{`@media (max-width: 560px) { .perfil-dos { grid-template-columns: 1fr !important; } }`}</style>
    </main>
  );
}
