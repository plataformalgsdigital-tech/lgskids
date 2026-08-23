"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Resultados {
  q: string;
  personas: {
    id: string;
    nombres: string;
    apellidos: string;
    docTipo: string;
    docNumero: string;
    countryCode: string;
    estado: string;
    username: string | null;
    fechaNacimiento: string | null;
  }[];
  contratos: {
    id: string;
    numero: number;
    beneficiario: string;
    titular: string;
    tipoCurso: string;
    countryCode: string;
    estado: string;
    externalRef: string | null;
    salon: string | null;
    username: string | null;
  }[];
}

function ResultadosBusqueda() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [resultados, setResultados] = useState<Resultados | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    let cancelado = false;
    async function buscar() {
      const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        if (!cancelado) setError("No se pudo buscar.");
        return;
      }
      if (!cancelado) setResultados((await res.json()) as Resultados);
    }
    void buscar();
    return () => {
      cancelado = true;
    };
  }, [q]);

  if (error !== null) {
    return (
      <p role="alert" style={{ color: "#c62828" }}>
        {error}
      </p>
    );
  }
  if (resultados === null) {
    return <p style={{ color: "var(--texto-suave)" }}>Buscando “{q}”…</p>;
  }

  const vacio = resultados.personas.length === 0 && resultados.contratos.length === 0;

  return (
    <>
      <h1 style={{ fontSize: "1.5rem" }}>Resultados para “{resultados.q}”</h1>
      {vacio && (
        <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>
          Nada encontrado. Prueba con el número de contrato, el documento, un nombre, apellido o el
          usuario del alumno.
        </p>
      )}

      {resultados.contratos.length > 0 && (
        <section style={{ marginTop: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            Contratos ({resultados.contratos.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {resultados.contratos.map((c) => (
              <Link
                key={c.id}
                href="/panel/contratos"
                style={{
                  padding: "0.7rem 1rem",
                  border: "1px solid #e3e7f0",
                  borderLeft: "4px solid var(--lgs-magenta)",
                  borderRadius: "0.6rem",
                  color: "inherit",
                }}
              >
                <strong>Contrato N° {c.numero}</strong> · {c.beneficiario} ({c.tipoCurso},{" "}
                {c.countryCode}) · {c.estado}
                {c.externalRef !== null && ` · LGS ${c.externalRef}`}
                <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  {" "}
                  · Titular: {c.titular}
                  {c.username !== null && ` · usuario ${c.username}`}
                  {c.salon !== null && ` · salón ${c.salon}`}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {resultados.personas.length > 0 && (
        <section style={{ marginTop: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            Personas ({resultados.personas.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {resultados.personas.map((p) => (
              <Link
                key={p.id}
                href={`/panel/personas?buscar=${encodeURIComponent(p.docNumero)}`}
                style={{
                  padding: "0.7rem 1rem",
                  border: "1px solid #e3e7f0",
                  borderLeft: "4px solid var(--lgs-cian)",
                  borderRadius: "0.6rem",
                  color: "inherit",
                }}
              >
                <strong>
                  {p.apellidos}, {p.nombres}
                </strong>{" "}
                <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  {p.docTipo} {p.docNumero} · {p.countryCode} · {p.estado}
                  {p.username !== null && ` · usuario ${p.username}`}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export default function BuscarPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: "60rem", margin: "0 auto" }}>
      <Suspense fallback={<p style={{ color: "var(--texto-suave)" }}>Cargando…</p>}>
        <ResultadosBusqueda />
      </Suspense>
    </main>
  );
}
