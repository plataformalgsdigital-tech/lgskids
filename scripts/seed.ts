/**
 * Seed de KIDS2026 — Fase 3. IDEMPOTENTE: se puede correr n veces.
 *
 * Crea: países (CL/CO/EC/PE), roles, permisos, matriz rol→permiso y el
 * usuario admin inicial (SEED_ADMIN_PASSWORD obligatoria; queda forzado a
 * cambiarla al primer ingreso).
 *
 * Uso:  pnpm seed   (requiere DATABASE_URL y la migración aplicada)
 */
import { hash } from "@node-rs/argon2";
import { MATRIZ_ROL_PERMISOS, PERMISOS, ROLES } from "@/modules/access";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { newId } from "@/platform/ids";
import { logger } from "@/platform/logging/logger";

try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env (CI): las variables ya vienen del entorno.
}

const PAISES: { code: string; nombre: string; timezone: string }[] = [
  { code: "CL", nombre: "Chile", timezone: "America/Santiago" },
  { code: "CO", nombre: "Colombia", timezone: "America/Bogota" },
  { code: "EC", nombre: "Ecuador", timezone: "America/Guayaquil" },
  { code: "PE", nombre: "Perú", timezone: "America/Lima" },
];

const NOMBRES_ROL: Record<string, { nombre: string; descripcion: string }> = {
  [ROLES.ADMIN]: { nombre: "Administrador", descripcion: "Acceso total a la plataforma" },
  [ROLES.COORDINADOR]: { nombre: "Coordinador", descripcion: "Gestión académica y de usuarios" },
  [ROLES.GUIA]: { nombre: "Guía", descripcion: "Dicta sesiones y marca asistencia" },
  [ROLES.APODERADO]: { nombre: "Apoderado", descripcion: "Consulta y gestión de sus niños" },
  [ROLES.ALUMNO]: { nombre: "Alumno", descripcion: "Panel del niño" },
};

const NOMBRES_PERMISO: Record<string, string> = {
  [PERMISOS.USUARIOS_GESTIONAR]: "Gestionar usuarios",
  [PERMISOS.ROLES_ASIGNAR]: "Asignar roles",
  [PERMISOS.AUDITORIA_VER]: "Ver auditoría",
  [PERMISOS.CATALOGO_GESTIONAR]: "Gestionar catálogo (campañas, cursos)",
  [PERMISOS.CATALOGO_VER]: "Ver catálogo",
  [PERMISOS.PERSONAS_GESTIONAR]: "Gestionar personas (niños, apoderados)",
  [PERMISOS.PERSONAS_VER]: "Ver personas",
  [PERMISOS.CONTRATOS_GESTIONAR]: "Gestionar contratos",
  [PERMISOS.CONTRATOS_VER]: "Ver contratos",
  [PERMISOS.SALONES_GESTIONAR]: "Gestionar salones y sesiones",
  [PERMISOS.SALONES_VER]: "Ver salones y sesiones",
  [PERMISOS.MATRICULAS_GESTIONAR]: "Gestionar matrículas y cambios académicos",
  [PERMISOS.MATRICULAS_VER]: "Ver matrículas y listas de salón",
  [PERMISOS.ASISTENCIA_GESTIONAR]: "Marcar asistencia",
  [PERMISOS.ASISTENCIA_VER]: "Ver asistencia",
  [PERMISOS.EVALUACIONES_GESTIONAR]: "Registrar cuestionarios",
  [PERMISOS.EVALUACIONES_VER]: "Ver cuestionarios e intentos",
  [PERMISOS.PANEL_ADMINISTRACION]: "Panel de administración",
  [PERMISOS.PANEL_GUIA]: "Panel del guía",
  [PERMISOS.PANEL_APODERADO]: "Panel del apoderado",
  [PERMISOS.PANEL_ALUMNO]: "Panel del alumno",
};

async function main(): Promise<void> {
  const adminUsername = env().SEED_ADMIN_USERNAME.toLowerCase();
  const adminPassword = env().SEED_ADMIN_PASSWORD;
  if (adminPassword === undefined) {
    throw new Error("SEED_ADMIN_PASSWORD es obligatoria (mínimo 10 caracteres). Ver .env.example.");
  }

  await withTransaction(async (tx) => {
    for (const pais of PAISES) {
      await execute(
        `INSERT INTO access_country (code, nombre, timezone, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (code) DO UPDATE SET nombre = $2, timezone = $3, updated_at = now()`,
        [pais.code, pais.nombre, pais.timezone],
        tx,
      );
    }

    for (const [code, info] of Object.entries(NOMBRES_ROL)) {
      await execute(
        `INSERT INTO access_role (id, code, nombre, descripcion, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (code) DO UPDATE SET nombre = $3, descripcion = $4, updated_at = now()`,
        [newId(), code, info.nombre, info.descripcion],
        tx,
      );
    }

    for (const [code, nombre] of Object.entries(NOMBRES_PERMISO)) {
      await execute(
        `INSERT INTO access_permission (id, code, nombre, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (code) DO UPDATE SET nombre = $3, updated_at = now()`,
        [newId(), code, nombre],
        tx,
      );
    }

    for (const [roleCode, permisos] of Object.entries(MATRIZ_ROL_PERMISOS)) {
      for (const permisoCode of permisos) {
        await execute(
          `INSERT INTO access_role_permission (role_id, permission_id)
           SELECT r.id, p.id FROM access_role r, access_permission p
            WHERE r.code = $1 AND p.code = $2
           ON CONFLICT DO NOTHING`,
          [roleCode, permisoCode],
          tx,
        );
      }
    }

    const existente = await queryOne<{ id: string }>(
      `SELECT id FROM identity_user WHERE username = $1`,
      [adminUsername],
      tx,
    );

    let adminId: string;
    if (existente === null) {
      adminId = newId();
      const passwordHash = await hash(adminPassword, {
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });
      await execute(
        `INSERT INTO identity_user (id, username, password_hash, estado, debe_cambiar_password, updated_at)
         VALUES ($1, $2, $3, 'ACTIVO', true, now())`,
        [adminId, adminUsername, passwordHash],
        tx,
      );
      logger.info("Usuario admin creado", { username: adminUsername });
    } else {
      adminId = existente.id;
      logger.info("Usuario admin ya existía; no se toca su contraseña", {
        username: adminUsername,
      });
    }

    await execute(
      `INSERT INTO access_user_role (id, user_id, role_id, country_code)
       SELECT $1, $2, r.id, NULL FROM access_role r
        WHERE r.code = $3
          AND NOT EXISTS (
            SELECT 1 FROM access_user_role ur
             WHERE ur.user_id = $2 AND ur.role_id = r.id AND ur.country_code IS NULL
          )`,
      [newId(), adminId, ROLES.ADMIN],
      tx,
    );

    await execute(
      `INSERT INTO audit_log (actor_user_id, accion, entidad, entidad_id, payload)
       VALUES (NULL, 'seed.ejecutado', 'plataforma', NULL, $1)`,
      [JSON.stringify({ admin: adminUsername })],
      tx,
    );
  });

  logger.info("Seed completado", {
    paises: PAISES.length,
    roles: Object.keys(NOMBRES_ROL).length,
    permisos: Object.keys(NOMBRES_PERMISO).length,
  });
}

main()
  .catch((error: unknown) => {
    logger.error("Seed falló", { error: String(error) });
    process.exitCode = 1;
  })
  .finally(() => closePool());
