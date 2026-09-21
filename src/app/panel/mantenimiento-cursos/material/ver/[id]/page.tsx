"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { VisorLibro, type CajaLibro } from "@/ui/VisorLibro";

interface Visor {
  url: string;
  videosBase: string;
  libro: CajaLibro;
  curso: string;
  nivel: string;
}

/**
 * Vista previa del libro interactivo para el equipo: el MISMO visor que el
 * niño (caja, puente y videos con token), para revisar lo que él va a ver.
 * El progreso de estas pruebas se guarda aparte (`lgs-material:equipo:<id>`).
 */
export default function VerLibroPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [visor, setVisor] = useState<Visor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const res = await apiFetch(`/api/catalog/material/${id}/visor`);
      if (!res.ok) {
        setError("No se pudo abrir el libro.");
        return;
      }
      setVisor((await res.json()) as Visor);
    }
    void run();
  }, [id]);

  if (error !== null) {
    return <p style={{ padding: "2rem", color: "#c62828", fontWeight: 600 }}>{error}</p>;
  }
  if (visor === null) {
    return <p style={{ padding: "2rem", color: "var(--texto-suave)" }}>Abriendo el libro…</p>;
  }
  return (
    <VisorLibro
      url={visor.url}
      titulo={`Vista previa · ${visor.curso} · ${visor.nivel}`}
      caja={visor.libro}
      claveProgreso={`lgs-material:equipo:${id}`}
      videosBase={visor.videosBase}
      onCerrar={() => {
        // Se abrió en pestaña nueva desde Material: cerrarla. Si el navegador
        // no deja, volver a Material.
        window.close();
        router.push("/panel/mantenimiento-cursos/material");
      }}
    />
  );
}
