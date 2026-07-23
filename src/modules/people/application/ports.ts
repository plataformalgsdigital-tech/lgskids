/** Tipos del módulo people. Fechas DATE como YYYY-MM-DD. */

export type PersonEstado = "ACTIVA" | "INACTIVA";

export interface PersonRecord {
  id: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string | null;
  docTipo: string;
  docNumero: string;
  countryCode: string;
  email: string | null;
  telefono: string | null;
  estado: PersonEstado;
  userId: string | null;
}

export interface PersonInput {
  nombres: string;
  apellidos: string;
  fechaNacimiento?: string | null | undefined;
  docTipo: string;
  docNumero: string;
  countryCode: string;
  email?: string | null | undefined;
  telefono?: string | null | undefined;
}

export interface PersonListItem extends PersonRecord {
  /** Apoderados del niño (vacío si no es niño). */
  apoderados: { id: string; nombres: string; apellidos: string }[];
  /** Username del alumno si tiene credenciales. */
  username: string | null;
}
