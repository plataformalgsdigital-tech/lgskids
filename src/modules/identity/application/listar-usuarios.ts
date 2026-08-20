import { queryRows } from "@/platform/db/query";

export interface UsuarioListItem {
  id: string;
  username: string;
  email: string | null;
  estado: string;
  ultimoLoginEn: Date | null;
  persona: string | null;
  roles: { rol: string; pais: string | null }[];
}

/** Lista de usuarios con sus roles (gestión de usuarios del panel). */
export async function listarUsuarios(params: {
  buscar?: string;
  rol?: string;
  limit?: number;
}): Promise<UsuarioListItem[]> {
  const values: unknown[] = [];
  const condiciones: string[] = [];
  if (params.buscar !== undefined && params.buscar !== "") {
    values.push(`%${params.buscar}%`);
    const n = values.length;
    condiciones.push(
      `(u.username ILIKE $${n} OR u.email ILIKE $${n} OR p.nombres ILIKE $${n} OR p.apellidos ILIKE $${n})`,
    );
  }
  if (params.rol !== undefined && params.rol !== "") {
    values.push(params.rol);
    condiciones.push(
      `EXISTS (SELECT 1 FROM access_user_role ur
                 JOIN access_role r ON r.id = ur.role_id
                WHERE ur.user_id = u.id AND r.code = $${values.length})`,
    );
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";
  values.push(Math.min(params.limit ?? 100, 200));

  interface Row extends Omit<UsuarioListItem, "roles"> {
    roles: { rol: string; pais: string | null }[] | null;
  }
  const rows = await queryRows<Row>(
    `SELECT u.id, u.username, u.email, u.estado::text AS estado,
            u.ultimo_login_en AS "ultimoLoginEn",
            p.nombres || ' ' || p.apellidos AS persona,
            (SELECT json_agg(json_build_object('rol', r.code, 'pais', ur.country_code))
               FROM access_user_role ur
               JOIN access_role r ON r.id = ur.role_id
              WHERE ur.user_id = u.id) AS roles
       FROM identity_user u
       LEFT JOIN people_person p ON p.user_id = u.id
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
