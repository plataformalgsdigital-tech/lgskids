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
  [ROLES.SUPERADMIN]: {
    nombre: "SuperAdmin",
    descripcion: "Llave maestra: alcance total y sin restricciones",
  },
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
  [PERMISOS.EVENTOS_CREAR]: "Crear eventos en el calendario",
  [PERMISOS.SALONES_VER]: "Ver salones y sesiones",
  [PERMISOS.MATRICULAS_GESTIONAR]: "Gestionar matrículas y cambios académicos",
  [PERMISOS.MATRICULAS_VER]: "Ver matrículas y listas de salón",
  [PERMISOS.ASISTENCIA_GESTIONAR]: "Marcar asistencia",
  [PERMISOS.ASISTENCIA_VER]: "Ver asistencia",
  [PERMISOS.EVALUACIONES_GESTIONAR]: "Registrar cuestionarios",
  [PERMISOS.EVALUACIONES_VER]: "Ver cuestionarios e intentos",
  [PERMISOS.PROGRESION_VER]: "Ver progresión, medallas y diplomas",
  [PERMISOS.REPORTES_VER]: "Ver reportes y tableros",
  [PERMISOS.ARCHIVOS_GESTIONAR]: "Subir archivos",
  [PERMISOS.ARCHIVOS_VER]: "Ver y descargar archivos",
  [PERMISOS.PANEL_TABLERO]: "Tablero (pantalla de entrada)",
  [PERMISOS.MENU_CALENDARIO]: "Calendario",
  [PERMISOS.MENU_MANTENIMIENTO]: "Mantenimiento Académico",
  [PERMISOS.MENU_KIDS]: "Kids",
  [PERMISOS.MENU_CONTRATOS]: "Contratos",
  [PERMISOS.MENU_RESERVAS]: "Reservas (LGS)",
  [PERMISOS.MENU_USUARIOS]: "Usuarios y roles",
  [PERMISOS.MENU_REPORTES]: "Reportes",
  [PERMISOS.MENU_AUDITORIA]: "Auditoría",
  [PERMISOS.MENU_AVISO_LOGIN]: "Aviso de login",
  [PERMISOS.MENU_GUIAS]: "Guías",
  [PERMISOS.MENU_MIS_CLASES]: "Mis clases",
  [PERMISOS.MENU_MIS_SALONES]: "Mis salones",
  [PERMISOS.MENU_MIS_NINOS]: "Mis niños",
  [PERMISOS.SECCION_ACADEMICA]: "Sección Académica (menú)",
  [PERMISOS.SECCION_OPERACION]: "Sección Operación (menú)",
  [PERMISOS.SECCION_ADMINISTRACION]: "Sección Administración (menú)",
  [PERMISOS.SECCION_GUIA]: "Sección Guía (menú)",
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

    // Matriz rol→permisos:
    // - superadmin SIEMPRE recibe todos los permisos (llave maestra).
    // - Los demás roles solo se llenan si están VACÍOS (primer seed): las
    //   ediciones hechas desde el panel de Usuarios y Roles se respetan.
    for (const [roleCode, permisos] of Object.entries(MATRIZ_ROL_PERMISOS)) {
      if (roleCode !== ROLES.SUPERADMIN) {
        const tiene = await queryOne<{ n: string }>(
          `SELECT count(*)::text AS n FROM access_role_permission rp
             JOIN access_role r ON r.id = rp.role_id WHERE r.code = $1`,
          [roleCode],
          tx,
        );
        if (tiene !== null && Number(tiene.n) > 0) continue;
      }
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

    // Permisos de SECCIÓN (padre del menú): son nuevos y gobiernan áreas que
    // los roles YA usaban. Un administrador no pudo haberlos desmarcado nunca,
    // así que no aplica la regla de "solo si está vacío": se conceden a quien
    // ya tenga alguna pantalla de esa sección, para conservar su acceso actual.
    // Es idempotente y solo AÑADE — nunca quita.
    const SECCION_POR_HIJOS: [string, string[]][] = [
      ["seccion.academica", ["salones.ver", "catalogo.ver"]],
      ["seccion.operacion", ["personas.ver", "contratos.ver", "matriculas.gestionar"]],
      ["seccion.administracion", ["usuarios.gestionar", "reportes.ver", "auditoria.ver"]],
      ["seccion.guia", ["panel.guia"]],
      ["panel.tablero", ["panel.administracion", "panel.guia"]],
      // Visibilidad del menú: se concede a quien ya tenía el permiso funcional
      // de esa pantalla. Excepción deliberada: "Mantenimiento Académico" NO se
      // le enciende al guía, que necesita catalogo.ver para los cuestionarios
      // pero no tiene por qué ver el mantenimiento del catálogo.
      ["menu.calendario", ["salones.ver"]],
      ["menu.mantenimiento", ["catalogo.gestionar"]],
      ["menu.kids", ["personas.ver"]],
      ["menu.contratos", ["contratos.ver"]],
      ["menu.reservas", ["contratos.gestionar"]],
      ["menu.usuarios", ["usuarios.gestionar"]],
      ["menu.reportes", ["reportes.ver"]],
      ["menu.auditoria", ["auditoria.ver"]],
      ["menu.aviso_login", ["catalogo.gestionar"]],
      ["menu.mis_clases", ["panel.guia"]],
      ["menu.mis_salones", ["panel.guia"]],
      ["menu.mis_ninos", ["panel.guia"]],
      ["eventos.crear", ["salones.gestionar"]],
      ["menu.guias", ["usuarios.gestionar"]],
    ];
    for (const [seccion, hijos] of SECCION_POR_HIJOS) {
      await execute(
        `INSERT INTO access_role_permission (role_id, permission_id)
         SELECT DISTINCT rp.role_id, ps.id
           FROM access_role_permission rp
           JOIN access_permission ph ON ph.id = rp.permission_id
           JOIN access_permission ps ON ps.code = $1
          WHERE ph.code = ANY($2)
         ON CONFLICT DO NOTHING`,
        [seccion, hijos],
        tx,
      );
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

    // SUPERADMIN (llave maestra): solo se crea si viene su contraseña.
    const superUsername = env().SEED_SUPERADMIN_USERNAME.toLowerCase();
    const superPassword = env().SEED_SUPERADMIN_PASSWORD;
    if (superPassword !== undefined) {
      const superExistente = await queryOne<{ id: string }>(
        `SELECT id FROM identity_user WHERE username = $1`,
        [superUsername],
        tx,
      );
      let superId: string;
      if (superExistente === null) {
        superId = newId();
        const superHash = await hash(superPassword, {
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        });
        await execute(
          `INSERT INTO identity_user (id, username, password_hash, estado, debe_cambiar_password, updated_at)
           VALUES ($1, $2, $3, 'ACTIVO', true, now())`,
          [superId, superUsername, superHash],
          tx,
        );
        logger.info("Usuario SUPERADMIN creado", { username: superUsername });
      } else {
        superId = superExistente.id;
        logger.info("SuperAdmin ya existía; no se toca su contraseña", {
          username: superUsername,
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
        [newId(), superId, ROLES.SUPERADMIN],
        tx,
      );
    }

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
