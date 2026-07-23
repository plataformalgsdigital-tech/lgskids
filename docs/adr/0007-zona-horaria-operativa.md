# ADR-0007 — Instantes en UTC; zona operativa por salón; AT TIME ZONE en SQL

**Estado:** Aceptado · 2026-07-22

## Contexto

El peor bug de LGS: sesiones guardadas con la zona del navegador y
consultadas con fronteras UTC hacían desaparecer las clases de la tarde-noche
de los reportes mensuales.

## Decisión

1. Todo instante se **guarda en UTC** (`timestamptz`).
2. Cada **salón** tiene su **zona operativa configurable** (default
   `America/Santiago`; también Bogota/Guayaquil/Lima). El horario "martes
   18:00" se interpreta en esa zona (correcto ante horario de verano
   chileno). KIDS opera multi-país: CL, CO, EC, PE.
3. La **interfaz muestra siempre la hora local del usuario**: la misma sesión
   es 6:00 PM en Santiago y 5:00 PM en Bogotá. Con la referencia de la zona
   operativa visible.
4. Los reportes agrupan **en SQL con `AT TIME ZONE`** anclado a la zona
   operativa. Nunca agrupar por fecha en JavaScript con la zona del cliente.
5. Conversión pared-de-reloj ↔ UTC en `platform/time` (basada en `Intl`),
   con pruebas que cubren el horario de verano chileno.

## Notas

- Cuando el desfase CL–CO sea de 2 horas (verano austral), habrá
  procedimientos operativos adicionales que el negocio definirá más adelante
  (decisión funcional 2026-07-22, pendiente de detalle).
