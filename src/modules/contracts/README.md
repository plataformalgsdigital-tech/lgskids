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
