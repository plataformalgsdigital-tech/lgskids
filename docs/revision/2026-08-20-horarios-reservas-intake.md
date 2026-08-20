# Notas de revisión — Horarios, Reservas LGS e Intake (2026-08-20)

**Rango:** `f66e924..b8f5ab7` (5 commits) en `main`.
**Diff completo:** https://github.com/plataformalgsdigital-tech/lgskids/compare/f66e924...main
**Verificación:** `pnpm verify` (lint + tipos + tests + arquitectura + build) en verde antes del push.

## Resumen ejecutivo

Tres bloques nuevos, todos sobre el modelo modular existente (SQL parametrizado
vía `platform/db`, límites de módulo verificados por dependency-cruiser):

1. **Catálogo de horarios** reutilizable por tipo de curso (mantenimiento
   centralizado). ESTRUCTURADO (día/hora/duración), NO texto como Mosaico.
2. **Reservas de beneficiarios desde LGS (Fase A)**: estado de matrícula
   `RESERVADA` que retiene cupo sin activar al alumno; wizard `/panel/reservas`;
   la aprobación del contrato activa la reserva (RESERVADA→ACTIVA).
3. **Puerta de servicio LGS→KIDS (Fase B)**: módulo `intake` con auth por
   API-key para que LGS consulte disponibilidad, cree la reserva y la apruebe.

Además: fix del refresh en `apiFetch` (coalescing) y agenda/calendario de
salones + resumen de sesión + wizard de campañas (trabajo previo consolidado).

## Cambios por commit

| Commit | Qué |
|---|---|
| `cea2a16` | **fix(auth):** `apiFetch` serializa el refresh — peticiones concurrentes con 401 compartían `/auth/refresh` y la detección de reuso revocaba la familia de sesión. |
| `ae89dad` | **feat:** catálogo de horarios, reservas LGS (RESERVADA), agenda/calendario, wizard de campañas. |
| `0d3f746` | **feat(intake):** puerta de servicio LGS→KIDS (Fase B). |
| `05bf707`, `b8f5ab7` | **docs(claude):** CLAUDE.md (intake, horarios, pendientes). |

## Migraciones (aplicadas)

- `20260819000000_enrollment_reservada` — `ALTER TYPE enrollment_estado ADD VALUE 'RESERVADA'` (sola, por regla de Postgres).
- `20260819000001_contracts_intake_lgs` — `contracts_contract` + `external_ref` (único) y `firmado`.
- `20260819000002_scheduling_horarios_catalogo` — `scheduling_horario` + `scheduling_horario_slot`.
- `20260819000003_intake_service_user` — usuario de sistema `sistema-lgs` (actor de auditoría del intake).

## Puntos de atención para la revisión

- **RESERVADA retiene cupo pero NO activa al alumno**: la ocupación (`countActivas`,
  y las subconsultas `ocupados` de scheduling) cuenta `ACTIVA` + `RESERVADA`; el
  roster de asistencia y el panel del niño siguen SOLO en `ACTIVA`. Ver
  `enrollment/infrastructure/enrollment-repository.ts` y `application/matricula.ts`.
- **Núcleo único** `crearReservaBeneficiario` (contracts): titular + apoderado +
  niño + guardianship + contrato PENDIENTE (con `external_ref`, `firmado`) +
  matrícula RESERVADA, en UNA transacción. Idempotente por `external_ref`.
- **Activación** al aprobar: `aprobarContrato` convierte la RESERVADA en ACTIVA
  (reusa el alta única: credenciales + rol), en vez de crear una nueva.
- **Auth de servicio** (`handlerWithServiceAuth`): API-key `x-api-key` vs
  `LGS_INTAKE_API_KEY`, comparación en tiempo constante; si la clave no está
  configurada, la puerta queda CERRADA (401). Distinta de la de usuario (JWT).
- **Catálogo de horarios**: `scheduling_slot` sigue siendo el modelo operativo;
  el catálogo solo alimenta el selector y se materializa al crear salón.

## Cómo probar en local

```bash
docker compose -f infra/docker/docker-compose.yml up -d   # Postgres
pnpm migrate:deploy                                        # aplica migraciones
pnpm dev                                                   # http://localhost:3000
```

- Panel: **Horarios** (crear/desactivar), **Reservas (LGS)** (wizard),
  **Salones** (calendario + "cargar del catálogo" al crear salón).
- Puerta de servicio (simular LGS), con `LGS_INTAKE_API_KEY` en `.env`:

```bash
KEY=... # el de tu .env
curl -H "x-api-key: $KEY" http://localhost:3000/api/kids-intake/availability          # 200
curl http://localhost:3000/api/kids-intake/availability                               # 401 (sin clave)
# POST /api/kids-intake/reservations  -> 201 (crea reserva)
# POST /api/kids-intake/reservations/{externalRef}/approve -> 200 (activa)
```

## Pendientes conocidos

- **Endurecer la auth de servicio de API-key a HMAC** (integridad + anti-replay
  + el secreto no viaja): alinear con el `crm-bridge` de MOSAICO. No urgente
  sobre HTTPS con rotación de clave.
- **Despliegue a DigitalOcean (Fase 11)**: sin él, la puerta de servicio no
  puede recibir llamadas reales de LGS (KIDS debe ser público + `LGS_INTAKE_API_KEY`
  provisionada en ambos sistemas).
