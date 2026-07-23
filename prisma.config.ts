import { defineConfig } from "prisma/config";

// Prisma 7: las URLs de conexión viven aquí, no en schema.prisma.
// DIRECT_DATABASE_URL (sin pool) es la vía correcta para migraciones
// (ADR-0004). Node 24 carga .env sin dependencias externas.
try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env (CI define las variables directamente): seguir.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // eslint-disable-next-line no-restricted-syntax -- config de CLI, fuera del runtime de la app
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx scripts/seed.ts",
  },
});
