# ADR-0004 — Un solo esquema PostgreSQL, prefijo de módulo y presupuesto de conexiones

**Estado:** Aceptado · 2026-07-22

## Decisión

- **Un solo esquema** PostgreSQL. Las tablas llevan prefijo de módulo
  (`contracts_contract`, `scheduling_session`, …). Los esquemas separados por
  módulo añaden fricción con Prisma sin aportar aislamiento real en un
  monolito.
- **UUID** en identificadores expuestos; `created_at`/`updated_at` en todas
  las tablas; `deleted_at` solo donde el negocio justifique borrado lógico.
- **Presupuesto de conexiones:** la base administrada admite ~22. El pool de
  la aplicación se limita a **8–10** (`DB_POOL_MAX`, default 8) dejando
  margen para worker, migraciones y administración. En LGS un pool mal
  dimensionado agotó la base.
- `DATABASE_URL` (con pool) para la aplicación; `DIRECT_DATABASE_URL` para
  migraciones.
- Auditoría en tablas separadas de las operativas.

## Consecuencias

- La propiedad de tablas por módulo se garantiza por convención de prefijo +
  regla "solo su infrastructure las escribe", verificada en revisión de código.
