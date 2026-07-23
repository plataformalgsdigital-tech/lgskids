# Runbook — Respaldo y restauración

> Se completa en la Fase 11 con los comandos exactos del cluster real.

## Respaldo

- La base administrada de DigitalOcean toma respaldos diarios automáticos
  (retención 7 días) + point-in-time recovery.
- Antes de toda migración de producción: respaldo manual adicional
  (`pg_dump`) etiquetado con la versión que se despliega.

## Restauración

1. Congelar despliegues (pausar CI/CD).
2. Restaurar desde el panel de DigitalOcean (fork del cluster al punto en el
   tiempo) o `pg_restore` del dump manual.
3. Verificar conteos de tablas críticas (contratos, matrículas, sesiones,
   asistencia) contra el último reporte conocido.
4. Reanudar tráfico; comunicar la ventana de datos perdida si la hubo.

## Acceso a la base desde desarrollo

La base administrada filtra por IP (trusted sources) y la IP del entorno
cambia entre sesiones:

```bash
# agregar la IP actual ANTES de correr scripts
doctl databases firewalls append <cluster-id> --rule ip_addr:$(curl -s ifconfig.me)
# ... trabajar ...
# REMOVERLA al terminar (listar y borrar la regla agregada)
doctl databases firewalls list <cluster-id>
doctl databases firewalls remove <cluster-id> --uuid <rule-uuid>
```
