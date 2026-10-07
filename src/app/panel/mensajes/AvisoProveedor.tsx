"use client";

/** Dice por dónde salen los mensajes; en desarrollo, que NO salen. */
export function AvisoProveedor({ proveedor }: { proveedor: string | null }) {
  if (proveedor === null) return null;
  const simulado = proveedor === "SIMULADO";
  return (
    <p
      style={{
        margin: "0.75rem 0 0",
        padding: "0.55rem 0.9rem",
        borderRadius: "0.6rem",
        fontSize: "0.85rem",
        background: simulado ? "#fff8e1" : "#e8f5e9",
        color: simulado ? "#7a5200" : "#1b5e20",
      }}
    >
      {simulado
        ? "⚠ Modo simulado: este servidor no tiene el token de WhatsApp. Los envíos quedan en el historial pero NO llegan a nadie."
        : proveedor === "WHAPI"
          ? "WhatsApp conectado por Whapi (el mismo servicio de LGS)."
          : "WhatsApp conectado por la Cloud API de Meta."}
    </p>
  );
}
