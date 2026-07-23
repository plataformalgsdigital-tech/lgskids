# ADR-0003 — Prisma para esquema y CRUD; SQL crudo parametrizado en rutas críticas

**Estado:** Aceptado · 2026-07-22

## Contexto

En LGS una consulta de historial sin índice recorría 165.000 filas (~10 s), y
las agrupaciones temporales en JavaScript con la zona del cliente produjeron
reportes incorrectos.

## Decisión

- **Prisma**: esquema, migraciones versionadas y CRUD simple. Se incorpora en
  la Fase 3 con el primer esquema real (en Fase 2 el acceso técnico vive en
  `platform/db` sobre `pg`).
- **SQL crudo parametrizado** (`$queryRaw` / helpers de `platform/db/query`)
  es permitido y esperado en: consultas dependientes de índices, agrupaciones
  por zona horaria (`AT TIME ZONE`), y actualizaciones por lote.
- Cada uso de SQL crudo se documenta en el módulo correspondiente.
- Nunca `prisma db push` contra producción; solo migraciones revisadas.

## Consecuencias

- Dos formas de acceso conviven; la frontera es "¿importa el rendimiento o la
  semántica temporal?" → SQL crudo.
- Los parámetros son SIEMPRE posicionales; interpolar valores es violación.
