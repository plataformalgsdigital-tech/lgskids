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
- **Fase 6 (`scheduling`) completada**: migración `20260726000000_scheduling`
  (salón, slots, sesiones, feriados, suspensiones). Salón: zona operativa Y
  calendario de feriados configurables por salón; slots SESION/CLUB.
  **Generación determinística** (`scheduling/domain/generacion.ts`): conteo
  NOMINAL desde `(inicio, final_curso, díaSemana)`; feriados/suspensiones
  corren la sesión AL FINAL conservando el total; el fin real es la última
  sesión y `final_curso` jamás cambia (invariante probado: regenerar N
  veces = mismo conjunto). Feriados por CÓDIGO 4 países (computus de
  Pascua, Ley Emiliani CO, trasladables CL) + `feriados-extra.ts` curado
  que SOLO SUMA; se materializan en tabla antes de generar. Suspensión:
  motivo obligatorio, en tabla, con regeneración inmediata. Inserción de
  sesiones POR LOTES (unnest). `starts_at` = pared de reloj del salón →
  UTC (DST chileno probado). Permisos: salones.gestionar/ver.
  UI: /panel/salones (+ detalle con suspender/regenerar).
- **Fase 7 (`enrollment`) completada**: migración
  `20260727000000_enrollment_contract_numero` (matrículas + `numero` SERIAL
  en contratos). **La lista del salón se DERIVA de matrículas ACTIVAS** —
  no hay tabla de inscripciones que se desincronice. `matricularTx` es el
  núcleo único compartido por todos los caminos (matricular directo,
  aprobar contrato con salón, cambio académico): cupo con `FOR UPDATE`
  (sin carreras), tipo de curso validado, una ACTIVA por contrato.
  Cambio académico: cierra con motivo (historial) + crea nueva validando
  cupo, en una transacción. La cascada de inactivar contrato CANCELA la
  matrícula. Aprobar contrato acepta `classroomId` opcional (alta única
  completa). **Buscador global** en el panel (`/api/search` + /panel/buscar):
  N° de contrato, documento, nombre, apellido o username, respetando
  alcance por país. Permisos: matriculas.gestionar/ver (guía ve).
- **Fase 8 (`attendance` + `assessment`) completada**: migración
  `20260728000000_attendance_assessment`. Asistencia: UNA marca por
  (sesión, niño) con UPSERT — individual y masiva pasan por el MISMO
  camino (`marcarAsistencia`); JUSTIFICADO exige justificación; la lista
  muestra AVISO cuando la fecha es feriado en el país del NIÑO (política
  de docs/operacion/politica-feriados-asistencia.md). Cuestionarios:
  intentos con umbral 70/100 (PROVISIONAL — `assessment/domain/calificacion.ts`,
  reintentos ilimitados), validando matrícula activa en el curso del quiz.
  **Hooks de Fase 9**: `marcarAsistencia` y `registrarIntento` son LOS DOS
  únicos caminos que dispararán la función central de progresión.
  UI: clic en una sesión del salón → página de asistencia con quiz inline.
  `ver-base-datos.bat` abre Prisma Studio (puerto 5555). Permisos:
  asistencia.gestionar/ver, evaluaciones.gestionar/ver (guía gestiona).
- **Fase 9 (`progression`) completada**: migración `20260729000000_progression`.
  **LA FUNCIÓN CENTRAL** (`progression/application/recalcular.ts`):
  4 prácticas aprobadas + Level Up aprobado ⇒ nivel COMPLETADO ⇒ MEDALLA;
  4 niveles ⇒ DIPLOMA. DERIVADA de assessment (nada se edita a mano),
  IDEMPOTENTE (premios una sola vez) y RECUPERABLE (cualquier invocación
  re-deriva todo). NO cuenta sesiones asistidas. **Caminos que la
  disparan** (verificados por `progression/tests/caminos-progresion.test.ts`
  — agregar un camino nuevo EXIGE sumarlo ahí): 1) marcarAsistencia, 2) registrarIntento, 3) worker recalculo_global cada 12 h (red de
  seguridad). Awards con `notificado_en` NULL hasta que Fase 10 envíe por
  WhatsApp. UI: /panel/progreso/[childId] (enlace 📈 en el roster).
  Permiso: progresion.ver.
- **Fase 10 (`reporting` + `notifications` + `files`) completada**:
  migración `20260730000000_notifications_files`. Notifications: patrón
  OUTBOX (encolar barato; el worker despacha cada 5 min con reintentos,
  máx 5) — LogSender sin credenciales, WhatsAppCloudSender (Meta) cuando
  existan WHATSAPP_TOKEN/PHONE_ID; `notificarPremiosPendientes` cada 15
  min arma el mensaje de medalla/diploma al WhatsApp REAL del apoderado.
  Files: StoragePort + LocalStorage (STORAGE_DIR) — PRIVADO por defecto,
  descarga solo autenticada, MIME allowlist (pdf/jpg/png/webp), 10 MB máx,
  claves impredecibles; adaptador Spaces se enchufa en Fase 11. Reporting:
  asistencia por salón/mes con `AT TIME ZONE cl.timezone` EN SQL,
  ocupación de salones, contratos por país (con alcance). UI:
  /panel/reportes. Permisos: reportes.ver, archivos.gestionar/ver.
- Plan de fases: ver `PROMPT_KIDS2026.md` sección 11. Siguiente: Fase 11
  (despliegue DigitalOcean — requisitos en docs/runbooks/).

## Gestión de roles y permisos (2026-07-23)

- **Rol = conjunto de permisos marcables** (RBAC editable desde el panel).
  UI /panel/usuarios con 2 pestañas: Usuarios (crear staff con password
  inicial + asignar roles con alcance por país) y Roles (crear rol + marcar
  sus permisos con checkboxes). `superadmin` es INTOCABLE (siempre todos
  los permisos; la app y el seed lo fuerzan). El seed llena permisos de un
  rol NO-superadmin solo si está vacío → respeta ediciones del panel.
  Editar permisos de un rol invalida toda la caché de perfiles.

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
