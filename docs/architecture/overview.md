# KIDS2026 — Arquitectura

Monolito modular (ADR-0001): Next.js App Router + worker, PostgreSQL
administrado, Spaces. Un despliegue web + un worker.

## Modelo de operación

**Cohortes con horario fijo.** El niño NO agenda: se matricula en un salón y
asiste a lo que el salón programe. La lista de sesión se deriva del salón,
nunca de una acción del estudiante.

```
CAMPAÑA (global, multi-país)                       CONTRATO (país aquí)
  └── CURSO (JUNIOR 6–9 | YOUNGSTER 10–13)           ├── titular
        ├── NIVEL (Rookie→Champion→Elite→Legendary)  ├── beneficiario (niño)
        │     ├── 4 LECCIONES (+ cuestionario c/u)   └── vigencia / OnHold
        │     └── LEVEL UP (promueve de nivel)
        ├── SALÓN (horario, guía, cupo, enlace,
        │          zona operativa + calendario feriados configurables)
        │     └── SESIONES (2/semana, 1 h)  →  ASISTENCIA
        └── CLUB (viernes o sábado; inscripción + asistencia requerida)
```

## Módulos y puertos

| Módulo        | Expone                                                         | Consumido por                                   |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| identity      | ProvisioningPort, Authenticator (se registra en platform/http) | enrollment (alta), todos (auth)                 |
| access        | AuthorizationPort (RBAC + alcance por país)                    | todos los api/                                  |
| people        | PersonQueryPort                                                | contracts, enrollment, reporting, notifications |
| contracts     | ContractQueryPort, función única de vencimiento                | enrollment, reporting                           |
| catalog       | CatalogQueryPort                                               | scheduling, enrollment, assessment, progression |
| scheduling    | ClassQueryPort, regeneración de sesiones                       | enrollment, attendance, reporting               |
| enrollment    | EnrollmentQueryPort, creación transaccional ÚNICA del alumno   | scheduling, attendance, progression             |
| attendance    | AttendanceQueryPort                                            | progression, reporting                          |
| assessment    | AssessmentQueryPort                                            | progression, reporting                          |
| progression   | la función central de avance                                   | — (reacciona a eventos)                         |
| files         | StoragePort (Spaces/local, privado por defecto)                | contracts, catalog, people                      |
| audit         | AuditPort                                                      | todos los críticos                              |
| notifications | — (reacciona a eventos: WhatsApp/correo)                       | —                                               |
| reporting     | consultas SQL con AT TIME ZONE                                 | —                                               |

**Eventos de dominio:** `AsistenciaRegistrada` y `CuestionarioAprobado` son
los ÚNICOS disparadores de `progression` (desde todos los caminos).
`ContratoAprobado` dispara el alta única del alumno. `NivelCompletado` genera
medalla → WhatsApp. `Legendary completado` genera diploma y flujo de
continuidad (Junior→Youngster, o egreso a LGS Adultos).

## Reglas duras (costaron caro en LGS/Mosaico)

1. `final_curso` NUNCA se reescribe; el fin real es la fecha de la última
   sesión.
2. Suspensiones y feriados en TABLA (la regeneración es destructiva).
3. Al regenerar, los alumnos se derivan de la matrícula, no de inscripciones
   previas.
4. UTC + zona operativa por salón + `AT TIME ZONE` en SQL (ADR-0007).
5. Un solo lugar transaccional donde nace un alumno.
6. Autorización en el servidor, endpoint por endpoint.
7. Nada de estado en memoria que deba sobrevivir un reinicio.

Los límites de módulos se hacen cumplir con `.dependency-cruiser.cjs`
(`pnpm test:arch`) en CI.
