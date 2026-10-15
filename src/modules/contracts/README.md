# Módulo `contracts`

Contrato (nace en KIDS), vigencia con finalContrato DATE puro (+2 días de gracia, UNA sola función), OnHold con extensión automática, cascada de inactivación sincronizada.

## Estructura

- `domain/` — Entidades, objetos de valor, reglas puras, eventos de dominio.
- `application/` — Casos de uso, comandos, consultas, DTOs, PUERTOS (interfaces).
- `infrastructure/` — Repositorios, adaptadores, acceso a datos. Único lugar que escribe las tablas de este módulo.
- `api/` — Handlers HTTP y validación de entrada (Zod).
- `ui/` — Componentes y hooks propios del módulo.
- `index.ts` — API pública: lo único importable desde fuera.
- `tests/` — Pruebas del módulo.

## OnHold sincronizado con LGS (2026-10-14)

El OnHold pide lo MISMO que en LGS: **fecha de inicio, fecha de fin y motivo**,
con las mismas reglas: fin posterior al inicio, **máximo 2 OnHold por contrato**,
bloquea el login del niño (salvo otro contrato vivo) y, al cerrar, extiende
`final_contrato` por los días **realmente pausados** (`diasDePausa`: hasta hoy,
o hasta el fin programado si ya pasó).

`contracts_onhold` distingue `tipo` (`ONHOLD` devuelve días · `SUSPENSION` =
inactivado en LGS, no devuelve) y `origen` (`KIDS` | `LGS`), y guarda
`hasta_programado` y `activado_por`.

| Dónde se hace                   | Qué pasa en la otra plataforma                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel KIDS › Pausar / Reactivar | LGS **primero** vía `POST {LGS_API_URL}/api/kids-sync/onhold` (`infrastructure/lgs-sync.ts`); si LGS rechaza o no responde, no se hace en ningún lado    |
| LGS (ficha del kid)             | entra por `POST /api/kids-intake/reservations/{ref}/onhold` y `/onhold/end` (`pausarPorExternalRef` / `finPausaPorExternalRef`), sin eco de vuelta       |
| Fin programado                  | worker `contracts.fin_onhold` (cada hora) cierra y avisa a LGS; el cron de LGS hace lo mismo allá. El primero manda los días y el otro queda idempotente |

## Extensión manual de vigencia sincronizada con LGS (2026-10-15)

Igual que en LGS: **nueva fecha final** (posterior a la actual) y **motivo**. Corre
`final_contrato` N días, queda en `contracts_extension` y **reactiva** al niño si
el contrato estaba INACTIVO o suspendido desde LGS (un OnHold vigente se respeta:
solo corre la fecha). Como en LGS, un contrato con extensión manual **ya no admite
OnHold** (`exigirPuedePausar`).

| Dónde se hace                  | Qué pasa en la otra plataforma                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Panel KIDS › Extender vigencia | LGS **primero** vía `POST {LGS_API_URL}/api/kids-sync/extension`; si rechaza o no responde, no se extiende en ningún lado |
| LGS (ficha del kid)            | entra por `POST /api/kids-intake/reservations/{ref}/extend` (`extenderPorExternalRef`), mismos días, sin eco              |

En OnHold y en extensión, la plataforma que recibe el cambio usa los **mismos
días** que extendió la otra, para que la fecha final quede igual en los dos
lados. Requiere `LGS_API_URL` + `LGS_INTAKE_API_KEY` (la misma clave en ambos
sentidos).
