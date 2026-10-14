import { notFound } from "next/navigation";
import { EnConstruccion } from "@/ui/EnConstruccion";

/**
 * Opciones de Servicio que todavía no tienen pantalla. "Usuarios sin perfil
 * creado" tiene la suya (`sin-perfil/`), que gana a esta ruta por ser estática.
 * Cuando una de estas se construya, se le hace su carpeta y se saca de aquí.
 */
const OPCIONES: Record<string, { titulo: string; descripcion: string }> = {
  welcome: {
    titulo: "Welcome",
    descripcion:
      "Los Welcome programados y los niños agendados en cada uno, para hacerles seguimiento.",
  },
  sesiones: {
    titulo: "Sesiones",
    descripcion:
      "Lista de sesiones para atender a las familias: quién asistió y qué quedó pendiente.",
  },
  "casos-atencion": {
    titulo: "Casos de atención",
    descripcion: "Casos reportados por guías y familias, con su seguimiento hasta cerrarlos.",
  },
  reactivados: {
    titulo: "Reactivados",
    descripcion: "Niños que vuelven tras una pausa o un vencimiento y necesitan salón.",
  },
};

export default async function OpcionServicioPage({
  params,
}: {
  params: Promise<{ opcion: string }>;
}) {
  const { opcion } = await params;
  const datos = OPCIONES[opcion];
  if (datos === undefined) notFound();
  return <EnConstruccion titulo={datos.titulo} descripcion={datos.descripcion} />;
}
