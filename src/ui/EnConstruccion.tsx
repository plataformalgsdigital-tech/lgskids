import Link from "next/link";
import { Personaje } from "./Personaje";

/**
 * Página EN CONSTRUCCIÓN: lo que tiene sitio en el menú pero todavía no tiene
 * pantalla. Mejor que un ítem apagado: dice qué va a haber ahí y deja volver.
 */
export function EnConstruccion({
  titulo,
  descripcion,
  volver = { href: "/panel/tablero", etiqueta: "Volver al Tablero" },
}: {
  titulo: string;
  /** Qué va a hacer esta pantalla cuando esté lista. */
  descripcion?: string;
  volver?: { href: string; etiqueta: string };
}) {
  return (
    <main style={{ padding: "2rem", maxWidth: "52rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem", margin: 0 }}>{titulo}</h1>
      <div
        style={{
          marginTop: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          flexWrap: "wrap",
          padding: "1.75rem",
          borderRadius: "1rem",
          border: "2px dashed #d8dce6",
          background: "white",
        }}
      >
        <Personaje quien="rocky-picaro" alto="9rem" className="lgs-float" />
        <div style={{ flex: "1 1 16rem", minWidth: 0 }}>
          <p style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>
            🚧 Página en construcción
          </p>
          <p style={{ color: "var(--texto-suave)", marginTop: "0.4rem" }}>
            {descripcion ?? "Esta sección estará disponible muy pronto."}
          </p>
          <Link
            href={volver.href}
            style={{
              display: "inline-block",
              marginTop: "0.9rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.6rem",
              border: "1px solid #e3e7f0",
              fontWeight: 700,
              fontSize: "0.88rem",
            }}
          >
            ← {volver.etiqueta}
          </Link>
        </div>
      </div>
    </main>
  );
}
