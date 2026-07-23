# KIDS2026 — Plataforma LGS Kids

Gestión académica de **LGS Kids**: enseñanza de inglés para niños de 6 a 13
años, avalada por LetsGoSpeak. Opera en Chile, Colombia, Ecuador y Perú con
clases virtuales por cohortes (salones con horario fijo).

- **Producción (futuro):** https://lgskidsplataforma.com
- **Arquitectura:** monolito modular — [docs/architecture/overview.md](docs/architecture/overview.md)
- **Decisiones:** [docs/adr/](docs/adr/)

## Desarrollo

Requisitos: Node ≥ 24, pnpm ≥ 11, Docker Desktop.

```bash
pnpm install
copy .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d
pnpm dev
```

Verificación completa (la misma del CI):

```bash
pnpm verify   # lint + tipos + pruebas + arquitectura + build
```

## Estructura

```
src/modules/     14 módulos de negocio (importables SOLO por su index.ts)
src/platform/    técnico transversal sin reglas de negocio
src/app/         rutas Next.js delgadas (páginas + API + health)
src/ui/          componentes compartidos
worker/          tareas programadas
prisma/          esquema y migraciones (desde Fase 3)
docs/            arquitectura, ADRs, runbooks, operación
infra/           Docker local y especificaciones de despliegue
```

Los límites entre módulos se hacen cumplir con pruebas de arquitectura
(`pnpm test:arch`) que corren en CI.
