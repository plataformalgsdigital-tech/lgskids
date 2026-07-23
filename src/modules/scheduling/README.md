# Módulo `scheduling`

Salón (horario recurrente, guía, cupo, enlace, zona operativa y calendario de feriados configurables por salón), generación de sesiones, feriados por país, suspensiones persistidas en tabla. finalCurso NUNCA se reescribe.

## Estructura

- `domain/` — Entidades, objetos de valor, reglas puras, eventos de dominio.
- `application/` — Casos de uso, comandos, consultas, DTOs, PUERTOS (interfaces).
- `infrastructure/` — Repositorios, adaptadores, acceso a datos. Único lugar que escribe las tablas de este módulo.
- `api/` — Handlers HTTP y validación de entrada (Zod).
- `ui/` — Componentes y hooks propios del módulo.
- `index.ts` — API pública: lo único importable desde fuera.
- `tests/` — Pruebas del módulo.
