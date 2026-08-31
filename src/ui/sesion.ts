"use client";

import { useEffect } from "react";

/**
 * Entrada y salida de la plataforma: SIEMPRE se empieza de cero.
 *
 * El problema que resuelve: al salir con `router.replace("/login")` solo se
 * reemplaza la entrada actual del historial. Las pantallas del panel visitadas
 * antes siguen ahí, y el Router Cache de Next las vuelve a pintar al pulsar
 * "Atrás" — se ve la última pantalla del alumno anterior hasta que una llamada
 * falla con 401. Lo mismo pasa cuando el navegador restaura la pestaña desde
 * la caché de retroceso (bfcache).
 */

/**
 * Cierra la sesión y vuelve al login con una navegación COMPLETA.
 *
 * `window.location.replace` descarta todo el estado del cliente y el Router
 * Cache; sustituye además la entrada actual, así que "Atrás" no regresa a la
 * pantalla desde la que se salió.
 */
export async function cerrarSesion(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.replace("/login");
  }
}

/**
 * Guarda para las pantallas autenticadas: si el navegador restaura la página
 * desde la caché de retroceso (volver atrás, reabrir la pestaña), la recarga
 * para que vuelva a comprobar la sesión en lugar de mostrar datos viejos.
 */
export function useReinicioAlVolver(): void {
  useEffect(() => {
    function alMostrar(evento: PageTransitionEvent) {
      if (evento.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", alMostrar);
    return () => window.removeEventListener("pageshow", alMostrar);
  }, []);
}
