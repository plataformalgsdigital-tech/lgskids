import { AppError } from "@/platform/errors";

/** 503 — La línea de WhatsApp está caída: no se intenta enviar, se explica la causa. */
export class LineaWhatsAppCaidaError extends AppError {
  override readonly status = 503;
  override readonly code = "LINEA_WHATSAPP_CAIDA";
}
