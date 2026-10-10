/**
 * Módulo `notifications` — API PÚBLICA.
 *
 * WhatsApp y correo: credenciales, medallas, diplomas, avisos de suspensión.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {
  encolarNotificacion,
  procesarOutbox,
  notificarPremiosPendientes,
} from "./application/outbox";
export type { NotificationSenderPort, MensajeSaliente, Canal } from "./application/ports";
export { enviarEnlacePerfil } from "./application/mensajes";
export { setSenderForTests } from "./infrastructure/senders";
export {
  plantillasListarHandler,
  plantillaCrearHandler,
  plantillaActualizarHandler,
  destinatariosHandler,
  envioHandler,
  historialHandler,
  credencialesVistaHandler,
  credencialesEnviarHandler,
} from "./api/handlers";
