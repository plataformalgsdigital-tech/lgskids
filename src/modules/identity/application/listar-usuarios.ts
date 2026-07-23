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
  limit?: number;
}): Promise<UsuarioListItem[]> {
  const values: unknown[] = [];
  let where = "";
  if (params.buscar !== undefined && params.buscar !== "") {
    values.push(`%${params.buscar}%`);
    where = `WHERE u.username ILIKE $1 OR u.email ILIKE $1 OR p.nombres ILIKE $1 OR p.apellidos ILIKE $1`;
  }
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
