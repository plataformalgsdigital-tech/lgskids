"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * El vocabulario de los casos lo sirve el dominio (`/api/casos/vocabulario`):
 * las pantallas no copian listas de estados ni etiquetas. Mientras carga, las
 * etiquetas caen al valor crudo, que también se entiende.
 */

export interface Opcion {
  valor: string;
  etiqueta: string;
}

export interface VocabularioCasos {
  temas: Opcion[];
  estados: (Opcion & { cierra: boolean })[];
  areas: Opcion[];
  cierresPorArea: Record<string, string[]>;
  canales: string[];
  resultados: Opcion[];
}

const VACIO: VocabularioCasos = {
  temas: [],
  estados: [],
  areas: [],
  cierresPorArea: {},
  canales: [],
  resultados: [],
};

// Una sola carga por pestaña: el vocabulario no cambia mientras se usa.
let cache: Promise<VocabularioCasos> | null = null;

function cargar(): Promise<VocabularioCasos> {
  cache ??= apiFetch("/api/casos/vocabulario").then(async (res) => {
    if (!res.ok) {
      cache = null;
      return VACIO;
    }
    return (await res.json()) as VocabularioCasos;
  });
  return cache;
}

export function useVocabularioCasos(): VocabularioCasos {
  const [v, setV] = useState<VocabularioCasos>(VACIO);
  useEffect(() => {
    let vivo = true;
    void cargar().then((r) => {
      if (vivo) setV(r);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return v;
}

export function etiqueta(lista: Opcion[], valor: string | null | undefined): string {
  if (valor == null) return "";
  return lista.find((o) => o.valor === valor)?.etiqueta ?? valor;
}

/** Colores del estado: abierto sin asignar, asignado a un área, o cerrado. */
export function colorEstado(v: VocabularioCasos, estado: string): { color: string; fondo: string } {
  if (estado === "EN_GESTION") return { color: "#b57a00", fondo: "#fff8e1" };
  if (v.estados.find((e) => e.valor === estado)?.cierra === true) {
    return { color: "#37474f", fondo: "#eceff1" };
  }
  return { color: "#0d47a1", fondo: "#e3f2fd" };
}
