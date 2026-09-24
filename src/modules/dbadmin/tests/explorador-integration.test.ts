import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { NotFoundError, ValidationError } from "@/platform/errors";
import {
  actualizarCelda,
  borrarFilas,
  esquemaTabla,
  exportarCsv,
  insertarFila,
  leerFilas,
  listarTablas,
} from "../application/explorador";
import { MASCARA } from "../domain/tablas";

/**
 * Explorador de la base (solo superadmin). Lo que importa comprobar contra
 * PostgreSQL de verdad: que las credenciales no salgan, que un nombre de tabla
 * inventado no llegue al SQL, y que escribir funcione y quede auditado.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const CLAVE = `prueba_dbadmin_${randomUUID().slice(0, 8)}`;

describe.runIf(RUN)("explorador de la base (integración)", () => {
  afterAll(async () => {
    await execute(`DELETE FROM platform_config WHERE clave = $1`, [CLAVE]);
    await execute(`DELETE FROM audit_log WHERE accion LIKE 'dbadmin.%' AND entidad_id = $1`, [
      CLAVE,
    ]);
    await closePool();
  });

  it("lista las tablas del esquema y marca las sensibles", async () => {
    const tablas = await listarTablas();
    const nombres = tablas.map((t) => t.nombre);
    expect(nombres).toContain("identity_user");
    expect(nombres).toContain("catalog_curso");
    expect(tablas.find((t) => t.nombre === "audit_log")?.sensible).toBe(true);
    expect(tablas.find((t) => t.nombre === "catalog_curso")?.sensible).toBe(false);
    // El módulo agrupa la lista en la pantalla.
    expect(tablas.find((t) => t.nombre === "identity_user")?.modulo).toBe("identity");
  });

  it("el esquema marca la clave primaria y deja las credenciales fuera de alcance", async () => {
    const e = await esquemaTabla("identity_user");
    expect(e.pk).toBe("id");
    const hash = e.columnas.find((c) => c.nombre === "password_hash");
    expect(hash?.oculta).toBe(true);
    expect(hash?.editable).toBe(false);
    // La PK tampoco se edita: lo que apunte a la fila quedaría colgando.
    expect(e.columnas.find((c) => c.nombre === "id")?.editable).toBe(false);
    expect(e.columnas.find((c) => c.nombre === "username")?.editable).toBe(true);
  });

  it("al leer, el hash de la clave NO viaja: llega enmascarado", async () => {
    const pagina = await leerFilas({ tabla: "identity_user", tamano: 5 });
    expect(pagina.filas.length).toBeGreaterThan(0);
    for (const fila of pagina.filas) {
      expect(fila["password_hash"]).toBe(MASCARA);
      expect(fila["password_cifrada"]).toBe(MASCARA);
      expect(JSON.stringify(fila)).not.toContain("$argon2");
    }
    // Y el CSV sale con lo mismo que la pantalla, no con lo que hay en la base.
    const csv = await exportarCsv({ tabla: "identity_user", tamano: 5 });
    expect(csv).toContain("password_hash");
    expect(csv).not.toContain("$argon2");
  });

  it("una tabla que no existe no llega al SQL", async () => {
    await expect(leerFilas({ tabla: "no_existe_esta_tabla" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    // Y un intento de inyección se corta en la validación del nombre.
    await expect(
      leerFilas({ tabla: 'identity_user"; DROP TABLE identity_user; --' }),
    ).rejects.toBeInstanceOf(ValidationError);
    // La tabla sigue ahí.
    const viva = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM identity_user`);
    expect((viva?.n ?? 0) > 0).toBe(true);
  });

  it("filtros y búsqueda con columnas inventadas no rompen la consulta", async () => {
    const pagina = await leerFilas({
      tabla: "identity_user",
      filtros: { "columna; DROP TABLE x": "1", username: "" },
      busqueda: "admin",
      orden: "no_existe",
      tamano: 5,
    });
    expect(Array.isArray(pagina.filas)).toBe(true);
  });

  it("escribe: inserta, actualiza y borra, y lo deja en la auditoría", async () => {
    const insertada = await insertarFila({
      actorUserId: ACTOR,
      tabla: "platform_config",
      valores: { clave: CLAVE, valor: "uno" },
    });
    expect(insertada["valor"]).toBe("uno");

    const actualizada = await actualizarCelda({
      actorUserId: ACTOR,
      tabla: "platform_config",
      id: CLAVE,
      columna: "valor",
      valor: "dos",
    });
    expect(actualizada["valor"]).toBe("dos");

    const evento = await queryOne<{ payload: { antes: string; despues: string } }>(
      `SELECT payload FROM audit_log
        WHERE accion = 'dbadmin.celda_actualizada' AND entidad_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [CLAVE],
    );
    expect(evento?.payload.antes).toBe("uno");
    expect(evento?.payload.despues).toBe("dos");

    const { borradas } = await borrarFilas({
      actorUserId: ACTOR,
      tabla: "platform_config",
      ids: [CLAVE],
    });
    expect(borradas).toBe(1);
  });

  it("una credencial no se escribe ni por la puerta de atrás", async () => {
    await expect(
      actualizarCelda({
        actorUserId: ACTOR,
        tabla: "identity_user",
        id: randomUUID(),
        columna: "password_hash",
        valor: "lo-que-sea",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("las tablas sensibles exigen confirmación ANTES de tocar nada", async () => {
    await expect(
      actualizarCelda({
        actorUserId: ACTOR,
        tabla: "audit_log",
        id: randomUUID(),
        columna: "accion",
        valor: "editado",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("el borrado en lote tiene tope", async () => {
    await expect(
      borrarFilas({
        actorUserId: ACTOR,
        tabla: "platform_config",
        ids: Array.from({ length: 101 }, (_, i) => `x${String(i)}`),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
