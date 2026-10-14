import { EnConstruccion } from "@/ui/EnConstruccion";

export default function FeriadosPage() {
  return (
    <EnConstruccion
      titulo="Feriados"
      descripcion="Calendario de feriados por país y los extra curados que solo suman. Hoy los feriados ya se aplican solos al generar las sesiones de cada salón."
      volver={{ href: "/panel/sesiones", etiqueta: "Volver a Sesiones" }}
    />
  );
}
