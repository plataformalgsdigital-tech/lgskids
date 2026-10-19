-- "Sin disponibilidad de Welcome: consultaré a Servicio" (2026-10-19).
-- Si al crear su perfil no hay NINGÚN Welcome con cupo para el niño, puede
-- terminarlo sin agendar marcando esa casilla. La marca queda en el enlace que
-- usó, y Servicio › Welcome › Pendientes de agendar lo muestra con su motivo
-- (SIN_DISPONIBILIDAD) para agendárselo.
ALTER TABLE "contracts_enlace_perfil"
  ADD COLUMN "sin_welcome_disponible" BOOLEAN NOT NULL DEFAULT false;
