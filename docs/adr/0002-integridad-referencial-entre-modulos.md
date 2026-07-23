# ADR-0002 — Claves foráneas entre tablas de módulos distintos

**Estado:** Aceptado · 2026-07-22

## Contexto

La ortodoxia de "módulos desacoplados" sugiere evitar FK entre módulos para
facilitar una futura extracción. LGS acumuló su deuda real justamente por
empujar la integridad al código de aplicación: registros académicos
duplicados, beneficiarios sin perfil, estados desincronizados.

## Decisión

**SÍ habrá claves foráneas entre módulos** cuando el negocio lo exija
(asistencia → sesión → salón → curso; matrícula → contrato → persona).
PostgreSQL garantiza esa integridad gratis. El límite entre módulos se
defiende con pruebas de arquitectura (ADR-0001), no rompiendo la base.

## Consecuencias

- **Costo asumido:** extraer un módulo a futuro exigirá romper esas FK
  deliberadamente, con migración de datos y verificación de integridad en
  aplicación.
- Cada módulo sigue siendo dueño de la ESCRITURA de sus tablas (solo su capa
  infrastructure las escribe); las FK no cambian eso.
