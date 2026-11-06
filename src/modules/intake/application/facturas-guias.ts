import { descargarArchivo, subirArchivo } from "@/modules/files";
import { ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import {
  actualizarEstadoFactura,
  facturaPorId,
  facturasDeGuia,
  facturasEnviando,
  registrarFactura,
  type FacturaGuiaRow,
} from "../infrastructure/facturas-guias-repository";
import {
  avisarFacturaALgs,
  liquidacionGuiaEnLgs,
  type LiquidacionGuiaLgs,
} from "../infrastructure/lgs-liquidacion-client";

/**
 * Horas y facturas del guía. LGS calcula las horas (mismas reglas que los advisors) y
 * paga; el guía SUBE AQUÍ su factura de cada corte y LGS la toma desde KIDS. LGS devuelve
 * cada cambio de estado (recibida, devuelta, aceptada, pagada) y el guía lo ve aquí.
 */

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;
const CORTES = new Set(["MES", "Q1", "Q2"]);
const POLITICA_FACTURA = {
  mimes: new Map([
    ["application/pdf", "pdf"],
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ]),
  tamanoMaximo: 10 * 1024 * 1024,
};
/** Estados de corte en LGS en los que el guía puede subir (o reemplazar) su factura. */
const SUBIBLE = new Set(["ABIERTO", "FACTURA_RECIBIDA", "DEVUELTA"]);

export type FacturaGuia = Omit<FacturaGuiaRow, "fileId">;

/** La factura sin el id interno del archivo (no sale de KIDS). */
function publica(f: FacturaGuiaRow): FacturaGuia {
  const copia: Partial<FacturaGuiaRow> = { ...f };
  delete copia.fileId;
  return copia as FacturaGuia;
}

export async function misHorasGuia(
  guiaUserId: string,
  periodo: string,
): Promise<{ liquidacion: LiquidacionGuiaLgs; facturas: FacturaGuia[] }> {
  if (!PERIODO.test(periodo)) throw new ValidationError("Periodo inválido (AAAA-MM).");
  const [liquidacion, filas] = await Promise.all([
    liquidacionGuiaEnLgs(guiaUserId, periodo),
    facturasDeGuia(guiaUserId, periodo),
  ]);
  return { liquidacion, facturas: filas.map(publica) };
}

export async function subirFacturaGuia(input: {
  guiaUserId: string;
  periodo: string;
  corte: string;
  nombre: string;
  mime: string;
  bytes: Buffer;
}): Promise<{ id: string; factura: FacturaGuia | null }> {
  if (!PERIODO.test(input.periodo)) throw new ValidationError("Periodo inválido (AAAA-MM).");
  if (!CORTES.has(input.corte)) throw new ValidationError("Corte inválido.");
  // La regla de plazo y de corte cerrado la tiene LGS: se consulta antes de guardar.
  const liq = await liquidacionGuiaEnLgs(input.guiaUserId, input.periodo);
  if (!liq.registrada) {
    throw new ValidationError(
      "Aún no estás registrado en la liquidación de LGS. Intenta de nuevo en unos minutos.",
    );
  }
  const corte = liq.cortes.find((c) => c.corte === input.corte);
  if (corte === undefined || !corte.requiereFactura) {
    throw new ValidationError("Ese corte no requiere factura (sin horas).");
  }
  if (!SUBIBLE.has(corte.estado)) {
    throw new ForbiddenError(
      corte.estado === "SIN_FACTURA"
        ? `Venció el plazo para subir la factura (${corte.plazoReenvio ?? corte.plazo}). Comunícate con Administración.`
        : "Este corte ya fue verificado: la factura no se puede reemplazar.",
    );
  }
  const archivo = await subirArchivo({
    actorUserId: input.guiaUserId,
    nombreOriginal: input.nombre.slice(0, 200) || "factura",
    mime: input.mime,
    bytes: input.bytes,
    entidad: "liquidacion_factura_guia",
    entidadId: input.guiaUserId,
    politica: POLITICA_FACTURA,
  });
  const id = await registrarFactura({
    guiaUserId: input.guiaUserId,
    periodo: input.periodo,
    corte: input.corte,
    fileId: archivo.id,
    nombre: input.nombre.slice(0, 200) || "factura",
    mime: input.mime,
  });
  // LGS la toma ya (y nos informa el estado); si no responde, la recoge su cron.
  await avisarFacturaALgs(id);
  const fila = await facturaPorId(id);
  if (fila === null) return { id, factura: null };
  return { id, factura: publica(fila) };
}

/** Archivo de una factura del propio guía. */
export async function archivoFacturaPropia(guiaUserId: string, id: string) {
  const f = await facturaPorId(id);
  if (f === null || f.guiaUserId !== guiaUserId) throw new NotFoundError("Factura no encontrada.");
  return descargarArchivo(f.fileId);
}

// ── Lado LGS (clave de servicio) ─────────────────────────────────────────────

export async function facturasPendientesLgs(): Promise<{ facturas: FacturaGuia[] }> {
  const filas = await facturasEnviando();
  return { facturas: filas.map(publica) };
}

export async function archivoFacturaLgs(id: string) {
  const f = await facturaPorId(id);
  if (f === null) throw new NotFoundError("Factura no encontrada.");
  return descargarArchivo(f.fileId);
}

const ESTADOS_LGS = new Set(["RECIBIDA", "DEVUELTA", "RECHAZADA", "ACEPTADA", "PAGADA"]);

export async function estadoFacturaDesdeLgs(
  id: string,
  cuerpo: {
    estado: string;
    motivo?: string | null | undefined;
    lgsFacturaId?: string | null | undefined;
  },
): Promise<{ ok: boolean }> {
  if (!ESTADOS_LGS.has(cuerpo.estado)) throw new ValidationError("Estado de factura inválido.");
  const ok = await actualizarEstadoFactura(
    id,
    cuerpo.estado,
    cuerpo.motivo?.slice(0, 1000) ?? null,
    cuerpo.lgsFacturaId ?? null,
  );
  return { ok };
}
