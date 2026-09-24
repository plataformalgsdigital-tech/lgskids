# Imagen de producción de KIDS2026 (App Platform de DigitalOcean).
#
# DEBIAN, no Alpine: `sharp` (libvips) y `ffmpeg-static` traen binarios
# compilados contra glibc. Sobre musl no corren, y el fallo aparece tarde —al
# subir una imagen o al comprimir un video—, no al construir.
#
# Node 24 y pnpm 11 son los mismos del desarrollo (ver "Versiones" en
# CLAUDE.md): la instalación congelada tiene que resolver igual que en CI.
FROM node:24-slim AS base
# OpenSSL: el motor de Prisma lo necesita para hablar TLS con la base
# administrada. La imagen `slim` no lo trae, y sin él las migraciones fallan
# con "P1001: Can't reach database server" —que suena a red, pero es esto—.
# `pg` no lo usa (va por el TLS de Node), así que el servicio web sí arrancaba.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/corepack
ENV PATH=$PNPM_HOME:$PATH
# `corepack enable` deja solo el atajo: el pnpm real se descarga la PRIMERA vez
# que se invoca. En la imagen final eso pasaría en producción, con el usuario
# `node`, que no puede escribir en las carpetas de root. Se baja aquí, de una
# vez para todas las etapas, y se deja legible para cualquiera.
RUN mkdir -p /pnpm /corepack \
  && corepack enable \
  && corepack prepare pnpm@11.16.0 --activate \
  && chmod -R a+rX /pnpm /corepack
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

# Se invoca el binario directo, no `pnpm start`: en producción no hace falta el
# gestor de paquetes para arrancar, y así el contenedor no depende de que
# corepack pueda escribir su caché. Lo mismo hacen el worker y el trabajo de
# migraciones en el spec de la app.
CMD ["node_modules/.bin/next", "start"]
