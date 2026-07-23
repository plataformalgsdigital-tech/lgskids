# ADR-0001 — Monolito modular con un solo despliegue

**Estado:** Aceptado · 2026-07-22

## Contexto

KIDS2026 necesita modularidad para crecer, pero el equipo es pequeño y las
plataformas hermanas (LGS, MOSAICO) ya demostraron que el dominio cabe en un
solo despliegue.

## Decisión

Next.js (App Router) + TypeScript como **monolito modular**: un servicio web +
un worker. La lógica se organiza **por módulo de negocio** (14 módulos en
`src/modules/`), no por capa técnica. Los límites se hacen cumplir con
**pruebas de arquitectura** (dependency-cruiser) en CI, no con procesos
separados.

Se descartan NestJS y monorepo con Turborepo: duplicarían servicios, costo de
infraestructura y curva de aprendizaje sin resolver ningún problema real.

## Consecuencias

- Un solo pipeline, un solo despliegue, una sola base.
- Si un módulo debe extraerse a futuro, la anatomía interna
  (domain/application/infrastructure/api) lo permite, al costo descrito en
  ADR-0002.
- Las reglas de límites viven en `.dependency-cruiser.cjs` y fallan el CI.
