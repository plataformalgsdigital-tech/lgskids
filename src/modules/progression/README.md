# Módulo `progression`

Avance de nivel: LA función central (4 lecciones dictadas + Level Up aprobado → promueve automático), medallas por nivel, diploma final. Invocada desde TODOS los caminos que registran asistencia o califican.

## Estructura

- `domain/` — Entidades, objetos de valor, reglas puras, eventos de dominio.
- `application/` — Casos de uso, comandos, consultas, DTOs, PUERTOS (interfaces).
- `infrastructure/` — Repositorios, adaptadores, acceso a datos. Único lugar que escribe las tablas de este módulo.
- `api/` — Handlers HTTP y validación de entrada (Zod).
- `ui/` — Componentes y hooks propios del módulo.
- `index.ts` — API pública: lo único importable desde fuera.
- `tests/` — Pruebas del módulo.
