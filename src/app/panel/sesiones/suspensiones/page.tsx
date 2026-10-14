import { EnConstruccion } from "@/ui/EnConstruccion";

export default function SuspensionesPage() {
  return (
    <EnConstruccion
      titulo="Suspensiones"
      descripcion="Suspender una sesión con motivo y regenerar el salón. Mientras tanto, se hace desde el calendario: abre la sesión y usa “Suspender este día”."
      volver={{ href: "/panel/sesiones", etiqueta: "Volver a Sesiones" }}
    />
  );
}
