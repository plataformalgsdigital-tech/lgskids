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
      // El libro interactivo se abre DENTRO del panel, en un iframe: su ruta
      // es la única que la plataforma puede enmarcar (SAMEORIGIN, y la CSP de
      // la respuesta lo repite con `frame-ancestors 'self'`). Va DESPUÉS de la
      // regla general porque, cuando dos reglas fijan la misma cabecera, gana
      // la última.
      {
        source: "/api/:area(catalog|student)/material/:id",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
