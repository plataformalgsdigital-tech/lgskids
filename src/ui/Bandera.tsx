import type { CSSProperties } from "react";

/**
 * Bandera de un país (CL, CO, EC, PE) como SVG en línea.
 *
 * No se usan emojis (🇨🇱): Windows no los dibuja y muestra las letras "CL". Tampoco
 * un servicio externo de imágenes: esto se ve igual en cualquier equipo, sin internet
 * y sin dependencia. Proporción 3:2.
 */

export const NOMBRE_PAIS: Record<string, string> = {
  CL: "Chile",
  CO: "Colombia",
  EC: "Ecuador",
  PE: "Perú",
};

function Dibujo({ pais }: { pais: string }) {
  switch (pais) {
    case "CL":
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          <rect y="10" width="30" height="10" fill="#d52b1e" />
          <rect width="10" height="10" fill="#0039a6" />
          <polygon
            fill="#fff"
            points="5,1.6 5.95,4.1 8.6,4.2 6.5,5.85 7.25,8.4 5,6.9 2.75,8.4 3.5,5.85 1.4,4.2 4.05,4.1"
          />
        </>
      );
    case "CO":
      return (
        <>
          <rect width="30" height="10" fill="#fcd116" />
          <rect y="10" width="30" height="5" fill="#003893" />
          <rect y="15" width="30" height="5" fill="#ce1126" />
        </>
      );
    case "EC":
      return (
        <>
          <rect width="30" height="10" fill="#ffdd00" />
          <rect y="10" width="30" height="5" fill="#034ea2" />
          <rect y="15" width="30" height="5" fill="#ed1c24" />
          <ellipse cx="15" cy="10" rx="2.6" ry="3.2" fill="#8d6e3b" opacity="0.85" />
        </>
      );
    case "PE":
      return (
        <>
          <rect width="30" height="20" fill="#d91023" />
          <rect x="10" width="10" height="20" fill="#fff" />
        </>
      );
    default:
      return <rect width="30" height="20" fill="#cbd0dc" />;
  }
}

export function Bandera(props: {
  pais: string;
  /** Alto en píxeles (el ancho es 1,5 veces). */
  alto?: number;
  style?: CSSProperties;
  /** Con nombre al lado (p. ej. "Chile"). */
  conNombre?: boolean;
}) {
  const alto = props.alto ?? 16;
  const nombre = NOMBRE_PAIS[props.pais] ?? props.pais;
  const svg = (
    <svg
      role="img"
      aria-label={`Bandera de ${nombre}`}
      viewBox="0 0 30 20"
      width={alto * 1.5}
      height={alto}
      style={{
        borderRadius: 3,
        boxShadow: "0 0 0 1px rgba(0,0,0,0.18)",
        flexShrink: 0,
        ...props.style,
      }}
    >
      <title>{nombre}</title>
      <Dibujo pais={props.pais} />
    </svg>
  );
  if (props.conNombre !== true) return svg;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
      {svg}
      <span>{nombre}</span>
    </span>
  );
}
