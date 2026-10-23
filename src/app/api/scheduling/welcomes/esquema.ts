import { z } from "zod";
import {
  CURSOS_WELCOME,
  DURACION_WELCOME_MAX,
  DURACION_WELCOME_MIN,
  LIMITE_WELCOME_MAX,
  NIVELES_WELCOME,
  NIVEL_WELCOME_DEFECTO,
  PAISES_WELCOME,
} from "@/modules/scheduling";

/** Lo que se manda al CREAR y al EDITAR un Welcome: el mismo esquema. */
export const fechaSchema = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Fecha YYYY-MM-DD.");

export const welcomeSchema = z.object({
  fecha: fechaSchema,
  horaLocal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "La hora debe ser HH:MM."),
  // Zona IANA del navegador de quien escribe: el Welcome es un instante.
  zona: z.string().min(1).max(64),
  duracionMin: z.number().int().min(DURACION_WELCOME_MIN).max(DURACION_WELCOME_MAX),
  guiaUserId: z.uuid(),
  // null = todas.
  campaignId: z.uuid().nullable(),
  pais: z.enum(PAISES_WELCOME).nullable(),
  curso: z.enum(CURSOS_WELCOME).nullable(),
  classroomId: z.uuid().nullable(),
  // null = todos los niveles; sin el campo, el de defecto (Rookie).
  nivel: z.enum(NIVELES_WELCOME).nullable().default(NIVEL_WELCOME_DEFECTO),
  limiteUsuarios: z.number().int().min(1).max(LIMITE_WELCOME_MAX),
  observaciones: z.string().max(1000).nullish(),
  // Para niños con el curso ya andando: no exige ser antes del inicio.
  enMarcha: z.boolean().default(false),
});
