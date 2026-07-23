# ADR-0008 — Los contratos nacen en KIDS

**Estado:** Aceptado · 2026-07-22 (decisión del negocio)

## Decisión

El contrato se **crea dentro de KIDS** (módulo `contracts`), como hace
Mosaico. LGS avala la marca pero no interviene en el flujo. No se construye
sincronización firmada con HMAC.

Reglas de vigencia:

- `final_contrato` es **`DATE` puro** (sin hora ni zona). Un contrato está
  vencido solo cuando la fecha UTC del servidor es **≥ 2 días** posterior.
  **Una sola función** decide esto, usada desde login, panel, cron y SQL.
- **OnHold con extensión automática**: al reactivar, `final_contrato` se
  extiende por los días pausados, con registro en historial.
- **Cascada de inactivación sincronizada**: persona + registro académico +
  credenciales, en una transacción.

## Punto de contacto futuro con LGS

El egreso **Youngster → LGS Adultos** genera un registro de egreso
exportable (manual en v1). Solo se construirá API si el volumen lo justifica.
