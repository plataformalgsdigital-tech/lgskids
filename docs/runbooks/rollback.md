# Runbook — Rollback de despliegue

> Se completa en la Fase 11 con los identificadores reales de App Platform.

## Principios

- Las migraciones corren como paso previo al despliegue y deben ser
  **compatibles hacia atrás** al menos una versión (expand → migrate →
  contract): así el rollback de código no exige rollback de esquema.
- Nunca `push --force` a `main`; el rollback es un despliegue de la versión
  anterior, no una reescritura de historia.

## Procedimiento

1. Identificar el despliegue anterior estable en App Platform.
2. Redeploy de ese despliegue (web y worker juntos, siempre).
3. Si la migración nueva es incompatible: ejecutar su script de reversa
   (cada migración de riesgo incluye uno en `scripts/`).
4. Verificar `/health/ready` y los flujos críticos (login, panel, asistencia).
5. Registrar el incidente y su causa en `docs/runbooks/incidentes/`.
