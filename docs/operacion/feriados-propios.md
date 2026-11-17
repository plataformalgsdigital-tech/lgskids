# Feriados propios — guía para coordinación

> Académica › Sesiones › **Feriados** (`/panel/sesiones/feriados`). Desde 2026-11-18.

## Qué muestra

Los feriados del **mes** (abre en el mes corriente; las flechas ◀ ▶ cambian de mes), cada uno
con la **bandera** de los países que cubre. La etiqueta dice si es **Oficial** (calculado por
el sistema) o **Propio** (lo agregó una persona).

## Agregar un feriado propio

1. **+ Agregar feriado propio**.
2. Elige la **fecha** (futura), escribe el **nombre** (obligatorio) y marca los **países** que
   cubre (uno o varios).
3. **Revisar impacto**: muestra los salones cuyo calendario cambia, qué sesión se quita, cuál
   se agrega al final y cómo queda la última sesión de cada salón.
4. **Confirmar y guardar**.

El feriado es de **esa fecha y ese año**: no se repite el año siguiente.

## Qué pasa con las clases

- Los salones con ese país en su calendario **no dictan ese día**. La sesión **se agrega al
  final** del curso: el total se conserva y las lecciones siguen en orden (la lección que
  tocaba ese día la dicta la siguiente clase, para todos los niños del salón).
- Solo se ajustan las sesiones **futuras**. Lo ya dictado, con asistencia o cerrado, no se toca.
- Los niños de **otro país** que están en esos salones sí podrían tomar clase ese día: quedan
  en **Gestión Festivos**, donde coordinación los pasa a otra clase solo ese día.
- Los niños **del país del feriado** (o de un país que también lo tiene) no necesitan nada.

## Regla del contrato

La última sesión del salón **no puede pasar del final del contrato** de ningún niño con
matrícula activa. Si pasara:

- el feriado se guarda y rige para los demás salones;
- ese salón **no se toca** y queda **pendiente**, con la lista de los niños cuyo contrato vence
  antes y la fecha en que vence;
- coordinación decide (por ejemplo, ampliar esos contratos) y pulsa **Regenerar** en la tarjeta
  "Salones pendientes de ajustar". Regenerar vuelve a comprobar los contratos y solo aplica
  cuando ya no hay conflicto.

La lista de pendientes se **deriva** (calendario que le toca contra el que tiene): no hay
nada que borrar a mano.

## Quitar o corregir

- Solo se quitan los feriados **Propios** y de fecha **futura** (**Quitar** en su fila). Pasa por
  el mismo previo de impacto y devuelve las sesiones: la que se agregó al final desaparece.
- Un feriado oficial no se quita desde aquí.
- Para **cambiar** uno (nombre, países o fecha): quítalo y créalo de nuevo.

## Permisos

- Ver: `op.sesiones.feriados`.
- Crear, quitar y regenerar: `op.sesiones.feriados_crear` (con `salones.gestionar`).
- Un rol con alcance por país solo gestiona feriados de sus países.
