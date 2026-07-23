# ADR-0009 — Campaña global; el país vive en el contrato; calendario de feriados por salón

**Estado:** Aceptado · 2026-07-22 (decisión del negocio)

## Contexto

KIDS opera en Chile, Colombia, Ecuador y Perú. Las clases son virtuales: un
salón puede mezclar niños de países distintos, y un niño puede moverse de
campaña conservando su horario.

## Decisión

- La **campaña es GLOBAL** (sin país). Genera contratos en todos los países.
- El **país vive en el contrato y en la persona**. El alcance por país del
  RBAC filtra por ahí.
- Cada **salón** configura su **calendario de feriados** (país base) y su
  zona operativa (ADR-0007). Los feriados de ese calendario corren la sesión
  al final del curso para TODO el salón.
- Un feriado del país del niño que no esté en el calendario del salón **no
  suspende la sesión**: el niño puede faltar con justificación. Esta regla
  está documentada para los Guías en
  `docs/operacion/politica-feriados-asistencia.md`.
- Feriados fijos y Semana Santa **calculados por código** por país (válidos
  en años futuros sin mantenimiento); feriados movibles por decreto en un
  **JSON curado por país que solo suma, nunca anula**.

## Consecuencias

- El cambio académico soporta: cambio de salón, de curso, de campaña
  (conservando horario), Junior→Youngster, y egreso a LGS Adultos.
- Cuatro calculadoras de feriados (CL/CO/EC/PE) con pruebas por año.
