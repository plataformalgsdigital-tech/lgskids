import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/modules/**/tests/**/*.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/.gitkeep"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
