"use client";

import { useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Fila {
  childPersonId: string;
  nombre: string;
  username: string;
  externalRef: string;
  resultado: string;
}
interface Recuperacion {
  aplicar: boolean;
  resultados: Fila[];
  resumen: Record<string, number>;
}

const TEXTO: Record<string, string> = {
  RECUPERADA: "Copia recuperada",
  COINCIDE: "Se puede recuperar",
  NO_COINCIDE: "Ya cambió su clave",
  SIN_CLAVE_EN_LGS: "LGS no tiene su clave inicial",
  OTRO_USUARIO: "LGS tiene otro usuario",
  YA_TENIA: "Ya tenía copia",
  SIN_CUENTA: "Sin cuenta",
};
const COLOR: Record<string, string> = {
  RECUPERADA: "#1b5e20",
  COINCIDE: "#1b5e20",
  NO_COINCIDE: "#8a4b00",
};

const btn: CSSProperties = {
  padding: "0.45rem 0.9rem",
  borderRadius: "0.6rem",
  border: "1px solid #d8dce6",
  background: "white",
  fontWeight: 700,
  fontSize: "0.85rem",
  cursor: "pointer",
};

/**
 * Recuperar desde LGS la copia de la bóveda de los niños "Sin copia" (2026-11-12).
 * Primero se REVISA (no guarda nada: comprueba y cuenta) y luego se recupera. La
 * clave de nadie cambia, y la pantalla nunca recibe claves.
 */
export function RecuperarCopiasLgs() {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [r, setR] = useState<Recuperacion | null>(null);

  async function correr(aplicar: boolean) {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch("/api/contracts/recuperar-claves-lgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aplicar }),
      });
      const d = (await res.json().catch(() => ({}))) as Recuperacion & {
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(d.error?.message ?? "No se pudo consultar a LGS.");
        return;
      }
      setR(d);
    } finally {
      setOcupado(false);
    }
  }

  const porRecuperar = r?.resumen["COINCIDE"] ?? 0;

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "0.9rem 1rem",
        border: "1px solid #e3e7f0",
        borderRadius: "0.9rem",
        background: "#fbfcff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.6rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <strong style={{ fontSize: "0.95rem" }}>🔑 Claves “Sin copia” de niños de LGS</strong>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.82rem", color: "var(--texto-suave)" }}>
            Toma la clave inicial que guardó LGS y, si sigue siendo la del niño, la deja en la
            bóveda para poder verla y enviarla. No cambia la clave de nadie.
          </p>
        </div>
        {!abierto && (
          <button type="button" style={btn} onClick={() => setAbierto(true)}>
            Revisar…
          </button>
        )}
      </div>

      {abierto && (
        <div
          style={{ marginTop: "0.7rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}
        >
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" style={btn} disabled={ocupado} onClick={() => void correr(false)}>
              {ocupado && r === null ? "Revisando…" : "1. Revisar (sin guardar)"}
            </button>
            <button
              type="button"
              disabled={ocupado || r === null || r.aplicar || porRecuperar === 0}
              onClick={() => void correr(true)}
              style={{
                ...btn,
                border: "none",
                background:
                  ocupado || r === null || r.aplicar || porRecuperar === 0
                    ? "#9e9e9e"
                    : "var(--lgs-azul)",
                color: "white",
              }}
            >
              2. Recuperar {porRecuperar > 0 && !r?.aplicar ? `(${String(porRecuperar)})` : ""}
            </button>
          </div>
          {error !== null && (
            <p role="alert" style={{ margin: 0, color: "#c62828", fontSize: "0.85rem" }}>
              {error}
            </p>
          )}
          {r !== null && (
            <>
              <p style={{ margin: 0, fontSize: "0.85rem" }}>
                {r.aplicar ? "Resultado: " : "Revisión: "}
                {Object.entries(r.resumen)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => `${TEXTO[k] ?? k}: ${String(n)}`)
                  .join(" · ") || "no hay cuentas de niños de LGS sin copia."}
              </p>
              {r.resultados.length > 0 && (
                <div
                  style={{
                    maxHeight: "16rem",
                    overflowY: "auto",
                    border: "1px solid #e3e7f0",
                    borderRadius: "0.6rem",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <tbody>
                      {r.resultados.map((f) => (
                        <tr key={f.childPersonId} style={{ borderTop: "1px solid #eef0f5" }}>
                          <td style={{ padding: "0.35rem 0.6rem" }}>
                            <a href={`/panel/personas/${f.childPersonId}`}>{f.nombre}</a>
                          </td>
                          <td style={{ padding: "0.35rem 0.6rem", fontFamily: "monospace" }}>
                            {f.username}
                          </td>
                          <td style={{ padding: "0.35rem 0.6rem" }}>
                            {f.externalRef.split("#")[0]}
                          </td>
                          <td
                            style={{
                              padding: "0.35rem 0.6rem",
                              fontWeight: 700,
                              color: COLOR[f.resultado] ?? "#5a6172",
                            }}
                          >
                            {TEXTO[f.resultado] ?? f.resultado}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(r.resumen["NO_COINCIDE"] ?? 0) + (r.resumen["SIN_CLAVE_EN_LGS"] ?? 0) > 0 && (
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                  Para los que ya cambiaron su clave o no la tiene LGS: restablecer la clave o
                  enviar el enlace de perfil desde su ficha.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
