# ADR-0010 — Intake de beneficiarios desde LGS

**Estado:** Aceptado · 2026-08-19 (decisión del negocio) ·
**Modifica** [ADR-0008](0008-contratos-nacen-en-kids.md)

## Contexto

Los contratos de los programas de adultos se venden/gestionan en **LGS/MOSAICO**.
Cuando un contrato incluye un **beneficiario niño**, ese niño debe quedar
registrado en KIDS contra una campaña abierta, su tipo de curso (por edad) y un
salón con cupo, **reteniendo el cupo** hasta que se apruebe. El ADR-0008 asumía
que el contacto con LGS era solo el *egreso* Youngster→LGS (manual, sin HMAC) y
que los contratos "nacen en KIDS". Este flujo agrega una **entrada desde LGS**.

## Decisión

1. **El contrato de un beneficiario puede NACER de un intake de LGS**, con una
   **referencia externa** (`contracts_contract.external_ref` = N° de contrato
   LGS, idempotente) y `firmado = true` (firmado en LGS, sin aprobar en KIDS).
   El resto de contratos siguen naciendo en KIDS (ADR-0008 sigue vigente para
   ese caso; `external_ref` es NULL).
2. **La reserva retiene cupo** con un estado de matrícula nuevo, `RESERVADA`:
   cuenta para la ocupación (no hay sobreventa, `FOR UPDATE`) pero el alumno NO
   está activo ni aparece en el roster. Al **aprobar** el contrato, la reserva
   pasa a `ACTIVA` reusando el alta única (credenciales + rol). El cupo se
   retiene **hasta aprobar** (sin vencimiento; se libera al inactivar).
3. **Puerta de servicio (Fase B):** LGS llama a KIDS por HTTP autenticándose con
   **API-key** (`x-api-key`, `LGS_INTAKE_API_KEY`, comparación en tiempo
   constante) — una puerta DISTINTA de la de usuario final (JWT). Endpoints:
   `GET /api/kids-intake/availability`, `POST /api/kids-intake/reservations`,
   `POST /api/kids-intake/reservations/{externalRef}/approve`. Las acciones se
   auditan contra el usuario de sistema `sistema-lgs`.

Esto **modifica** el punto de ADR-0008 que decía "no se construye sincronización
firmada con HMAC" y "solo se construirá API si el volumen lo justifica": la API
de intake existe. HMAC queda como endurecimiento futuro sobre la API-key.

## Consecuencias

- El intake (crear reserva) es **idempotente** por `external_ref`.
- La misma lógica la usan el **wizard del panel** (`/panel/reservas`, JWT) y la
  **puerta de servicio** (API-key): un solo núcleo `crearReservaBeneficiario`.
- En producción, la puerta requiere KIDS accesible públicamente (despliegue DO,
  Fase 11) y el secreto provisionado en ambos sistemas. En local se prueba con
  `curl` simulando a LGS.
