"use client";

import { useState } from "react";

/**
 * Paleta de emojis para las plantillas de WhatsApp. Lista CURADA (no un
 * catálogo entero): los que de verdad se usan en mensajes a familias, por
 * categoría. Son caracteres Unicode normales, así que viajan tal cual a
 * WhatsApp y cuentan en el largo del contenido como cualquier texto.
 */
const CATEGORIAS: { nombre: string; emojis: string[] }[] = [
  {
    nombre: "Caras",
    emojis: [
      "😊",
      "😀",
      "😃",
      "😄",
      "😁",
      "😉",
      "🙂",
      "😍",
      "🤩",
      "🥳",
      "😎",
      "🤗",
      "🤔",
      "😅",
      "😢",
      "🙏",
    ],
  },
  {
    nombre: "Manos",
    emojis: ["👋", "👍", "👏", "🙌", "💪", "🤝", "✌️", "👉", "👇", "☝️", "✋", "🫶"],
  },
  {
    nombre: "Clase",
    emojis: [
      "📚",
      "📖",
      "✏️",
      "📝",
      "🎓",
      "🧠",
      "💻",
      "🎧",
      "🎥",
      "🗣️",
      "🇬🇧",
      "🇺🇸",
      "🌎",
      "🧩",
      "🎮",
      "🎨",
    ],
  },
  {
    nombre: "Logros",
    emojis: ["⭐", "🌟", "✨", "🏆", "🥇", "🏅", "🎉", "🎊", "🎁", "🚀", "🔥", "💯", "✅", "🎯"],
  },
  {
    nombre: "Avisos",
    emojis: [
      "📅",
      "🗓️",
      "⏰",
      "🕐",
      "📌",
      "📍",
      "🔔",
      "📢",
      "⚠️",
      "❗",
      "❓",
      "ℹ️",
      "🔗",
      "📲",
      "📞",
      "✉️",
    ],
  },
  {
    nombre: "Corazones",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "💖", "💕", "😘"],
  },
  {
    nombre: "Animales",
    emojis: ["🐶", "🐱", "🦁", "🐼", "🐵", "🦊", "🐸", "🦜", "🐬", "🦋", "🐝", "🦖"],
  },
];

export function EmojiPicker({ onElegir }: { onElegir: (emoji: string) => void }) {
  const [categoria, setCategoria] = useState(0);
  const actual = CATEGORIAS[categoria] ?? CATEGORIAS[0];
  return (
    <div
      style={{
        border: "1px solid #e3e7f0",
        borderRadius: "0.7rem",
        padding: "0.5rem",
        background: "#fbfcff",
      }}
    >
      <div
        role="tablist"
        aria-label="Categorías de emojis"
        style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.4rem" }}
      >
        {CATEGORIAS.map((c, i) => (
          <button
            key={c.nombre}
            type="button"
            role="tab"
            aria-selected={i === categoria}
            onClick={() => setCategoria(i)}
            style={{
              padding: "0.15rem 0.55rem",
              borderRadius: "999px",
              border: "1px solid " + (i === categoria ? "var(--lgs-azul)" : "#d8dce6"),
              background: i === categoria ? "var(--lgs-azul)" : "white",
              color: i === categoria ? "white" : "var(--texto-suave)",
              fontSize: "0.74rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {c.nombre}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.15rem" }}>
        {actual?.emojis.map((e) => (
          <button
            key={e}
            type="button"
            title={`Insertar ${e}`}
            onClick={() => onElegir(e)}
            style={{
              width: "2.1rem",
              height: "2.1rem",
              fontSize: "1.25rem",
              lineHeight: 1,
              border: "none",
              borderRadius: "0.4rem",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
