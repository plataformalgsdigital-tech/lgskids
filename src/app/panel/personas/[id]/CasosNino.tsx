"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { colorEstado, etiqueta, useVocabularioCasos } from "../../servicio/casos-atencion/casos-ui";

/**
 * Los casos de atención del niño en su ficha: abiertos primero, con el enlace
 * al caso. Quien no tiene `casos.ver` no ve la tarjeta (la API responde 403).
 */

interface Caso {
  id: string;
  codigo: string;
  tema: string;
  estado: string;
  area: string | null;
  abiertoEn: string;
  cerradoEn: string | null;
  noContinua: boolean;
  reportes: number;
  sinLeer: number;
  ultimoMovimiento: string | null;
}

export function CasosNino({ childPersonId }: { childPersonId: string }) {
  const voc = useVocabularioCasos();
  const [casos, setCasos] = useState<Caso[] | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch(`/api/casos/ninos/${childPersonId}`);
      if (!res.ok) {
        setVisible(false);
        return;
      }
      setCasos(((await res.json()) as { casos: Caso[] }).casos);
    }
    void cargar();
  }, [childPersonId]);

  if (!visible) return null;
  const abiertos = (casos ?? []).filter((c) => c.cerradoEn === null).length;

  return (
    <section
      style={{
        background: "white",
        border: "1px solid #e3e7f0",
        borderRadius: "0.9rem",
        padding: "1rem 1.1rem",
        marginTop: "1rem",
      }}
    >
      <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.6rem" }}>
        ⚠️ Casos de atención
        {casos !== null && casos.length > 0 && (
          <span style={{ fontSize: "0.82rem", color: "var(--texto-suave)", fontWeight: 600 }}>
            {" "}
            · {abiertos} abierto{abiertos === 1 ? "" : "s"} de {casos.length}
          </span>
        )}
      </h2>
      {casos === null ? (
        <p style={{ color: "var(--texto-suave)", margin: 0 }}>Cargando…</p>
      ) : casos.length === 0 ? (
        <p style={{ color: "var(--texto-suave)", margin: 0 }}>Sin casos de atención.</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          {casos.map((c) => {
            const color = colorEstado(voc, c.estado);
            return (
              <li
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.6rem",
                  flexWrap: "wrap",
                  padding: "0.5rem 0.7rem",
                  border: "1px solid #edf0f6",
                  borderRadius: "0.6rem",
                  fontSize: "0.87rem",
                }}
              >
                <span>
                  <Link
                    href={`/panel/servicio/casos-atencion/${c.id}`}
                    target="_blank"
                    style={{ fontWeight: 800 }}
                  >
                    {c.codigo}
                  </Link>
                  {c.sinLeer > 0 && <span style={{ color: "#c62828" }}> ●</span>} ·{" "}
                  {etiqueta(voc.temas, c.tema)} · {c.reportes} reporte{c.reportes === 1 ? "" : "s"}{" "}
                  · {new Date(c.abiertoEn).toLocaleDateString("es")}
                  {c.ultimoMovimiento !== null && (
                    <span
                      style={{ display: "block", color: "var(--texto-suave)", fontSize: "0.78rem" }}
                    >
                      {c.ultimoMovimiento}
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", gap: "0.3rem", alignItems: "flex-start" }}>
                  {c.noContinua && (
                    <span
                      style={{
                        padding: "0.1rem 0.5rem",
                        borderRadius: "999px",
                        fontWeight: 700,
                        fontSize: "0.74rem",
                        color: "#b71c1c",
                        background: "#ffebee",
                      }}
                    >
                      No continúa
                    </span>
                  )}
                  <span
                    style={{
                      padding: "0.1rem 0.5rem",
                      borderRadius: "999px",
                      fontWeight: 700,
                      fontSize: "0.74rem",
                      color: color.color,
                      background: color.fondo,
                    }}
                  >
                    {etiqueta(voc.estados, c.estado)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
