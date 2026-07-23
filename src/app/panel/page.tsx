"use client";

import { useEffect, useState } from "react";

interface Me {
  user: { id: string; username: string; debeCambiarPassword: boolean } | null;
  roles: { roleCode: string; countryCode: string | null }[];
  paises: string[] | null;
}

export default function PanelPage() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelado = false;
    void fetch("/api/auth/me").then(async (res) => {
      if (res.ok && !cancelado) {
        setMe((await res.json()) as Me);
      }
    });
    return () => {
      cancelado = true;
    };
  }, []);

  if (me === null) {
    return (
      <main style={{ padding: "2rem" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando tu panel…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h2 style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>¡Hola, {me.user?.username}! 👋</h2>
      <p style={{ color: "var(--texto-suave)" }}>
        Roles:{" "}
        {me.roles
          .map((r) => r.roleCode + (r.countryCode ? ` (${r.countryCode})` : ""))
          .join(", ") || "sin roles"}
        {" · "}
        Alcance: {me.paises === null ? "todos los países" : me.paises.join(", ") || "—"}
      </p>
      <p style={{ marginTop: "2rem", color: "var(--texto-suave)" }}>
        Usa el menú lateral para navegar. Los módulos académicos se irán encendiendo fase a fase.
      </p>
    </main>
  );
}
