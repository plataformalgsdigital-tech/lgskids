-- AlterEnum
-- Estado nuevo: la matrícula RESERVADA retiene cupo pero el alumno NO está
-- activo (queda a la espera de la aprobación del contrato). Va SOLA en su
-- propia migración: Postgres no permite usar un valor de enum recién agregado
-- en la misma transacción que lo crea.
ALTER TYPE "enrollment_estado" ADD VALUE 'RESERVADA';
