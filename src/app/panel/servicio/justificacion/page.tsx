import { ConsultaAsistencia } from "../asistencia/ConsultaAsistencia";

/** Servicio › Justificación falta: las faltas de la última semana, para justificarlas. */
export default function ServicioJustificacionPage() {
  return <ConsultaAsistencia modo="justificacion" />;
}
