# Prisma — esquema y migraciones

Prisma se incorpora en la **Fase 3** junto con el primer esquema real
(identity, access, audit). Decisiones ya tomadas (ADR-0003, ADR-0004):

- Esquema único, tablas con prefijo de módulo (`identity_user`,
  `contracts_contract`, …).
- Migraciones versionadas y revisables; **nunca** `prisma db push` contra
  producción.
- `DATABASE_URL` (pool) para la aplicación; `DIRECT_DATABASE_URL` para
  migraciones.
- SQL crudo parametrizado en consultas críticas, vía `platform/db`.
