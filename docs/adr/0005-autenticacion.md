# ADR-0005 — Autenticación: JWT corto + refresh rotativo; login por username

**Estado:** Aceptado · 2026-07-22

## Decisión

- **Access token JWT de corta duración** + **refresh token rotativo** en
  cookie `HttpOnly` / `Secure` / `SameSite`. Revocación y cierre de sesiones
  persistidos en base (nada de estado en memoria — trampa 2.8.5).
- **El login es por USERNAME, no por correo.** El username se autogenera al
  matricular al niño en curso y salón (decisión funcional 2026-07-22).
- **Correo sintético interno** (`<username>@alumnos.lgskidsplataforma.com`,
  subdominio no enrutable) cuando el niño no tiene correo propio — hermanos
  que comparten el correo del papá no pueden colisionar. Las comunicaciones
  reales van al apoderado (WhatsApp y su correo verdadero, que puede
  repetirse entre hermanos porque no es llave de ninguna cuenta).
- Hash de contraseñas con algoritmo moderno (argon2id).
- **La autorización se verifica en el servidor, endpoint por endpoint**
  (`handlerWithAuth`). Los guardas de interfaz son cosmética. En LGS un
  endpoint público permitía cambiar la contraseña de cualquier cuenta.
- Rate limiting en autenticación y endpoints de envío.

## Consecuencias

- La cascada de inactivación (persona + registro académico + credenciales)
  debe ser transaccional; si solo se actualiza una tabla quedan niños que
  entran con contrato vencido.
