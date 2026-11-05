import { queryRows } from "@/platform/db/query";

/**
 * Guías (rol `guia`) con su cuenta y su ficha, para que LGS los refleje: LGS
 * replica usuario, clave (hash argon2id, nunca la clave en claro), estado y
 * ficha. KIDS es la fuente; LGS no los modifica.
 */
export interface GuiaLgsRow {
  guiaUserId: string;
  username: string;
  emailCuenta: string | null;
  estado: "ACTIVO" | "INACTIVO" | "BLOQUEADO";
  passwordHash: string;
  debeCambiarPassword: boolean;
  nombres: string | null;
  apellidos: string | null;
  docNumero: string | null;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  domicilio: string | null;
  fechaNacimiento: string | null;
  zoomUrl: string | null;
  fotoFileId: string | null;
  actualizadoEn: string;
}

/** `usuario` = username o correo (sin distinguir mayúsculas); vacío = todos. */
export async function listarGuiasLgs(usuario: string | null): Promise<GuiaLgsRow[]> {
  const params: unknown[] = [];
  let filtro = "";
  if (usuario) {
    params.push(usuario.trim().toLowerCase());
    filtro = `AND (LOWER(u.username) = $1 OR LOWER(TRIM(u.email)) = $1 OR LOWER(TRIM(g.email)) = $1)`;
  }
  return queryRows<GuiaLgsRow>(
    `SELECT DISTINCT ON (u.id)
            u.id AS "guiaUserId", u.username, u.email AS "emailCuenta", u.estado::text AS estado,
            u.password_hash AS "passwordHash", u.debe_cambiar_password AS "debeCambiarPassword",
            g.nombres, g.apellidos, g.doc_numero AS "docNumero", g.email, g.telefono,
            TRIM(g.pais) AS pais, g.domicilio, g.fecha_nacimiento::text AS "fechaNacimiento",
            g.zoom_url AS "zoomUrl", g.foto_file_id AS "fotoFileId",
            GREATEST(u.updated_at, COALESCE(g.actualizado_en, u.updated_at))::text AS "actualizadoEn"
       FROM identity_user u
       JOIN access_user_role ur ON ur.user_id = u.id
       JOIN access_role r ON r.id = ur.role_id AND r.code = 'guia'
       LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
      WHERE true ${filtro}
      ORDER BY u.id`,
    params,
  );
}
