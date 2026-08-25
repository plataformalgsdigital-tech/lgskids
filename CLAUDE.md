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
  UNA TRANSACCIÓN los cursos Junior+Youngster con **5 niveles** c/u
  (Rookie 2m · Champion 2m · Elite 3m · Legendary 3m · Ultimate Stage 2m = 12
  meses; `catalog_level.duracion_meses`), 4 lecciones por nivel (cuestionario
  de práctica c/u) y un Level Up por nivel: 2/10/40/50 filas. **Fechas (2026-08-24)**: la campaña pide `inicio`
  (comercial) + `inicio del curso`; `fin` = inicio + **12 meses** (EDITABLE
  vía `PATCH /api/catalog/campaigns/[id]` → `actualizarFechasCampania`; NO
  toca `final_curso`). `final_venta` (cierre de matrícula) = inicio del curso
  + **3 semanas**. El curso arranca en su fecha; `final_curso` = fin de campaña
  (nominal, NUNCA reescrito). Estado de campaña SIEMPRE derivado por fecha
  (nunca almacenado): **EN_MATRÍCULA** hasta `final_venta` (única visible en el
  wizard de contratos y en el intake, que ya filtran EN_MATRICULA) → **ACTIVA**
  → **CERRADA/Inactiva** al pasar `fin`. Fechas DATE puro leído con `::text`.
  Permisos: `catalogo.gestionar` (admin, coordinador) y `catalogo.ver`
  (+ guía). UI: /panel/campanias (wizard: campaña + crea JUNIOR/YOUNGSTER
  Salón 1–6 DESDE EL CATÁLOGO de horarios por número/grupo).
- **Referencia curricular (2026-08-25)**: evaluada la tabla plana `NIVELES` de
  MOSAICO; en KIDS se materializa como **tabla MAESTRA `catalog_curso`**
  (migraciones `20260825000001`/`...002`), INDEPENDIENTE de campañas: una fila
  por `(curso, nivel, unidad, leccion)` (la **unidad** agrupa las unidades del
  nivel) con `quiz` (JSONB, cuestionario, antes de `leccion`), `contenido`
  (temario md), `video`, `clubes`/`material_usuario`/`material_guia`/
  `actividades`/`recursos` (JSONB) + `orden`. El contenido de "Junior·Rookie·Lección 1" es el mismo en toda
  campaña → se carga UNA vez aquí. Es la fuente para paneles de alumno/guía y
  actividades de seguimiento (consumo aún pendiente). CRUD:
  `GET|POST /api/catalog/curso` + `GET|PUT|DELETE /api/catalog/curso/[id]`
  (`curso-referencia.ts`; único por curso·nivel·unidad·lección; ver=catalogo.ver,
  escribir=catalogo.gestionar). **Import CSV** (`POST /api/catalog/curso/bulk` →
  `importarCursoReferencia`, UPSERT por clave natural): UI `/panel/mantenimiento-cursos/subir-curso`
  parsea el CSV en el navegador, muestra un PREVIO validado (✔/✘ por fila) y solo
  al confirmar sube las válidas. Listas en CSV: ítems `Nombre|enlace` separados por `;`. La migración `20260825000000` había puesto la
  referencia en `catalog_lesson` (por campaña) — se RETIRÓ (superada por
  `catalog_curso`); quedan como PENDIENTE (¿se necesitan?) las referencias de
  `catalog_level` (`descripcion`,`recursos`) y `catalog_quiz` (`modo`,`minutos`,
  preguntas en `contenido`) con `GET|PUT /api/catalog/{levels|quizzes}/[id]/referencia`.
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
  TODOS los niveles del curso completados ⇒ DIPLOMA (derivado de los niveles
  reales del curso, agnóstico al conteo — hoy 5). DERIVADA de assessment (nada se edita a mano),
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

## Panel del alumno (2026-07-23)

- **Interfaz propia del niño** en `/mi-panel` (layout separado del /panel
  administrativo, decisión de diseño). `GET /api/student/dashboard` deriva
  TODO del usuario logueado (findPersonByUserId) — un niño solo ve SUS
  datos; compone people+enrollment+attendance+progression en la capa app.
  Muestra: próxima clase (con botón "Entrar a clase" si hay meeting_url),
  salón/guía/campaña, resumen de asistencia (asistidas/ausentes/
  justificadas/total), progreso por nivel con medallas y diploma, y agenda
  de próximas sesiones. Requiere permiso `panel.alumno`. El login enruta a
  /mi-panel si el usuario es alumno (y no staff), al /panel en otro caso.
- **Acceso a Zoom (2026-08-25, replicado de MOSAICO)**: lógica PURA en
  `src/ui/zoom-window.ts` (cliente): ventana de ingreso `[inicio − 5 min,
  inicio + 15 min]`; tras entrar, **reconexión** hasta 10 min antes del fin
  (fin = inicio + `duracion_min`). Estados `espera → disponible → vencido |
  cerrado`. Iconos en `src/ui/ZoomAccessButton.tsx`: cámara azul + check verde
  (disponible, enlace clicable) / cámara gris + reloj naranja (bloqueado), con
  mensaje por estado. Se compara contra el INSTANTE `starts_at` (UTC), no la
  hora local. El "entrar a tiempo" solo habilita la reconexión (recordada por
  sesión en `localStorage`; NO penaliza asistencia). Enlace = `meeting_url` del
  salón. El guía ve "🎥 Ir a Zoom" en la página de asistencia de la sesión
  (siempre, sin ventana). Pendiente: bitácora server-side de accesos
  (minutos-desde-inicio) para cruzar con el reporte de Zoom.

## Sitio público / landing (2026-07-23)

- **Landing de marketing en la raíz `/`** (`src/app/page.tsx`, cliente):
  ruta Next DELGADA, solo presentación, SIN reglas de negocio (respeta el
  monolito: la lógica vive en `modules/`, esto es `app/` puro). Estilos en
  `src/app/landing.css` AISLADOS con el prefijo `.lgs-landing` (no afectan
  login/panel); tema propio claro/oscuro con `.lgs-landing.dark|.light`.
  Contenido tomado de letsgospeak.cl/lgs-kids (6–13 años, en vivo, grupos
  1–9, niveles Rookie→Legendary, medallas, guías, LetsGoSpeak). La app vive
  en `/login` y `/panel`; el footer enlaza a `/login`.
- **Versión estática** en `landing-estatica/index.html`: el MISMO diseño en
  un HTML autocontenido para subir a **Hostinger** (hosting compartido) en
  lgskidsplataforma.com. La plataforma completa (Node + Postgres) irá a
  DigitalOcean, previsiblemente en `app.lgskidsplataforma.com`.
- **Sesión en el cliente**: las páginas del panel usan `@/ui/api-fetch`
  (`apiFetch`), que ante un 401 rota el refresh token y reintenta —así la
  sesión no se cae a los 15 min del access token. NO volver a poner
  `router.replace("/login")` directo sobre un 401 sin pasar por `apiFetch`.
- `pnpm demo:alumno` crea un alumno matriculado de punta a punta (con
  asistencia y medalla) e imprime usuario/clave para revisar `/mi-panel`.

## Vocabulario del negocio (obligatorio en código y UI)

**Guía** (no profesor) · **Club** (no taller) · **Sesión** (no clase) ·
**Salón** · **Campaña**. Niveles: Rookie → Champion → Elite → Legendary →
Ultimate Stage (5 niveles; duración 2/2/3/3/2 meses).

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

## Intake de beneficiarios desde LGS (2026-08-19, ADR-0010)

Entrada desde LGS/MOSAICO: un beneficiario niño se registra en KIDS contra una
campaña abierta + curso (por edad) + salón con cupo, reteniendo el cupo como
matrícula `RESERVADA` hasta aprobar (el alta única activa RESERVADA→ACTIVA).
`contracts_contract.external_ref` (N° LGS, idempotente) + `firmado`. Núcleo
único `crearReservaBeneficiario`. Dos puertas al mismo núcleo: el **wizard**
`/panel/reservas` (JWT) y la **puerta de servicio** módulo `intake`
(API-key `x-api-key` / `LGS_INTAKE_API_KEY`, `handlerWithServiceAuth`):
`GET /api/kids-intake/availability`, `POST /api/kids-intake/reservations`,
`POST /api/kids-intake/reservations/{externalRef}/approve`. Auditoría contra el
usuario de sistema `sistema-lgs`. **Catálogo de horarios** reutilizable por tipo
de curso, **grupo de país** (`scheduling_horario.grupo_pais`: `01`=Chile,
`02`=Colombia/Ecuador/Perú — por el desfase horario CL vs. el resto) y **salón**
(`salon_numero`: el horario COMPLETO es un salón — todos sus días son el mismo;
el 1er horario suele ser Salón 01, el 2º Salón 02). Unicidad de etiqueta por
(tipo, grupo, salón). Editable (`PUT /api/scheduling/horarios/[id]` →
`actualizarHorario`, reemplaza bloques), activable/desactivable (`PATCH`).
Mantenible en `/panel/horarios`, alimenta el selector al crear salón (materializa
`scheduling_slot`; NO es texto como Mosaico) y el wizard de campaña usa este
catálogo para generar JUNIOR/YOUNGSTER Salón 1–6 por grupo.
**Salón editable (2026-08-24)**: `PATCH /api/scheduling/classrooms/[id]` →
`editarSalon` (cupo, guía, `activo`); al **desactivar** un salón sale del wizard
de contratos y del intake (ambos filtran `activo`). `DELETE` → `eliminarSalon`
(borra salón+sesiones+slots+suspensiones; SE BLOQUEA con 409 si el salón tiene
matrículas — desactivar en su lugar). Su detalle muestra las fechas de la campaña
(editar fin/cierre desde ahí afecta a TODA la campaña). El **detalle de campaña**
(`/panel/campanias/[id]`) lista todos los salones en una tabla (Tipo, Salón,
Guía, Horario, Inicio/Final curso, Cierre matríc., Cupos, Estado, Acciones) y
tiene **"Generar salones del catálogo"** (`POST /api/scheduling/campaigns/[id]/generate`
→ `generarSalonesDesdeCatalogo`): crea un salón por cada horario activo del
catálogo (ambos grupos, ambos tipos) con **guía pendiente** y cupo 12,
idempotente por nombre. El menú lateral llama **"Calendario"** a `/panel/salones`.

## Pendientes conocidos

- **Endurecer la auth de servicio del intake de API-key a HMAC** (integridad +
  anti-replay + el secreto no viaja): alinear con el `crm-bridge` de MOSAICO.
  No urgente sobre HTTPS con rotación de clave.
- Despliegue a DigitalOcean (Fase 11) pendiente: sin él, la puerta de servicio
  no puede recibir llamadas reales de LGS (KIDS debe ser público + la clave
  `LGS_INTAKE_API_KEY` provisionada en ambos sistemas).
- Procedimiento operativo para cuando el desfase CL–CO sea de 2 h (verano
  austral): el negocio lo definirá más adelante.
- Remoto GitHub `origin` = plataformalgsdigital-tech/lgskids. Falta definir
  protección de `main` y CI.
- Docker Desktop SÍ está instalado; `docker compose -f infra/docker/...` levanta
  Postgres local.
- **Escopar el registro de intentos de quiz al salón del guía**: `POST
  /api/assessment/attempts` valida `evaluaciones.gestionar` pero NO que el niño
  pertenezca a un salón del guía (a diferencia de asistencia, que ya lo hace vía
  `verificarAccesoGuia`). El intento no lleva sesión/salón, así que hay que
  derivar la matrícula ACTIVA del niño y comparar `guia_user_id` con el actor
  cuando este no tenga `salones.gestionar`.
