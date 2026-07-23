# CLAUDE.md — KIDS2026

> Este archivo debe mantenerse PRECISO. En Mosaico quedó describiendo tablas
> inexistentes y causó fallas reales. Si cambias comportamiento, actualízalo.

## Qué es

Plataforma de gestión académica de **LGS Kids** (inglés para niños 6–13
años). Dominio: `lgskidsplataforma.com`. Multi-país: CL, CO, EC, PE.

**Modelo de cohortes con horario fijo**: el niño NO agenda; se matricula en
un salón y asiste a lo que el salón programe. La lista de sesión se deriva
del salón, nunca de una acción del estudiante.

## Estado actual

- **Fase 3 (identidad, acceso, auditoría) completada**: login por username
  (JWT 15 min + refresh rotativo con detección de reuso por familia), RBAC
  con alcance por país, auditoría, rate limiting persistido, UI /login y
  /panel con menú por permisos.
- **Esquema Prisma 7**: `prisma/schema.prisma` (URLs en `prisma.config.ts`,
  NO en el schema — cambio de Prisma 7). Migración inicial
  `20260723000000_identity_access_audit`. Todo instante es `timestamptz`.
- El acceso a datos usa SQL parametrizado vía `platform/db` (el client de
  Prisma se adoptará cuando aporte; CLI solo para esquema/migraciones).
- Rutas protegidas: `handlerWithAuth` + `getAccessProfile(...).requirePermission(...)`
  endpoint por endpoint. El autenticador se registra en `src/instrumentation.ts`
  (con guard `NEXT_RUNTIME === "nodejs"` — obligatorio para que el build Edge
  no intente compilar argon2/pg).
- Comandos nuevos: `pnpm seed` (países, roles, permisos, admin — exige
  SEED_ADMIN_PASSWORD), `pnpm migrate:dev|deploy`, `pnpm worker:dev`.
- **Fase 4 (`catalog`) completada**: migración `20260724000000_catalog`
  (campaña, curso, nivel, lección, cuestionario). Crear campaña genera EN
  UNA TRANSACCIÓN los cursos Junior+Youngster con 4 niveles c/u, 4
  lecciones por nivel (cuestionario de práctica c/u) y un Level Up por
  nivel: 2/8/32/40 filas. Estado de campaña SIEMPRE derivado por fecha
  (nunca almacenado). Fechas de campaña/curso son DATE puro leído con
  `::text` (pg parsearía DATE a medianoche local). Permisos nuevos:
  `catalogo.gestionar` (admin, coordinador) y `catalogo.ver` (+ guía).
  UI: /panel/campanias (+ detalle). `final_curso` no tiene endpoint de
  edición a propósito.
- **Fase 5 (`people` + `contracts`) completada**: migración
  `20260725000000_people_contracts`. Persona (doc único por país+tipo+número,
  SIN unique de email), apoderado–niño, contrato con país (ADR-0009).
  **Vigencia: UNA función** (`contracts/domain/vigencia.ts`) + gemelo SQL
  `SQL_CONTRATO_VENCIDO` (+2 días de gracia) — NO reimplementar. Edad
  validada contra fecha de nacimiento a la fecha de inicio. **Aprobar
  contrato = ALTA ÚNICA transaccional** (credenciales autogeneradas +
  correo sintético + rol alumno por país; Fase 7 le sumará matrícula).
  OnHold/reactivar extiende `final_contrato` por los días pausados.
  Inactivar = cascada sincronizada (contrato+persona+credenciales+sesiones)
  solo si no hay otros contratos vivos. Worker: barrido de vencidos cada
  6 h. Permisos: personas.gestionar/ver, contratos.gestionar/ver.
  UI: /panel/personas y /panel/contratos.
- Plan de fases: ver `PROMPT_KIDS2026.md` sección 11. Siguiente: Fase 6
  (`scheduling`: salones, generación de sesiones, feriados, suspensiones —
  las reglas más delicadas del dominio).

## Vocabulario del negocio (obligatorio en código y UI)

**Guía** (no profesor) · **Club** (no taller) · **Sesión** (no clase) ·
**Salón** · **Campaña**. Niveles: Rookie → Champion → Elite → Legendary.

## Comandos

```bash
pnpm dev          # desarrollo
pnpm verify       # lint + tipos + pruebas + arquitectura + build (cierre de fase)
pnpm test:arch    # solo límites de módulos (dependency-cruiser)
docker compose -f infra/docker/docker-compose.yml up -d   # Postgres local
```

## Estructura

- `src/modules/<m>/` — 14 módulos de negocio; anatomía
  domain/application/infrastructure/api/ui + `index.ts` (API pública, lo
  ÚNICO importable desde fuera; lo verifica `.dependency-cruiser.cjs`).
- `src/platform/` — técnico transversal SIN reglas de negocio: config (env
  con Zod), db (pool pg, max 8), errors, http (`handler`,
  `handlerWithAuth`), time (UTC ↔ zona operativa), ids, logging (JSON +
  correlation ID).
- `src/app/` — rutas Next.js delgadas. Health: `/api/health/live` (sin BD) y
  `/api/health/ready` (con BD).
- `worker/` — tareas programadas (esqueleto).
- `docs/adr/` — 9 ADRs vigentes. Léelos antes de decidir arquitectura.

## Reglas que NO se negocian (resumen; detalle en docs/architecture/overview.md)

1. `final_curso` NUNCA se reescribe; el fin real es la última sesión.
2. Suspensiones y feriados en tabla — la regeneración de un curso es
   destructiva y los recrea desde `(inicio, final, horario)`.
3. Instantes en UTC; zona operativa POR SALÓN; reportes con `AT TIME ZONE`
   en SQL. Nunca agrupar fechas en JS con la zona del cliente (ADR-0007).
4. UNA función central de progresión (4 lecciones + Level Up), disparada
   desde TODOS los caminos que registran asistencia o califican.
5. UN solo lugar transaccional donde nace un alumno (enrollment).
6. Autorización en el servidor, endpoint por endpoint (`handlerWithAuth`).
7. Login por username autogenerado; correo sintético para hermanos
   (`@alumnos.lgskidsplataforma.com`, no enrutable).
8. Campaña GLOBAL; el país vive en contrato/persona; calendario de feriados
   configurable por salón (ADR-0009 y
   `docs/operacion/politica-feriados-asistencia.md`).
9. Archivos privados por defecto (datos de menores).
10. `process.env` solo en `src/platform/config` (regla ESLint).
11. Operaciones multi-tabla SIEMPRE con `withTransaction`.

## Versiones (registradas 2026-07-22)

Node 24.11.0 · pnpm 11.16.0 · Next 16.2.11 · React 19.2.8 · TypeScript 5.9.3
(NO subir a TS 7: rompe Next/ESLint/depcruise) · ESLint 9.39.5 (NO subir a
10: eslint-plugin-react incompatible) · Zod 4.4.3 (API nueva: `z.url()`) ·
pg 8.22.0 · Vitest 4.1.10 · dependency-cruiser 18.1.0 · Prettier 3.9.6.

## Pendientes conocidos

- Docker Desktop NO está instalado en esta máquina — instalarlo para
  levantar Postgres local.
- Procedimiento operativo para cuando el desfase CL–CO sea de 2 h (verano
  austral): el negocio lo definirá más adelante.
- Repositorio remoto de GitHub aún no creado (protección de main, etc.).
