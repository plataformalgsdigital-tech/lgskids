import { ValidationError } from "@/platform/errors";

/**
 * Reglas del explorador de la base: qué se puede mirar, qué se puede escribir
 * y qué no se muestra NUNCA.
 *
 * Es la parte que no toca la base: pura, probada y en un solo lugar, porque de
 * ella depende que una pantalla de administración no se convierta en una fuga
 * de credenciales ni en una forma de romper los invariantes del sistema.
 */

/**
 * Un identificador de PostgreSQL tal como los escribe este proyecto. No es la
 * única defensa —todo nombre se coteja además contra `information_schema`—,
 * pero sí la primera: los identificadores NO pueden ir parametrizados, así que
 * se validan antes de entrar entre comillas dobles.
 */
const IDENTIFICADOR = /^[a-z_][a-z0-9_]{0,62}$/;

export function identificadorValido(nombre: string): boolean {
  return IDENTIFICADOR.test(nombre);
}

/** Comillas dobles para el SQL. Lanza si el nombre no pasó la validación. */
export function citar(nombre: string): string {
  if (!identificadorValido(nombre)) {
    throw new ValidationError(`Nombre inválido: ${nombre}.`);
  }
  return `"${nombre}"`;
}

/**
 * Columnas que NO se leen ni se escriben desde aquí, por (tabla, columna).
 *
 * Son las credenciales: el hash de la clave permite atacarla sin conexión y la
 * copia cifrada es la bóveda entera; los tokens abren sesión o consumen una
 * invitación. Un visor de tablas que las muestre convierte "mirar la base" en
 * "llevarse las llaves", así que no se seleccionan siquiera — se devuelven
 * como `•••` y no se pueden editar.
 */
const CREDENCIALES: Record<string, readonly string[]> = {
  identity_user: ["password_hash", "password_cifrada"],
  identity_refresh_token: ["token_hash"],
  scheduling_guia_invitacion: ["token_hash"],
};

/** Por si aparece una columna nueva con pinta de secreto y nadie actualiza esto. */
const PINTA_DE_SECRETO = /(password|contrasena|secret|token|_hash$|cifrad)/i;

export const MASCARA = "•••";

export function esColumnaOculta(tabla: string, columna: string): boolean {
  if ((CREDENCIALES[tabla] ?? []).includes(columna)) return true;
  return PINTA_DE_SECRETO.test(columna);
}

/**
 * Tablas cuyo contenido se DERIVA de otra cosa o es la evidencia de lo que
 * pasó. Se pueden escribir —el negocio lo pidió— pero solo confirmando, porque
 * un arreglo a mano aquí no avisa de lo que rompe:
 *
 *  - progresión y premios se re-derivan de las evaluaciones (regla 4): editar
 *    una medalla a mano dura hasta el siguiente recálculo;
 *  - asistencia e intentos son los DISPARADORES de esa derivación: cambiarlos
 *    por SQL no dispara nada;
 *  - matrícula nace en un solo lugar transaccional con el cupo tomado (regla
 *    5): insertar una a mano puede pasarse del cupo del salón;
 *  - `audit_log` es la prueba de quién hizo qué, y `_prisma_migrations` es lo
 *    que decide si un despliegue corre: tocarlas no es corregir un dato.
 */
export const TABLAS_SENSIBLES: readonly string[] = [
  "progression_award",
  "progression_level_progress",
  "attendance_attendance",
  "assessment_attempt",
  "enrollment_enrollment",
  "reporting_guia_mes",
  "audit_log",
  "_prisma_migrations",
];

export function esTablaSensible(tabla: string): boolean {
  return TABLAS_SENSIBLES.includes(tabla);
}

/** Por qué esta tabla pide confirmación. Se muestra tal cual en la pantalla. */
export function motivoSensible(tabla: string): string | null {
  switch (tabla) {
    case "progression_award":
    case "progression_level_progress":
      return "El avance y las medallas se DERIVAN de las evaluaciones: lo que cambies aquí dura hasta el siguiente recálculo.";
    case "attendance_attendance":
    case "assessment_attempt":
      return "Estas filas son las que disparan el recálculo del avance. Cambiarlas por SQL no lo dispara: el progreso puede quedar desfasado.";
    case "enrollment_enrollment":
      return "La matrícula nace en un solo lugar, tomando el cupo del salón. Insertarla a mano puede pasarse del cupo.";
    case "reporting_guia_mes":
      return "Es la estadística congelada del guía; se vuelve a calcular desde las sesiones.";
    case "audit_log":
      return "Es la prueba de quién hizo qué. Editarla borra el rastro, incluido el de este cambio.";
    case "_prisma_migrations":
      return "Es lo que decide qué migraciones corren en el próximo despliegue. Tocarla puede dejar la base a medio migrar.";
    default:
      return esTablaSensible(tabla) ? "Tabla sensible: confirma antes de escribir." : null;
  }
}

/** Página de resultados: ni una fila suelta ni la tabla entera en memoria. */
export const TAMANO_PAGINA_MAXIMO = 200;
export const TAMANO_PAGINA_DEFECTO = 50;
/** Tope del CSV: es un export operativo, no un respaldo de la base. */
export const FILAS_EXPORT_MAXIMO = 20_000;
/** Borrado en lote: un error de selección no debe vaciar media tabla. */
export const FILAS_BORRADO_MAXIMO = 100;

export function tamanoPagina(pedido: number | undefined): number {
  if (pedido === undefined || !Number.isFinite(pedido)) return TAMANO_PAGINA_DEFECTO;
  return Math.min(Math.max(Math.trunc(pedido), 1), TAMANO_PAGINA_MAXIMO);
}
