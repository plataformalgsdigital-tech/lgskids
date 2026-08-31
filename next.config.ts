import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cabeceras de seguridad básicas (sección 7 del diseño).
  // CSP completa se afinará cuando exista la interfaz real.
  // La pantalla se llama Calendario: /panel/salones se renombró a
  // /panel/calendario. La redirección permanente mantiene vivos los enlaces
  // y marcadores antiguos, incluidos los de detalle y sesión.
  async redirects() {
    return [
      { source: "/panel/salones", destination: "/panel/calendario", permanent: true },
      { source: "/panel/salones/:path*", destination: "/panel/calendario/:path*", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
