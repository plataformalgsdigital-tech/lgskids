"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";

/** Se recuerda por pestaña: el aviso no vuelve a saltar tras cerrarlo. */
const AVISO_DESCARTADO = "lgs-kids:aviso-login-descartado";

/** La URL de la página no cambia mientras está abierta: nada que escuchar. */
const sinSuscripcion = () => () => {};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [avisoUrl, setAvisoUrl] = useState<string | null>(null);
  // "¿Olvidaste tu clave?": deja una solicitud al equipo, que restablece la clave
  // y la entrega. La respuesta es la misma exista o no el usuario.
  const [olvido, setOlvido] = useState(false);
  const [usuarioOlvido, setUsuarioOlvido] = useState("");
  const [contactoOlvido, setContactoOlvido] = useState("");
  const [msgOlvido, setMsgOlvido] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviandoOlvido, setEnviandoOlvido] = useState(false);
  // Tras cambiar la clave se cierran las sesiones y se vuelve aquí: sin el
  // aviso, parece que el cambio "sacó" al usuario. En el servidor no hay URL.
  const claveCambiada = useSyncExternalStore(
    sinSuscripcion,
    () => new URLSearchParams(window.location.search).get("clave") === "cambiada",
    () => false,
  );

  async function pedirClaveNueva() {
    if (usuarioOlvido.trim() === "") {
      setMsgOlvido({ ok: false, texto: "Escribe tu usuario." });
      return;
    }
    setEnviandoOlvido(true);
    setMsgOlvido(null);
    try {
      const res = await fetch("/api/public/olvido-clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuarioOlvido.trim(), contacto: contactoOlvido || null }),
      });
      const data: { mensaje?: string; error?: { message: string } } = await res.json();
      setMsgOlvido(
        res.ok
          ? { ok: true, texto: data.mensaje ?? "Recibimos tu solicitud." }
          : { ok: false, texto: data.error?.message ?? "No se pudo enviar la solicitud." },
      );
    } catch {
      setMsgOlvido({ ok: false, texto: "Error de conexión. Intenta nuevamente." });
    } finally {
      setEnviandoOlvido(false);
    }
  }

  // Aviso de la pantalla de login: imagen que administración prende/apaga.
  // Si falla, el login sigue funcionando igual — nunca bloquea el ingreso.
  useEffect(() => {
    if (sessionStorage.getItem(AVISO_DESCARTADO) !== null) return;
    let vigente = true;
    fetch("/api/public/login-aviso")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { activo?: boolean; url?: string | null } | null) => {
        if (vigente && data?.activo === true && typeof data.url === "string") {
          setAvisoUrl(data.url);
        }
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  function cerrarAviso() {
    setAvisoUrl(null);
    sessionStorage.setItem(AVISO_DESCARTADO, "1");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data: { user?: { debeCambiarPassword: boolean }; error?: { message: string } } =
        await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo iniciar sesión.");
        return;
      }
      if (data.user?.debeCambiarPassword === true) {
        router.replace("/panel/cambiar-password");
        return;
      }
      // Los ALUMNOS van a su panel propio; el resto al panel de gestión.
      const me = await fetch("/api/auth/me");
      if (me.ok) {
        const perfil: { permisos: { code: string }[] } = await me.json();
        const codes = new Set(perfil.permisos.map((p) => p.code));
        const esAlumno =
          codes.has("panel.alumno") &&
          !codes.has("panel.administracion") &&
          !codes.has("panel.guia");
        router.replace(esAlumno ? "/mi-panel" : "/panel");
      } else {
        router.replace("/panel");
      }
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, var(--lgs-azul) 0%, var(--lgs-purpura) 100%)",
        padding: "1rem",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          background: "var(--fondo)",
          borderRadius: "1.25rem",
          padding: "2.5rem 2rem",
          width: "100%",
          maxWidth: "22rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <Image
          src="/logo.jpg"
          alt="LGS Kids"
          width={160}
          height={142}
          priority
          style={{ alignSelf: "center", height: "auto" }}
        />
        <p style={{ textAlign: "center", color: "var(--texto-suave)", fontSize: "0.95rem" }}>
          Ingresa con tu usuario
        </p>

        {claveCambiada && (
          <p
            role="status"
            style={{
              background: "#e8f5e9",
              border: "1px solid #a5d6a7",
              borderRadius: "0.6rem",
              padding: "0.6rem 0.75rem",
              fontSize: "0.88rem",
              textAlign: "center",
            }}
          >
            ✅ Clave cambiada. Entra con tu clave nueva.
          </p>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Usuario</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
            style={{
              padding: "0.65rem 0.75rem",
              borderRadius: "0.6rem",
              border: "1.5px solid #d8dce6",
              fontSize: "1rem",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{
              padding: "0.65rem 0.75rem",
              borderRadius: "0.6rem",
              border: "1.5px solid #d8dce6",
              fontSize: "1rem",
            }}
          />
        </label>

        {error !== null && (
          <p role="alert" style={{ color: "#c62828", fontSize: "0.9rem", textAlign: "center" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          style={{
            padding: "0.75rem",
            borderRadius: "0.75rem",
            border: "none",
            background: cargando ? "#9e9e9e" : "var(--lgs-azul)",
            color: "white",
            fontSize: "1.05rem",
            fontWeight: 700,
            cursor: cargando ? "wait" : "pointer",
          }}
        >
          {cargando ? "Entrando…" : "Entrar"}
        </button>

        {!olvido ? (
          <button
            type="button"
            onClick={() => {
              setOlvido(true);
              setUsuarioOlvido(username);
              setMsgOlvido(null);
            }}
            style={{
              alignSelf: "center",
              border: "none",
              background: "none",
              color: "var(--lgs-azul)",
              fontSize: "0.88rem",
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            ¿Olvidaste tu clave?
          </button>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              padding: "0.9rem",
              borderRadius: "0.8rem",
              background: "#f4f6fb",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
              Déjanos tu usuario y cómo contactarte. El equipo de LGS Kids te enviará una clave
              nueva; al entrar con ella te pediremos que la cambies.
            </p>
            <input
              placeholder="Tu usuario"
              value={usuarioOlvido}
              onChange={(e) => setUsuarioOlvido(e.target.value)}
              autoComplete="username"
              style={{
                padding: "0.55rem 0.7rem",
                borderRadius: "0.5rem",
                border: "1.5px solid #d8dce6",
              }}
            />
            <input
              placeholder="WhatsApp o correo para contactarte (opcional)"
              value={contactoOlvido}
              onChange={(e) => setContactoOlvido(e.target.value)}
              maxLength={200}
              style={{
                padding: "0.55rem 0.7rem",
                borderRadius: "0.5rem",
                border: "1.5px solid #d8dce6",
              }}
            />
            {msgOlvido !== null && (
              <p
                role="status"
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: msgOlvido.ok ? "#1b5e20" : "#c62828",
                }}
              >
                {msgOlvido.texto}
              </p>
            )}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => void pedirClaveNueva()}
                disabled={enviandoOlvido || msgOlvido?.ok === true}
                style={{
                  flex: 1,
                  padding: "0.55rem",
                  borderRadius: "0.6rem",
                  border: "none",
                  background: "var(--lgs-verde)",
                  color: "#1b2a10",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {enviandoOlvido ? "Enviando…" : "Pedir clave nueva"}
              </button>
              <button
                type="button"
                onClick={() => setOlvido(false)}
                style={{
                  padding: "0.55rem 0.8rem",
                  borderRadius: "0.6rem",
                  border: "1px solid #d8dce6",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Volver
              </button>
            </div>
          </div>
        )}
      </form>

      {avisoUrl !== null && (
        <div
          onClick={cerrarAviso}
          role="dialog"
          aria-modal="true"
          aria-label="Aviso"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(8,11,24,0.65)",
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
              position: "relative",
              width: "100%",
              maxWidth: "30rem",
              background: "white",
              borderRadius: "1rem",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            }}
          >
            <button
              type="button"
              onClick={cerrarAviso}
              aria-label="Cerrar aviso"
              style={{
                position: "absolute",
                top: "0.6rem",
                right: "0.6rem",
                zIndex: 2,
                width: "2rem",
                height: "2rem",
                borderRadius: "50%",
                border: "none",
                background: "white",
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                cursor: "pointer",
                fontSize: "1rem",
                lineHeight: 1,
                color: "#333",
              }}
            >
              ✕
            </button>
            {/* La sube administración: se muestra íntegra, sin recortar ni deformar. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avisoUrl}
              alt="Aviso"
              style={{ display: "block", width: "100%", height: "auto" }}
            />
            <button
              type="button"
              onClick={cerrarAviso}
              style={{
                width: "100%",
                padding: "0.8rem",
                border: "none",
                borderTop: "1px solid #eef1f7",
                background: "white",
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: 600,
                color: "#374151",
              }}
            >
              Cerrar y continuar al login
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
