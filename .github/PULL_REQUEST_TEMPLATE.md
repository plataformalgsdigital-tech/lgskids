# Descripción

<!-- Qué cambia y por qué. Referencia la fase o el módulo. -->

## Tipo de cambio

- [ ] Funcionalidad nueva
- [ ] Corrección
- [ ] Cambio de esquema (incluye migración y su comando)
- [ ] Documentación / ADR
- [ ] Infraestructura / CI

## Lista de verificación

- [ ] `pnpm verify` pasa completo (lint, tipos, pruebas, arquitectura, build)
- [ ] Sin secretos, certificados ni datos reales de alumnos
- [ ] Migraciones revisadas (si aplica) — nunca `prisma db push` a producción
- [ ] Documentación del módulo / CLAUDE.md actualizados si cambió el comportamiento
- [ ] Operaciones multi-tabla dentro de transacción
- [ ] Endpoints nuevos con autorización en el servidor
