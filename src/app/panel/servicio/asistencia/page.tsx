import { ConsultaAsistencia } from "./ConsultaAsistencia";

/** Servicio › Asistencia: quién no asistió (por defecto, ayer). */
export default function ServicioAsistenciaPage() {
  return <ConsultaAsistencia modo="asistencia" />;
}
