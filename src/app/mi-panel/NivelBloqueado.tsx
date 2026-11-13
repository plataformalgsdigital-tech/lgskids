"use client";

import { useEffect, useRef } from "react";
import { Personaje } from "@/ui/Personaje";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Lo que dice el personaje cuando el niño toca un mapa de un nivel que aún no alcanza.
 * El servidor genera el audio con el MISMO texto (`TEXTO_NIVEL_BLOQUEADO`, módulo
 * catalog): si se cambia aquí, hay que cambiarlo allá y subir su `VERSION`.
 */
export const MENSAJE_NIVEL_BLOQUEADO =
  "Aún no puedes acceder a este mapa, pero ya pronto podrás. Solo esfuérzate un poco más.";

/** Respaldo: voz en español del dispositivo, si hay una. */
function hablarConElDispositivo(texto: string, aguda: boolean): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-419";
    const voz =
      synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("es-4")) ??
      synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("es"));
    if (voz !== undefined) {
      u.voice = voz;
      u.lang = voz.lang;
    }
    u.rate = 0.92;
    u.pitch = aguda ? 1.25 : 1;
    synth.speak(u);
  } catch {
    // Sin voz disponible el mensaje sigue a la vista en la burbuja.
  }
}

/**
 * Aviso sobre el mapa de un nivel SUPERIOR al del niño: no se abre el mapa, sale un
 * personaje y dice (en voz alta y en la burbuja) que todavía no puede entrar.
 * Junior ve a Simba; Youngster, a Emma, la guía, que es menos infantil. La voz es la
 * del personaje (ElevenLabs, generada una vez en el servidor); si no está disponible,
 * habla el dispositivo.
 */
export function NivelBloqueado(props: { nivel: string; esJunior: boolean; onCerrar: () => void }) {
  const { nivel, esJunior, onCerrar } = props;
  const quien = esJunior ? "simba" : "emma";
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const vivo = useRef(true);

  async function hablar() {
    audio.current?.pause();
    try {
      if (url.current === null) {
        const res = await apiFetch(`/api/student/aviso-voz?quien=${quien}`);
        if (!res.ok) throw new Error("sin voz");
        url.current = URL.createObjectURL(await res.blob());
      }
      if (!vivo.current) return;
      const a = audio.current ?? new Audio();
      audio.current = a;
      a.src = url.current;
      a.currentTime = 0;
      await a.play();
    } catch {
      if (vivo.current) hablarConElDispositivo(MENSAJE_NIVEL_BLOQUEADO, esJunior);
    }
  }

  useEffect(() => {
    vivo.current = true;
    void hablar();
    return () => {
      vivo.current = false;
      audio.current?.pause();
      if (url.current !== null) URL.revokeObjectURL(url.current);
      url.current = null;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
    // `hablar` solo depende de `quien`, que es lo que reinicia el efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quien]);

  return (
    <div
      onClick={onCerrar}
      role="alertdialog"
      aria-modal="true"
      aria-label={`El nivel ${nivel} aún está bloqueado`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(8,11,24,0.72)",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "32rem",
          background: "white",
          borderRadius: "1.2rem",
          padding: "1.2rem 1.3rem 1.3rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          display: "flex",
          gap: "1rem",
          alignItems: "flex-end",
        }}
      >
        <Personaje
          quien={esJunior ? "simba-espera" : "emma-expectante"}
          alto="9rem"
          className="lgs-float"
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", flex: 1 }}>
          <div
            style={{
              background: "#f3f6fd",
              border: "2px solid #dbe4f7",
              borderRadius: "1rem",
              padding: "0.8rem 1rem",
              fontSize: "1rem",
              lineHeight: 1.45,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)", fontWeight: 700 }}>
              🔒 Mapa {nivel}
            </span>
            <br />
            {MENSAJE_NIVEL_BLOQUEADO}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void hablar()}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #d8dce6",
                background: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🔊 Escuchar otra vez
            </button>
            <button
              type="button"
              onClick={onCerrar}
              style={{
                padding: "0.45rem 1.1rem",
                borderRadius: "0.6rem",
                border: "none",
                background: "var(--lgs-azul)",
                color: "white",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              ¡Entendido!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
