"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

interface Tarjeta {
  titulo: string;
  desc: string;
  emoji: string;
  color: string;
  href?: string;
}

const TARJETAS: Tarjeta[] = [
  {
    titulo: "Gestión de Contenido",
    desc: "Temario y evaluación (varios cuestionarios) por lección. Guiado por curso y nivel.",
    emoji: "📝",
    color: "var(--lgs-purpura)",
    href: "/panel/mantenimiento-cursos/gestion-contenido",
  },
  {
    titulo: "Referencia de cursos",
    desc: "Temario, material (alumno/guía), video, actividades, recursos y quiz por curso · nivel · unidad · lección.",
    emoji: "📚",
    color: "var(--lgs-cian)",
    href: "/panel/mantenimiento-cursos/referencia",
  },
  {
    titulo: "Campañas",
    desc: "Crear campañas y sus cursos (Junior/Youngster) con niveles y salones.",
    emoji: "📣",
    color: "var(--lgs-azul)",
    href: "/panel/campanias",
  },
  {
    titulo: "Horarios",
    desc: "Catálogo de horarios reutilizable por tipo de curso, grupo de país y salón.",
    emoji: "🕒",
    color: "var(--lgs-amarillo)",
    href: "/panel/horarios",
  },
  {
    titulo: "Subir curso (CSV)",
    desc: "Importar la referencia de un curso completo desde un archivo (con previo).",
    emoji: "⬆️",
    color: "var(--lgs-cian)",
    href: "/panel/mantenimiento-cursos/subir-curso",
  },
  {
    titulo: "Imágenes de curso",
    desc: "Banners de nivel, premios, mapa del curso y sello VoBo (se ven en el panel del alumno).",
    emoji: "🖼️",
    color: "var(--lgs-magenta)",
    href: "/panel/mantenimiento-cursos/imagenes",
  },
  {
    titulo: "Material del alumno",
    desc: "Libro interactivo (HTML) y libro para descargar (PDF) de cada nivel. Se abren desde “Material” en el panel del niño.",
    emoji: "📖",
    color: "var(--lgs-azul)",
    href: "/panel/mantenimiento-cursos/material",
  },
  {
    titulo: "Videos del libro",
    desc: "Los videos del libro interactivo, por página. Se comprimen al subirlos; revisa el previo y confirma para publicarlos.",
    emoji: "🎬",
    color: "var(--lgs-magenta)",
    href: "/panel/mantenimiento-cursos/videos",
  },
  {
    titulo: "Enlaces de juegos",
    desc: "Los juegos de cada unidad. El niño los abre al tocar “Unidad N” en el mapa de su isla.",
    emoji: "🎮",
    color: "var(--lgs-verde)",
    href: "/panel/mantenimiento-cursos/juegos",
  },
  {
    titulo: "Editor de mapa (hotspots)",
    desc: "Marca dónde va cada unidad y el premio sobre las islas y el mapa (pantalla Avance).",
    emoji: "📍",
    color: "var(--lgs-purpura)",
    href: "/panel/mantenimiento-cursos/mapa",
  },
];

const cardBase: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
  padding: "1.5rem",
  border: "2px solid #e3e7f0",
  borderRadius: "1rem",
  background: "white",
  color: "inherit",
  minHeight: "9.5rem",
};

export default function MantenimientoCursosPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Mantenimiento Académico</h1>
      <p style={{ color: "var(--texto-suave)", marginTop: "0.25rem" }}>
        Gestiona la referencia curricular y la estructura académica. Estas acciones generan
        registros de auditoría.
      </p>

      <div
        style={{
          marginTop: "1.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
          gap: "1rem",
        }}
      >
        {TARJETAS.map((t) => {
          const contenido = (
            <>
              <span
                aria-hidden
                style={{
                  width: "3rem",
                  height: "3rem",
                  borderRadius: "0.8rem",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "1.5rem",
                  background: "#f4f6fb",
                  borderLeft: `4px solid ${t.color}`,
                }}
              >
                {t.emoji}
              </span>
              <strong style={{ fontSize: "1.05rem" }}>
                {t.titulo}
                {t.href === undefined && (
                  <span
                    style={{ fontSize: "0.68rem", color: "var(--texto-suave)", fontWeight: 600 }}
                  >
                    {" "}
                    (pronto)
                  </span>
                )}
              </strong>
              <span style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>{t.desc}</span>
            </>
          );
          return t.href !== undefined ? (
            <Link key={t.titulo} href={t.href} style={cardBase}>
              {contenido}
            </Link>
          ) : (
            <div
              key={t.titulo}
              style={{ ...cardBase, opacity: 0.55 }}
              title="Disponible próximamente"
            >
              {contenido}
            </div>
          );
        })}
      </div>
    </main>
  );
}
