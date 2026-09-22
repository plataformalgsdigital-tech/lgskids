import { queryRows } from "@/platform/db/query";
import { SQL_MOTIVOS_NO_BORRAR } from "./gestion-cuentas";

/**
 * Tipo de usuario, derivado de dónde vive su ficha y de sus roles: el alumno
 * cuelga de una persona, el guía tiene rol `guia`, y el resto con rol es
 * personal ADMINISTRATIVO (admin, coordinador, superadmin o un rol creado en el
 * panel). `otro` = sin rol, o solo apoderado.
 */
export const TIPOS_USUARIO = ["estudiante", "guia", "administrativo", "otro"] as const;
export type TipoUsuario = (typeof TIPOS_USUARIO)[number];

export interface UsuarioListItem {
  id: string;
  username: string;
  email: string | null;
  estado: string;
  ultimoLoginEn: Date | null;
  tipo: TipoUsuario;
  /** Ficha de persona (alumno): ahí se editan sus datos. */
  personaId: string | null;
  /** Nombre de la persona: alumno/apoderado, ficha del guía o ficha del staff. */
  persona: string | null;
  nombres: string | null;
  apellidos: string | null;
  telefono: string | null;
  docNumero: string | null;
  debeCambiarPassword: boolean;
  /** ¿Hay copia en la bóveda? Sin ella, "Ver clave" no tiene qué mostrar. */
  tieneCopiaClave: boolean;
  /** ¿Pidió "olvidé mi clave" y está sin atender? */
  solicitudPendiente: boolean;
  /** Vacío = se puede borrar; si no, por qué hay que inactivarla en su lugar. */
  motivosNoBorrar: string[];
  roles: { rol: string; pais: string | null }[];
}

/**
 * Los datos viven donde vive la ficha de cada tipo de usuario: la cuenta
 * (`identity_user`) solo guarda el acceso. Alumno y apoderado → `people_person`;
 * guía → su ficha `scheduling_guia`; resto del staff → `identity_perfil`.
 */
const ficha = (campo: string) => `COALESCE(p.${campo}, g.${campo}, pf.${campo})`;
const NOMBRE = `COALESCE(p.nombres || ' ' || p.apellidos,
                         g.nombres || ' ' || g.apellidos,
                         pf.nombres || ' ' || pf.apellidos)`;

const tieneRol = (condicion: string) =>
  `EXISTS (SELECT 1 FROM access_user_role ur JOIN access_role r ON r.id = ur.role_id
            WHERE ur.user_id = u.id AND ${condicion})`;

const TIPO = `CASE
    WHEN p.id IS NOT NULL OR ${tieneRol("r.code = 'alumno'")} THEN 'estudiante'
    WHEN ${tieneRol("r.code = 'guia'")} THEN 'guia'
    WHEN ${tieneRol("r.code NOT IN ('alumno', 'guia', 'apoderado')")} THEN 'administrativo'
    ELSE 'otro' END`;

/** Tope de filas por consulta: más que eso se afina con el buscador. */
export const MAX_USUARIOS_LISTA = 500;

/** Lista de usuarios con sus roles (gestión de usuarios del panel). */
export async function listarUsuarios(params: {
  buscar?: string;
  rol?: string;
  tipo?: TipoUsuario;
  estado?: "ACTIVO" | "INACTIVO";
  limit?: number;
}): Promise<UsuarioListItem[]> {
  const values: unknown[] = [];
  const condiciones: string[] = [];
  if (params.buscar !== undefined && params.buscar !== "") {
    values.push(`%${params.buscar}%`);
    const n = values.length;
    condiciones.push(
      `(u.username ILIKE $${n} OR u.email ILIKE $${n} OR ${NOMBRE} ILIKE $${n}
        OR ${ficha("doc_numero")} ILIKE $${n})`,
    );
  }
  if (params.rol !== undefined && params.rol !== "") {
    values.push(params.rol);
    condiciones.push(tieneRol(`r.code = $${values.length}`));
  }
  if (params.tipo !== undefined) {
    values.push(params.tipo);
    condiciones.push(`(${TIPO}) = $${values.length}`);
  }
  if (params.estado !== undefined) {
    values.push(params.estado);
    condiciones.push(`u.estado::text = $${values.length}`);
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";
  values.push(Math.min(params.limit ?? 100, MAX_USUARIOS_LISTA));

  interface Row extends Omit<UsuarioListItem, "roles"> {
    roles: { rol: string; pais: string | null }[] | null;
  }
  const rows = await queryRows<Row>(
    `SELECT u.id, u.username, u.email, u.estado::text AS estado,
            u.ultimo_login_en AS "ultimoLoginEn",
            ${TIPO} AS tipo,
            p.id AS "personaId",
            ${NOMBRE} AS persona,
            ${ficha("nombres")} AS nombres, ${ficha("apellidos")} AS apellidos,
            ${ficha("telefono")} AS telefono, ${ficha("doc_numero")} AS "docNumero",
            u.debe_cambiar_password AS "debeCambiarPassword",
            (u.password_cifrada IS NOT NULL) AS "tieneCopiaClave",
            EXISTS (SELECT 1 FROM identity_solicitud_clave s
                     WHERE s.user_id = u.id AND s.estado = 'PENDIENTE') AS "solicitudPendiente",
            ${SQL_MOTIVOS_NO_BORRAR("u")} AS "motivosNoBorrar",
            (SELECT json_agg(json_build_object('rol', r.code, 'pais', ur.country_code))
               FROM access_user_role ur
               JOIN access_role r ON r.id = ur.role_id
              WHERE ur.user_id = u.id) AS roles
       FROM identity_user u
       LEFT JOIN people_person p ON p.user_id = u.id
       LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
       LEFT JOIN identity_perfil pf ON pf.user_id = u.id
      ${where}
      ORDER BY u.username
      LIMIT $${values.length}`,
    values,
  );
  return rows.map((r) => ({ ...r, roles: r.roles ?? [] }));
}

export interface GuiaListItem {
  id: string;
  nombre: string | null;
  username: string;
}

/** Usuarios con rol `guia`, para el selector de guía del salón. */
export async function listarGuias(): Promise<GuiaListItem[]> {
  const usuarios = await listarUsuarios({ rol: "guia", limit: 200 });
  return usuarios.map((u) => ({ id: u.id, nombre: u.persona, username: u.username }));
}
