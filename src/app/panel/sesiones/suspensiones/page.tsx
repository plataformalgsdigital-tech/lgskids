import { EnConstruccion } from "@/ui/EnConstruccion";
import { ConOpcion } from "@/ui/ConOpcion";

function SuspensionesPageContenido() {
  return (
    <EnConstruccion
      titulo="Suspensiones"
      descripcion="Suspender una sesión con motivo y regenerar el salón. Mientras tanto, se hace desde el calendario: abre la sesión y usa “Suspender este día”."
      volver={{ href: "/panel/sesiones", etiqueta: "Volver a Sesiones" }}
    />
  );
}

/** La página es una opción de Roles: sin ella, "No tienes acceso". */
export default function SuspensionesPage() {
  return (
    <ConOpcion op="op.sesiones.suspensiones" volver="/panel/sesiones">
      <SuspensionesPageContenido />
    </ConOpcion>
  );
}
