"use client";

import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from "react";

/**
 * Avisos de la pantalla de login (Panel › Aviso de login). Con un solo aviso se
 * ve como siempre; con 2 o 3 se recorren con flechas, puntos, deslizando el dedo
 * o con "Siguiente aviso". Se recuerda por pestaña: tras cerrarlo no vuelve a
 * saltar. Si falla, el login sigue funcionando igual — nunca bloquea el ingreso.
 */

const AVISO_DESCARTADO = "lgs-kids:aviso-login-descartado";

type Aviso = { id: string; url: string };

const flecha: CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 2,
  width: "2.1rem",
  height: "2.1rem",
  borderRadius: "50%",
  border: "none",
  background: "rgba(255,255,255,0.88)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  cursor: "pointer",
  fontSize: "1.2rem",
  lineHeight: 1,
  color: "#333",
};

export default function AvisosLogin() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem(AVISO_DESCARTADO) !== null) return;
    let vigente = true;
    fetch("/api/public/login-aviso")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { avisos?: Aviso[] } | null) => {
        const lista = Array.isArray(data?.avisos)
          ? data.avisos.filter((a) => typeof a.url === "string")
          : [];
        if (vigente && lista.length > 0) setAvisos(lista);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  if (avisos.length === 0) return null;

  const total = avisos.length;
  const ultimo = idx === total - 1;
  const ir = (n: number) => setIdx((n + total) % total);
  function cerrar() {
    setAvisos([]);
    sessionStorage.setItem(AVISO_DESCARTADO, "1");
  }
  function onTouchStart(e: TouchEvent) {
    touchX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: TouchEvent) {
    const inicio = touchX.current;
    touchX.current = null;
    const fin = e.changedTouches[0]?.clientX;
    if (inicio === null || fin === undefined || total < 2) return;
    const dx = fin - inicio;
    if (Math.abs(dx) > 40) ir(idx + (dx < 0 ? 1 : -1));
  }

  return (
    <div
      onClick={cerrar}
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
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
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
          onClick={cerrar}
          aria-label="Cerrar aviso"
          style={{
            position: "absolute",
            top: "0.6rem",
            right: "0.6rem",
            zIndex: 3,
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

        <div style={{ position: "relative" }}>
          {/* La sube administración: se muestra íntegra, sin recortar ni deformar.
              Todas quedan montadas (se precargan); solo se ve la actual. */}
          {avisos.map((a, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={a.id}
              src={a.url}
              alt={`Aviso ${String(i + 1)}`}
              aria-hidden={i !== idx}
              style={{ display: i === idx ? "block" : "none", width: "100%", height: "auto" }}
            />
          ))}
          {total > 1 && (
            <>
              <button type="button" onClick={() => ir(idx - 1)} aria-label="Aviso anterior" style={{ ...flecha, left: "0.5rem" }}>
                ‹
              </button>
              <button type="button" onClick={() => ir(idx + 1)} aria-label="Aviso siguiente" style={{ ...flecha, right: "0.5rem" }}>
                ›
              </button>
            </>
          )}
        </div>

        {total > 1 && (
          <div
            role="tablist"
            aria-label="Avisos"
            style={{ display: "flex", justifyContent: "center", gap: "0.45rem", paddingTop: "0.6rem" }}
          >
            {avisos.map((a, i) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={i === idx}
                aria-label={`Aviso ${String(i + 1)} de ${String(total)}`}
                onClick={() => ir(i)}
                style={{
                  width: i === idx ? "1.25rem" : "0.5rem",
                  height: "0.5rem",
                  borderRadius: "999px",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  background: i === idx ? "var(--lgs-azul)" : "#cfd5e2",
                  transition: "width 0.2s",
                }}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={ultimo ? cerrar : () => ir(idx + 1)}
          style={{
            width: "100%",
            padding: "0.8rem",
            border: "none",
            borderTop: total > 1 ? "none" : "1px solid #eef1f7",
            background: "white",
            cursor: "pointer",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "#374151",
          }}
        >
          {ultimo
            ? "Cerrar y continuar al login"
            : `Siguiente aviso (${String(idx + 1)} de ${String(total)})`}
        </button>
      </div>
    </div>
  );
}
