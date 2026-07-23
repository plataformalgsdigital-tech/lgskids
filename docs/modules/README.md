# Documentación por módulo

Un documento por módulo, creado en la fase que lo implementa. El README
dentro de cada `src/modules/<m>/` describe su responsabilidad; aquí va la
documentación extensa (decisiones, consultas SQL crudas justificadas,
diagramas de flujo).

| Módulo        | Fase  | Documento                                                                                                                                        |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| identity      | 3 ✅  | [src/modules/identity/README.md](../../src/modules/identity/README.md) — sesiones JWT + refresh rotativo con familias, rate limiting en tabla    |
| access        | 3 ✅  | [src/modules/access/README.md](../../src/modules/access/README.md) — RBAC, alcance por país, caché lectura 60 s                                  |
| audit         | 3 ✅  | [src/modules/audit/README.md](../../src/modules/audit/README.md) — registrar/listar; nunca rompe la operación principal                          |
| catalog       | 4 ✅  | [src/modules/catalog/README.md](../../src/modules/catalog/README.md) — campaña genera todo transaccionalmente; estado derivado por fecha         |
| people        | 5 ✅  | [src/modules/people/README.md](../../src/modules/people/README.md) — doc único; niño+apoderado transaccional; alcance por país en listados       |
| contracts     | 5 ✅  | [src/modules/contracts/README.md](../../src/modules/contracts/README.md) — vigencia UNA función; alta única al aprobar; OnHold extiende; cascada |
| scheduling    | 6 ✅  | [src/modules/scheduling/README.md](../../src/modules/scheduling/README.md) — generación nominal determinística; feriados por código; corrimiento |
| enrollment    | 7 ✅  | [src/modules/enrollment/README.md](../../src/modules/enrollment/README.md) — roster derivado; matricularTx único; cupo con FOR UPDATE            |
| attendance    | 8 ✅  | [src/modules/attendance/README.md](../../src/modules/attendance/README.md) — upsert por sesión+niño; aviso feriado del país del niño             |
| assessment    | 8 ✅  | [src/modules/assessment/README.md](../../src/modules/assessment/README.md) — intentos con umbral 70 provisional; valida matrícula                |
| progression   | 9 ✅  | [src/modules/progression/README.md](../../src/modules/progression/README.md) — LA función central: derivada, idempotente, recuperable; 3 caminos |
| reporting     | 10 ✅ | AT TIME ZONE en SQL; asistencia/ocupación/contratos                                                                                              |
| notifications | 10 ✅ | outbox + reintentos; WhatsApp Cloud listo para credenciales                                                                                      |
| files         | 10 ✅ | StoragePort privado por defecto; local ahora, Spaces en F11                                                                                      |
