"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface NinoDeGuia {
  childPersonId: string;
  nombres: string;
  apellidos: string;
  docTipo: string;
  docNumero: string;
  username: string | null;
  salon: string;
  campania: string;
  cursoTipo: string;
}

export default function MisNinosPage() {
  const [ninos, setNinos] = useState<NinoDeGuia[] | null>(null);

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch("/api/guia/ninos");
      if (res.ok) {
        const data: { ninos: NinoDeGuia[] } = await res.json();
        setNinos(data.ninos);
      } else {
        setNinos([]);
      }
    }
    void cargar();
  }, []);

  // Agrupar por salón para lectura.
  const porSalon = new Map<string, NinoDeGuia[]>();
  for (const n of ninos ?? []) {
    const arr = porSalon.get(n.salon) ?? [];
    arr.push(n);
    porSalon.set(n.salon, arr);
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem" }}>Mis niños</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", marginTop: "0.3rem" }}>
        Los niños matriculados en tus salones. Haz clic para ver su ficha.
      </p>

      {ninos === null ? (
        <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>Cargando…</p>
      ) : ninos.length === 0 ? (
        <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>
          Aún no tienes niños matriculados en tus salones.
        </p>
      ) : (
        [...porSalon.entries()].map(([salon, lista]) => (
          <section key={salon} style={{ marginTop: "1.25rem" }}>
            <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>
              🎓 {salon}{" "}
              <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)", fontWeight: 400 }}>
                ({lista.length} {lista.length === 1 ? "niño" : "niños"})
              </span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {lista.map((n) => (
                <Link
                  key={n.childPersonId}
                  href={`/panel/personas/${n.childPersonId}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.7rem 1rem",
                    border: "1px solid #e3e7f0",
                    borderRadius: "0.7rem",
                    color: "inherit",
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    <strong>
                      {n.apellidos}, {n.nombres}
                    </strong>{" "}
                    <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                      {n.docTipo} {n.docNumero}
                      {n.username !== null && ` · ${n.username}`}
                    </span>
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                    {n.campania} · {n.cursoTipo === "JUNIOR" ? "Junior" : "Youngster"} →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
