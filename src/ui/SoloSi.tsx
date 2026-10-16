"use client";

import type { ReactNode } from "react";
import { usePermisos } from "./permisos";

/**
 * Muestra su contenido solo si quien mira tiene esa OPCIÓN (o permiso). Es
 * cosmética: la acción la vuelve a exigir el servidor.
 */
export function SoloSi(props: { op: string; children: ReactNode }) {
  const { puede } = usePermisos();
  return puede(props.op) ? <>{props.children}</> : null;
}
