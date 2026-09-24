# Imagen de producción de KIDS2026 (App Platform de DigitalOcean).
#
# DEBIAN, no Alpine: `sharp` (libvips) y `ffmpeg-static` traen binarios
# compilados contra glibc. Sobre musl no corren, y el fallo aparece tarde —al
# subir una imagen o al comprimir un video—, no al construir.
#
# Node 24 y pnpm 11 son los mismos del desarrollo (ver "Versiones" en
# CLAUDE.md): la instalación congelada tiene que resolver igual que en CI.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- dependencias ---------------------------------------------------------
# Capa propia: mientras el lockfile no cambie, no se reinstala nada.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build ----------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` no necesita base de datos: la configuración se valida perezosa
# (ver `platform/config/env.ts`).
RUN pnpm build

# ---- imagen final ---------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Se copian TODAS las dependencias, también las de desarrollo, a propósito: el
# trabajo de pre-despliegue corre `prisma migrate deploy` y `tsx scripts/seed.ts`
# con esta misma imagen. Podarlas ahorraría unos MB y dejaría sin migraciones
# al despliegue.
COPY --from=build /app ./

# El usuario `node` viene en la imagen oficial: el servidor no corre como root.
USER node

EXPOSE 3000

# Sin base de datos: comprueba que el proceso responde, no que el sistema esté
# sano (para eso está /api/health/ready, que sí consulta la base).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["pnpm", "start"]
