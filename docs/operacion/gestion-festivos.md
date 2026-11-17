# Gestión Festivos — guía para coordinación

> Académica › Sesiones › **Gestión Festivos** (`/panel/sesiones/gestion-festivos`).
> Desde 2026-11-16. Complementa `politica-feriados-asistencia.md`.

## Para qué sirve

El calendario de feriados es del **salón**. Si el día es feriado en el país del
salón, esa clase **no se dicta y se corre al final del curso**: nadie pierde
clases. Pero el salón puede tener niños de **otro país**, para quienes ese día
**no** es feriado: se quedan sin clase aunque podrían tomarla. Esta pantalla los
muestra con anticipación y permite pasarlos, **solo ese día**, a la clase de otro
salón.

Rige igual para Chile, Colombia, Ecuador y Perú (cualquier par de países).

## A quién afecta y a quién no

Ejemplo: feriado de Colombia, salón con calendario de Colombia, con niños de
Colombia y de Ecuador.

| Niño                                                     | Qué pasa                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| De **Ecuador** (ese día no es feriado)                   | Sale como afectado, con sugerencias y botón de aprobar            |
| De **Colombia**                                          | Está de feriado: no aparece como afectado y no se le agrega clase |
| De Ecuador, **si Ecuador también** tiene feriado ese día | También está de feriado: no se toca                               |

El resto del agendamiento no cambia: el salón, la matrícula y las demás clases del
niño quedan igual, y la lista de los compañeros tampoco se toca.

## Cómo se usa

1. Elige cuántos días mirar (30/60/90/180). Por defecto solo salen los feriados
   que afectan salones.
2. Abre un feriado: ves los salones que no dictan clase (campaña, curso, hora) y,
   por cada uno, cuántos niños son del país del festivo y cuántos de otro.
3. En un niño de otro país, **Ver opciones**: las clases de ese día de su misma
   campaña y curso, ordenadas (libres primero, misma lección, hora más cercana).
   La mejor sale **★ Recomendada**. Cada una dice su lección frente a la que el
   niño habría tenido, el guía, el cupo y si choca con algo suyo.
4. **Elegir otra campaña, curso o salón** (opción solo para quien aprueba) abre las
   clases de ese día de cualquier campaña y curso, con filtros Campaña → Curso →
   Salón. El resumen avisa si el curso no es el del niño o la lección es distinta.
5. **Elegir** → revisar el **resumen** → **Aprobar cambio temporal**. El niño queda
   agendado en esa clase (aparece en su lista y en "Mis próximas clases") y la
   pantalla lo marca como resuelto.

## Qué hay que saber (impacto)

- **Es solo ese día.** No cambia el salón ni la matrícula; su salón retoma esa
  clase al final del curso.
- **La lección puede repetirse o saltarse** si la clase elegida va en otra lección
  que la que le tocaba. La pantalla lo avisa, no lo impide.
- **Otro curso o campaña es una excepción de coordinación**: el contenido y la
  edad pueden no coincidir.
- Las clases **llenas** o que **chocan** con algo del niño se ven marcadas y no se
  pueden elegir; el **sobrecupo** exige su propio permiso
  (`op.kids.agendar_sobrecupo`).
- Queda en la auditoría (`scheduling.nino_agendado`) y en la reserva
  (`scheduling_agendado.motivo`: "Festivo CL 2026-12-08: …").

## Permisos

- **Ver**: `op.sesiones.festivos` (base `salones.gestionar`).
- **Aprobar** y elegir otra campaña/curso/salón: `op.sesiones.festivos_aprobar`
  (base `salones.gestionar` + `matriculas.gestionar`) y, además, `op.kids.agendar`.
- La migración `20261116000000_gestion_festivos` las concede a quien ya tiene las
  bases. El alcance por país del rol acota a los niños que se ven.

## Lo que todavía no hace

- Avisar a la familia por WhatsApp.
- Descartar a un niño ("no se le cambia"): quien no se resuelve sigue como
  pendiente hasta que pase la fecha.
- El caso contrario: un niño de un país con feriado, en un salón de otro
  calendario, que ese día **sí** tiene clase y puede faltar justificado (ver la
  política de feriados).

## Pruebas

`contracts/tests/gestion-festivos-integration.test.ts` (flujo completo),
`…-alcance-integration.test.ts` (a quién toca y qué no cambia) y
`…-paises-integration.test.ts` (los cuatro países y el feriado compartido).
