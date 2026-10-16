import { EnConstruccion } from "@/ui/EnConstruccion";
import { ConOpcion } from "@/ui/ConOpcion";

function FeriadosPageContenido() {
  return (
    <EnConstruccion
      titulo="Feriados"
      descripcion="Calendario de feriados por país y los extra curados que solo suman. Hoy los feriados ya se aplican solos al generar las sesiones de cada salón."
      volver={{ href: "/panel/sesiones", etiqueta: "Volver a Sesiones" }}
    />
  );
}

/** La página es una opción de Roles: sin ella, "No tienes acceso". */
export default function FeriadosPage() {
  return (
    <ConOpcion op="op.sesiones.feriados" volver="/panel/sesiones">
      <FeriadosPageContenido />
    </ConOpcion>
  );
}
