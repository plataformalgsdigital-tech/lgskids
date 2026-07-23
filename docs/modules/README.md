# Documentación por módulo

Un documento por módulo, creado en la fase que lo implementa. El README
dentro de cada `src/modules/<m>/` describe su responsabilidad; aquí va la
documentación extensa (decisiones, consultas SQL crudas justificadas,
diagramas de flujo).

| Módulo        | Fase | Documento                                                                                                                                     |
| ------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| identity      | 3 ✅ | [src/modules/identity/README.md](../../src/modules/identity/README.md) — sesiones JWT + refresh rotativo con familias, rate limiting en tabla |
| access        | 3 ✅ | [src/modules/access/README.md](../../src/modules/access/README.md) — RBAC, alcance por país, caché lectura 60 s                               |
| audit         | 3 ✅ | [src/modules/audit/README.md](../../src/modules/audit/README.md) — registrar/listar; nunca rompe la operación principal                       |
| catalog       | 4 ✅ | [src/modules/catalog/README.md](../../src/modules/catalog/README.md) — campaña genera todo transaccionalmente; estado derivado por fecha      |
| people        | 5    | _pendiente_                                                                                                                                   |
| contracts     | 5    | _pendiente_                                                                                                                                   |
| scheduling    | 6    | _pendiente_                                                                                                                                   |
| enrollment    | 7    | _pendiente_                                                                                                                                   |
| attendance    | 8    | _pendiente_                                                                                                                                   |
| assessment    | 8    | _pendiente_                                                                                                                                   |
| progression   | 9    | _pendiente_                                                                                                                                   |
| reporting     | 10   | _pendiente_                                                                                                                                   |
| notifications | 10   | _pendiente_                                                                                                                                   |
| files         | 10   | _pendiente_                                                                                                                                   |
