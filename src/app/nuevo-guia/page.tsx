"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Registro del GUÍA por enlace (wizard de 3 pasos, como en MOSAICO).
 *
 * PÚBLICA a propósito: el guía todavía no entra al panel. Lo que la protege es
 * el token del enlace (`?t=`), que el servidor valida en cada llamada. Sin
 * token la página no muestra ni pide nada.
 *
 * La cuenta ya existe —la crea administración en Usuarios y roles—; aquí el
 * guía solo completa su ficha.
 */

const PAISES = [
  { codigo: "CL", nombre: "Chile" },
  { codigo: "CO", nombre: "Colombia" },
  { codigo: "EC", nombre: "Ecuador" },
  { codigo: "PE", nombre: "Perú" },
];

const PASOS = ["Datos básicos", "Contacto", "Zoom y foto"];

interface Ficha {
  username: string;
  nombres: string | null;
  apellidos: string | null;
  docNumero: string | null;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  domicilio: string | null;
  fechaNacimiento: string | null;
  zoomUrl: string | null;
  tieneFoto: boolean;
  expiraEn: string;
}

type Campos = {
  nombres: string;
  apellidos: string;
  docNumero: string;
  email: string;
  telefono: string;
  pais: string;
  domicilio: string;
  fechaNacimiento: string;
  zoomUrl: string;
};

const VACIOS: Campos = {
  nombres: "",
  apellidos: "",
  docNumero: "",
  email: "",
  telefono: "",
  pais: "",
  domicilio: "",
  fechaNacimiento: "",
  zoomUrl: "",
};

const campo: CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.7rem",
  borderRadius: "0.6rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.95rem",
  fontFamily: "inherit",
  background: "white",
};
const malo: CSSProperties = { ...campo, borderColor: "#e57373" };
const rotulo: CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 700,
  marginBottom: "0.2rem",
  color: "#3b4256",
};
const aviso: CSSProperties = { fontSize: "0.74rem", color: "#c62828", marginTop: "0.15rem" };
const boton: CSSProperties = {
  padding: "0.7rem 1.4rem",
  borderRadius: "0.6rem",
  border: "none",
  fontWeight: 700,
  fontSize: "0.95rem",
  cursor: "pointer",
  fontFamily: "inherit",
};

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
}

export default function NuevoGuiaPage() {
  return (
    <Suspense fallback={null}>
      <Wizard />
    </Suspense>
  );
}

function Wizard() {
  // El token se lee en el render (no en un efecto): así el estado inicial ya
  // sabe si el enlace venía completo y no hace falta un segundo render.
  const token = useSearchParams().get("t")?.trim() ?? "";
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [cargaError, setCargaError] = useState<string | null>(
    token === "" ? "Este enlace está incompleto. Pídele a tu coordinación el enlace de registro." : null,
  );
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState<Campos>(VACIOS);
  const [errores, setErrores] = useState<Partial<Record<keyof Campos | "foto", string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPrevio, setFotoPrevio] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token === "") return;
    fetch(`/api/public/guia-invitacion?t=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data: Ficha & { error?: { message?: string } } = await r.json();
        if (!r.ok) {
          setCargaError(data.error?.message ?? "Este enlace no es válido.");
          return;
        }
        setFicha(data);
        setForm({
          nombres: data.nombres ?? "",
          apellidos: data.apellidos ?? "",
          docNumero: data.docNumero ?? "",
          email: data.email ?? "",
          telefono: data.telefono ?? "",
          pais: data.pais ?? "",
          domicilio: data.domicilio ?? "",
          fechaNacimiento: data.fechaNacimiento ?? "",
          zoomUrl: data.zoomUrl ?? "",
        });
      })
      .catch(() => {
        setCargaError("No se pudo abrir el enlace. Revisa tu conexión e inténtalo de nuevo.");
      });
  }, [token]);

  useEffect(() => {
    return () => {
      if (fotoPrevio !== null) URL.revokeObjectURL(fotoPrevio);
    };
  }, [fotoPrevio]);

  function set(k: keyof Campos, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
    setErrores((p) => {
      const c = { ...p };
      delete c[k];
      return c;
    });
  }

  function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f === undefined) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setErrores((p) => ({ ...p, foto: "La foto debe ser JPG, PNG o WebP." }));
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setErrores((p) => ({ ...p, foto: "La foto no puede pesar más de 10 MB." }));
      return;
    }
    setFoto(f);
    setFotoPrevio(URL.createObjectURL(f));
    setErrores((p) => {
      const c = { ...p };
      delete c.foto;
      return c;
    });
  }

  function validar(n: number): boolean {
    const e: Partial<Record<keyof Campos | "foto", string>> = {};
    if (n === 1) {
      if (form.nombres.trim() === "") e.nombres = "Requerido";
      if (form.apellidos.trim() === "") e.apellidos = "Requerido";
      if (form.docNumero.trim() === "") e.docNumero = "Requerido";
      if (form.fechaNacimiento === "") e.fechaNacimiento = "Requerido";
    }
    if (n === 2) {
      if (form.email.trim() === "") e.email = "Requerido";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Correo no válido";
      if (form.telefono.trim() === "") e.telefono = "Requerido";
      if (form.pais === "") e.pais = "Requerido";
      if (form.domicilio.trim() === "") e.domicilio = "Requerido";
    }
    if (n === 3) {
      if (form.zoomUrl.trim() === "") e.zoomUrl = "Requerido";
      if (foto === null && ficha?.tieneFoto !== true) e.foto = "La foto de perfil es obligatoria";
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  function siguiente() {
    if (validar(paso)) {
      setPaso((p) => p + 1);
      window.scrollTo(0, 0);
    }
  }

  async function enviar() {
    if (!validar(3) || token === "") return;
    setEnviando(true);
    setApiError(null);
    try {
      const fd = new FormData();
      fd.set("t", token);
      for (const [k, v] of Object.entries(form)) fd.set(k, v.trim());
      if (foto !== null) fd.set("foto", foto);
      const res = await fetch("/api/public/guia-invitacion", { method: "POST", body: fd });
      const data: { error?: { message?: string } } = await res.json();
      if (!res.ok) {
        setApiError(data.error?.message ?? "No se pudo guardar el registro.");
        return;
      }
      setListo(true);
    } catch {
      setApiError("No se pudo guardar el registro. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const marco: CSSProperties = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "1.5rem 1rem",
    background: "linear-gradient(150deg, #eef4ff 0%, #f7f2ff 100%)",
  };
  const tarjeta: CSSProperties = {
    width: "100%",
    maxWidth: "34rem",
    background: "white",
    borderRadius: "1rem",
    overflow: "hidden",
    boxShadow: "0 18px 50px rgba(23,30,60,0.14)",
  };

  if (cargaError !== null) {
    return (
      <main style={marco}>
        <div style={{ ...tarjeta, padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "2.4rem", marginBottom: "0.5rem" }}>🔒</div>
          <h1 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>Enlace no disponible</h1>
          <p style={{ color: "var(--texto-suave)" }}>{cargaError}</p>
        </div>
      </main>
    );
  }

  if (listo) {
    return (
      <main style={marco}>
        <div style={{ ...tarjeta, padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "2.6rem", marginBottom: "0.5rem" }}>✅</div>
          <h1 style={{ fontSize: "1.3rem", marginBottom: "0.4rem" }}>Registro completo</h1>
          <p style={{ color: "var(--texto-suave)", marginBottom: "0.4rem" }}>
            Tus datos quedaron guardados. Ya puedes cerrar esta página.
          </p>
          <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>
            Entra a la plataforma con tu usuario <strong>{ficha?.username}</strong> y la clave que te
            dio tu coordinación.
          </p>
          <a href="/login" style={{ display: "inline-block", marginTop: "1rem", fontWeight: 700 }}>
            Ir a iniciar sesión
          </a>
        </div>
      </main>
    );
  }

  if (ficha === null) {
    return (
      <main style={marco}>
        <div style={{ ...tarjeta, padding: "2rem", textAlign: "center", color: "var(--texto-suave)" }}>
          Abriendo tu enlace…
        </div>
      </main>
    );
  }

  return (
    <main style={marco}>
      <div style={tarjeta}>
        <header
          style={{
            padding: "1.2rem 1.4rem",
            background: "linear-gradient(120deg, var(--lgs-azul) 0%, var(--lgs-purpura) 130%)",
            color: "white",
          }}
        >
          <h1 style={{ fontSize: "1.2rem", fontWeight: 800 }}>Registro de Guía</h1>
          <p style={{ fontSize: "0.85rem", opacity: 0.9 }}>
            LGS Kids · usuario <strong>{ficha.username}</strong>
          </p>
        </header>

        <div style={{ padding: "1.1rem 1.4rem 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.7rem" }}>
            {PASOS.map((_, i) => {
              const n = i + 1;
              const hecho = n < paso;
              const actual = n === paso;
              return (
                <div key={n} style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    style={{
                      width: "1.8rem",
                      height: "1.8rem",
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "0.8rem",
                      fontWeight: 800,
                      flexShrink: 0,
                      background: hecho ? "var(--lgs-verde)" : actual ? "var(--lgs-azul)" : "#e6e9f2",
                      color: hecho || actual ? "white" : "#8b91a3",
                    }}
                  >
                    {hecho ? "✓" : n}
                  </span>
                  {n < PASOS.length && (
                    <span
                      style={{
                        flex: 1,
                        height: "0.25rem",
                        borderRadius: "1rem",
                        background: hecho ? "var(--lgs-verde)" : "#e6e9f2",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
            Paso {paso} de {PASOS.length} — {PASOS[paso - 1]}
          </p>
        </div>

        <div style={{ padding: "1rem 1.4rem 1.4rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          {apiError !== null && (
            <p
              role="alert"
              style={{
                background: "#fdecea",
                color: "#b71c1c",
                padding: "0.6rem 0.8rem",
                borderRadius: "0.6rem",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              {apiError}
            </p>
          )}

          {paso === 1 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }} className="ng-dos">
                <div>
                  <label style={rotulo} htmlFor="n">Nombres *</label>
                  <input id="n" value={form.nombres} onChange={(e) => set("nombres", e.target.value)}
                    style={errores.nombres !== undefined ? malo : campo} autoComplete="given-name" />
                  {errores.nombres !== undefined && <p style={aviso}>{errores.nombres}</p>}
                </div>
                <div>
                  <label style={rotulo} htmlFor="a">Apellidos *</label>
                  <input id="a" value={form.apellidos} onChange={(e) => set("apellidos", e.target.value)}
                    style={errores.apellidos !== undefined ? malo : campo} autoComplete="family-name" />
                  {errores.apellidos !== undefined && <p style={aviso}>{errores.apellidos}</p>}
                </div>
              </div>
              <div>
                <label style={rotulo} htmlFor="d">Número de documento *</label>
                <input id="d" value={form.docNumero} onChange={(e) => set("docNumero", e.target.value)}
                  style={errores.docNumero !== undefined ? malo : campo} />
                {errores.docNumero !== undefined && <p style={aviso}>{errores.docNumero}</p>}
              </div>
              <div>
                <label style={rotulo} htmlFor="f">Fecha de nacimiento *</label>
                <input id="f" type="date" value={form.fechaNacimiento}
                  onChange={(e) => set("fechaNacimiento", e.target.value)}
                  style={errores.fechaNacimiento !== undefined ? malo : campo} />
                {errores.fechaNacimiento !== undefined && <p style={aviso}>{errores.fechaNacimiento}</p>}
              </div>
            </>
          )}

          {paso === 2 && (
            <>
              <div>
                <label style={rotulo} htmlFor="e">Correo *</label>
                <input id="e" type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                  style={errores.email !== undefined ? malo : campo} autoComplete="email" />
                {errores.email !== undefined && <p style={aviso}>{errores.email}</p>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }} className="ng-dos">
                <div>
                  <label style={rotulo} htmlFor="t">Teléfono *</label>
                  <input id="t" value={form.telefono} onChange={(e) => set("telefono", e.target.value)}
                    style={errores.telefono !== undefined ? malo : campo} autoComplete="tel"
                    placeholder="+56 9 1234 5678" />
                  {errores.telefono !== undefined && <p style={aviso}>{errores.telefono}</p>}
                </div>
                <div>
                  <label style={rotulo} htmlFor="p">País *</label>
                  <select id="p" value={form.pais} onChange={(e) => set("pais", e.target.value)}
                    style={errores.pais !== undefined ? malo : campo}>
                    <option value="">Elige…</option>
                    {PAISES.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
                  </select>
                  {errores.pais !== undefined && <p style={aviso}>{errores.pais}</p>}
                </div>
              </div>
              <div>
                <label style={rotulo} htmlFor="dom">Domicilio *</label>
                <input id="dom" value={form.domicilio} onChange={(e) => set("domicilio", e.target.value)}
                  style={errores.domicilio !== undefined ? malo : campo} autoComplete="street-address" />
                {errores.domicilio !== undefined && <p style={aviso}>{errores.domicilio}</p>}
              </div>
            </>
          )}

          {paso === 3 && (
            <>
              <div>
                <label style={rotulo} htmlFor="z">Sala de Zoom *</label>
                <input id="z" value={form.zoomUrl} onChange={(e) => set("zoomUrl", e.target.value)}
                  style={errores.zoomUrl !== undefined ? malo : campo}
                  placeholder="https://zoom.us/j/NÚMERO" />
                {errores.zoomUrl !== undefined && <p style={aviso}>{errores.zoomUrl}</p>}
                <p style={{ fontSize: "0.76rem", color: "var(--texto-suave)", marginTop: "0.25rem" }}>
                  Copia el enlace de tu <strong>sala</strong> (…zoom.us/j/NÚMERO). El de chat o
                  contacto no sirve: a tus alumnos les abre “Enviar solicitud de contacto” en vez de
                  la clase.
                </p>
              </div>

              <div>
                <span style={rotulo}>Foto de perfil *</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
                  <div
                    style={{
                      width: "5rem",
                      height: "5rem",
                      borderRadius: "50%",
                      background: "#eef1f7",
                      display: "grid",
                      placeItems: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                      border: errores.foto !== undefined ? "2px solid #e57373" : "2px solid #e3e7f0",
                    }}
                  >
                    {fotoPrevio !== null ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={fotoPrevio} alt="Vista previa" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: "1.8rem" }}>{ficha.tieneFoto ? "🖼️" : "👤"}</span>
                    )}
                  </div>
                  <div>
                    <button type="button" onClick={() => fileRef.current?.click()}
                      style={{ ...boton, background: "#eef2ff", color: "var(--lgs-azul-oscuro)", padding: "0.5rem 1rem" }}>
                      📷 {foto !== null ? "Cambiar foto" : "Elegir foto"}
                    </button>
                    <p style={{ fontSize: "0.74rem", color: "var(--texto-suave)", marginTop: "0.3rem" }}>
                      {foto !== null
                        ? foto.name
                        : ficha.tieneFoto
                          ? "Ya tienes una foto cargada; súbela de nuevo solo si quieres cambiarla."
                          : "JPG, PNG o WebP, hasta 10 MB."}
                    </p>
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={elegirFoto} style={{ display: "none" }} />
                {errores.foto !== undefined && <p style={aviso}>{errores.foto}</p>}
              </div>

              <p style={{ fontSize: "0.74rem", color: "var(--texto-suave)" }}>
                Este enlace vence el {fechaLarga(ficha.expiraEn)} y sirve una sola vez.
              </p>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", marginTop: "0.3rem" }}>
            <button type="button" onClick={() => setPaso((p) => p - 1)} disabled={paso === 1}
              style={{ ...boton, background: "#eef1f7", color: "#4a5165", visibility: paso === 1 ? "hidden" : "visible" }}>
              ← Atrás
            </button>
            {paso < PASOS.length ? (
              <button type="button" onClick={siguiente} style={{ ...boton, background: "var(--lgs-azul)", color: "white" }}>
                Continuar →
              </button>
            ) : (
              <button type="button" onClick={() => void enviar()} disabled={enviando}
                style={{ ...boton, background: "var(--lgs-verde)", color: "white", cursor: enviando ? "wait" : "pointer" }}>
                {enviando ? "Guardando…" : "✓ Finalizar registro"}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 520px) { .ng-dos { grid-template-columns: 1fr !important; } }`}</style>
    </main>
  );
}
