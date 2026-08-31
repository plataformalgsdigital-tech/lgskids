"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Personajes de LGS Kids (arte de marca, no contenido curricular).
 *
 * Viven en `public/personajes/` como archivos estáticos: son globales, no
 * dependen de campaña ni de nivel, así que NO pasan por el módulo `files`
 * (que sirve arte por CURSO:NIVEL y datos privados de menores).
 *
 * Solo se muestran en JUNIOR (6–9 años); en Youngster resultan infantiles.
 * Quien los use debe decidir esa condición — este componente no la asume.
 */
export type ClavePersonaje =
  // Pose base (la de la landing)
  | "simba"
  | "emma"
  | "coco"
  | "rocky"
  // Estados de ánimo
  | "simba-alegre"
  | "simba-espera"
  | "simba-triste"
  | "emma-celebrando"
  | "emma-enojada"
  | "emma-expectante"
  | "emma-pensativa"
  | "emma-sorprendida"
  | "emma-triste"
  | "coco-celebrando"
  | "coco-sorprendido"
  | "coco-triste"
  | "rocky-alegre"
  | "rocky-picaro"
  | "rocky-uy";

type Ficha = { alt: string; ancho: number; alto: number };

const NOMBRE: Record<string, string> = {
  simba: "Simba, el perrito de LGS Kids",
  emma: "Emma, tu guía de LGS Kids",
  coco: "Coco, el dodo de LGS Kids",
  rocky: "Rocky, el mapache de LGS Kids",
};

/**
 * Dimensiones intrínsecas de cada archivo, para reservar espacio y evitar
 * saltos de maquetación. Los altos salen del recorte real de cada pose.
 */
const FICHAS: Record<ClavePersonaje, Ficha> = {
  simba: { alt: NOMBRE["simba"]!, ancho: 440, alto: 541 },
  emma: { alt: NOMBRE["emma"]!, ancho: 440, alto: 897 },
  coco: { alt: NOMBRE["coco"]!, ancho: 440, alto: 532 },
  rocky: { alt: NOMBRE["rocky"]!, ancho: 440, alto: 631 },
  "simba-alegre": { alt: NOMBRE["simba"]!, ancho: 440, alto: 751 },
  "simba-espera": { alt: NOMBRE["simba"]!, ancho: 440, alto: 770 },
  "simba-triste": { alt: NOMBRE["simba"]!, ancho: 440, alto: 284 },
  "emma-celebrando": { alt: NOMBRE["emma"]!, ancho: 440, alto: 1241 },
  "emma-enojada": { alt: NOMBRE["emma"]!, ancho: 440, alto: 1344 },
  "emma-expectante": { alt: NOMBRE["emma"]!, ancho: 440, alto: 1307 },
  "emma-pensativa": { alt: NOMBRE["emma"]!, ancho: 440, alto: 1431 },
  "emma-sorprendida": { alt: NOMBRE["emma"]!, ancho: 440, alto: 1622 },
  "emma-triste": { alt: NOMBRE["emma"]!, ancho: 440, alto: 1507 },
  // OJO: "coco-celebrando" es, hoy, un pájaro de otro diseño (azul, pico
  // marrón) — no coincide con el Coco morado/cian. Registrado pero SIN usar.
  "coco-celebrando": { alt: NOMBRE["coco"]!, ancho: 440, alto: 529 },
  "coco-sorprendido": { alt: NOMBRE["coco"]!, ancho: 440, alto: 649 },
  "coco-triste": { alt: NOMBRE["coco"]!, ancho: 440, alto: 528 },
  "rocky-alegre": { alt: NOMBRE["rocky"]!, ancho: 440, alto: 698 },
  "rocky-picaro": { alt: NOMBRE["rocky"]!, ancho: 440, alto: 742 },
  "rocky-uy": { alt: NOMBRE["rocky"]!, ancho: 440, alto: 721 },
};

/**
 * Pose de Rocky para cada estado del acceso a Zoom. Un solo lugar decide el
 * gesto, para que la cara del personaje siga siempre al estado real del enlace.
 * Nunca se usa `emma-enojada`: la interfaz no regaña a un niño de 6 a 9 años.
 */
export function poseZoom(estado: "espera" | "disponible" | "vencido" | "cerrado"): ClavePersonaje {
  if (estado === "espera") return "rocky-alegre";
  if (estado === "disponible") return "rocky";
  return "rocky-uy";
}

/**
 * Dibuja un personaje recortado (WebP con respaldo PNG), escalado por ALTURA:
 * así figuras de proporciones distintas se ven del mismo tamaño.
 */
export function Personaje({
  quien,
  alto,
  className,
  style,
}: {
  quien: ClavePersonaje;
  /** Altura CSS (p. ej. "7rem"). El ancho sale de la proporción del archivo. */
  alto: string;
  className?: string;
  style?: CSSProperties;
}) {
  const f = FICHAS[quien];
  return (
    <>
      {/* Solo WebP: son 19 poses y el respaldo PNG triplicaba el peso. Lo
          soportan todos los navegadores desde 2020 (Safari 14 incluido). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={className}
        src={`/personajes/${quien}.webp`}
        width={f.ancho}
        height={f.alto}
        alt={f.alt}
        loading="lazy"
        decoding="async"
        style={{
          display: "block",
          height: alto,
          width: "auto",
          objectFit: "contain",
          filter: "drop-shadow(0 8px 12px rgba(40,20,90,.18))",
          ...style,
        }}
      />
    </>
  );
}

/**
 * Estado vacío acompañado por un personaje. Los huecos ("no hay clases",
 * "no hay historial") son donde una mascota rinde más: explican en vez de
 * dejar al niño frente a un texto suelto.
 */
export function VacioConPersonaje({
  quien,
  titulo,
  detalle,
  alto = "7.5rem",
}: {
  quien: ClavePersonaje;
  titulo: string;
  detalle?: ReactNode;
  alto?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.9rem",
        padding: "0.6rem 0.2rem",
        flexWrap: "wrap",
      }}
    >
      <Personaje quien={quien} alto={alto} className="lgs-float" />
      <div style={{ flex: "1 1 11rem", minWidth: 0 }}>
        <p style={{ fontWeight: 700, marginBottom: detalle !== undefined ? "0.2rem" : 0 }}>{titulo}</p>
        {detalle !== undefined && (
          <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", margin: 0 }}>{detalle}</p>
        )}
      </div>
    </div>
  );
}
