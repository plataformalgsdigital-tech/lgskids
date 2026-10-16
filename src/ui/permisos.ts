"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api-fetch";

/**
 * Los permisos de quien entró, para MOSTRAR u OCULTAR opciones en pantalla.
 * Salen de `/api/auth/me` con la regla de las opciones ya aplicada (una `op.*`
 * sin su permiso base no viaja). Es cosmética: cada acción la vuelve a exigir
 * el servidor.
 *
 * Una sola consulta por carga de página; cerrar sesión recarga la página y la
 * borra.
 */

let cache: Promise<Set<string>> | null = null;

export function cargarPermisos(): Promise<Set<string>> {
  cache ??= apiFetch("/api/auth/me")
    .then(async (res) => {
      if (!res.ok) return new Set<string>();
      const data = (await res.json()) as { permisos?: { code: string }[] };
      return new Set((data.permisos ?? []).map((p) => p.code));
    })
    .catch(() => {
      cache = null;
      return new Set<string>();
    });
  return cache;
}

/** `puede(code)` y si ya se cargaron (antes de cargar, nada se muestra). */
export function usePermisos(): { puede: (code: string) => boolean; listo: boolean } {
  const [permisos, setPermisos] = useState<Set<string> | null>(null);
  useEffect(() => {
    let vigente = true;
    void cargarPermisos().then((p) => {
      if (vigente) setPermisos(p);
    });
    return () => {
      vigente = false;
    };
  }, []);
  return { puede: (code) => permisos?.has(code) ?? false, listo: permisos !== null };
}
