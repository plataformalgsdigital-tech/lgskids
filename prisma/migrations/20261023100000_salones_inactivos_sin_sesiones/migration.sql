-- Un salón INACTIVO y sin niños no tiene clases agendadas (2026-10-23). Desde
-- ahora desactivarlo quita sus sesiones futuras (`editarSalon`); esto limpia los
-- que ya estaban inactivos con su calendario lleno (11 de OCTUBRE2026). Misma
-- regla que `quitarSesionesFuturasDeHorario`: solo sesiones del HORARIO, futuras,
-- sin cerrar, sin asistencia y sin un niño de otro salón agendado.
DELETE FROM "scheduling_session" s
 USING "scheduling_classroom" cl
 WHERE cl."id" = s."classroom_id"
   AND NOT cl."activo"
   AND NOT EXISTS (SELECT 1 FROM "enrollment_enrollment" e
                    WHERE e."classroom_id" = cl."id" AND e."estado" IN ('ACTIVA', 'RESERVADA'))
   AND s."slot_id" IS NOT NULL
   AND s."starts_at" > now()
   AND s."cerrada_en" IS NULL
   AND NOT EXISTS (SELECT 1 FROM "attendance_attendance" a WHERE a."session_id" = s."id")
   AND NOT EXISTS (SELECT 1 FROM "scheduling_agendado" g
                    WHERE g."classroom_id" = s."classroom_id" AND g."starts_at" = s."starts_at"
                      AND g."estado" = 'ACTIVA');
