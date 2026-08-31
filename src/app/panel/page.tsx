"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Me {
  user: { id: string; username: string; debeCambiarPassword: boolean } | null;
  roles: { roleCode: string; countryCode: string | null }[];
  paises: string[] | null;
  permisos: { code: string }[];
}

/**
 * Índice del panel: NO es una pantalla, es un despachador.
 *
 * Al entrar se aterriza en el Tablero. Se decide aquí y no en el login porque
 * un rol puede tener el panel sin `panel.tablero`: mandarlo directo desde el
 * login lo dejaría en una pantalla que no puede abrir. Si no tiene el permiso,
 * se le muestra el saludo de siempre y navega por el menú.
 */
export default function PanelPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      const res = await fetch("/api/auth/me");
      if (!res.ok || cancelado) return;
      const perfil = (await res.json()) as Me;
      if (cancelado) return;
      if (perfil.permisos.some((p) => p.code === "panel.tablero")) {
        router.replace("/panel/tablero");
        return;
      }
      setMe(perfil);
    }
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [router]);

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
          .map((r) => r.roleCode + (r.countryCode !== null ? ` (${r.countryCode})` : ""))
          .join(", ") || "sin roles"}
        {" · "}
        Alcance: {me.paises === null ? "todos los países" : me.paises.join(", ") || "—"}
      </p>
      <p style={{ marginTop: "2rem", color: "var(--texto-suave)" }}>
        Usa el menú lateral para navegar.
      </p>
    </main>
  );
}
