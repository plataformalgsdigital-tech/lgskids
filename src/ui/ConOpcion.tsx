"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePermisos } from "./permisos";

/**
 * Guarda de una PANTALLA que es una opción del menú (una tarjeta, una
 * pestaña): sin esa opción, dice que no hay acceso en vez de mostrarla a
 * medias. Quien llega por el enlace directo ve lo mismo que quien la busca
 * en el menú. Las acciones las vuelve a exigir el servidor.
 */
export function ConOpcion(props: { op: string; volver?: string; children: ReactNode }) {
  const { puede, listo } = usePermisos();
  if (!listo) return null;
  if (!puede(props.op)) {
    return (
      <main style={{ padding: "2rem", maxWidth: "40rem", margin: "0 auto" }}>
        <p style={{ fontWeight: 700 }}>🔒 No tienes acceso a esta opción.</p>
        <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
          Si la necesitas, pide que la habiliten para tu rol en Usuarios y roles › Roles y permisos.
        </p>
        {props.volver !== undefined && <Link href={props.volver}>← Volver</Link>}
      </main>
    );
  }
  return <>{props.children}</>;
}
