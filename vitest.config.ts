import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/modules/**/tests/**/*.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/.gitkeep"],
    // Las pruebas de integración corren en paralelo contra UNA base compartida: bajo carga
    // varias pasaban de los 5 s por defecto sin que nada estuviera mal (flaky intermitente).
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
