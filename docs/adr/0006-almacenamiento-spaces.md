# ADR-0006 — Almacenamiento en DigitalOcean Spaces vía StoragePort; privado por defecto

**Estado:** Aceptado · 2026-07-22

## Decisión

- Nada se guarda en el disco del contenedor. `modules/files/application`
  define un **`StoragePort`** con dos adaptadores: **Spaces** (producción) y
  **local** (desarrollo, carpeta `.storage/` ignorada por Git).
- Soporta: carga por URL prefirmada · descarga por URL temporal · validación
  de tipo MIME y tamaño · nombres internos no predecibles · metadatos en
  PostgreSQL (`files_object`) · eliminación controlada.
- **Todo archivo es PRIVADO por defecto.** Materiales y contratos llevan
  datos de menores: ningún objeto ni carpeta con acceso "cualquiera con el
  enlace". (Pendiente en Mosaico; aquí es requisito de la primera versión.)

## Consecuencias

- Compartir un archivo siempre pasa por una URL temporal firmada emitida por
  el servidor tras verificar autorización.
