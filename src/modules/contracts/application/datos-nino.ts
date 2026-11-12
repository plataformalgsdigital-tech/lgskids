import { registrarAuditoria } from "@/modules/audit";
import { actualizarCorreoFamiliarTx } from "@/modules/identity";
import { execute, queryOne } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { NotFoundError, ValidationError } from "@/platform/errors";

/**
 * EDITAR DATOS DEL NIÑO Y DE SU APODERADO desde la ficha (2026-11-11).
 *
 * Lo que NO se edita aquí, a propósito (decisión del negocio):
 *  - del niño: nombre, documento y usuario —identifican al alumno ante LGS, la
 *    familia y su cuenta—, y su país (lo fija el contrato);
 *  - nada ACADÉMICO (salón, curso, nivel: Academic management) ni del CONTRATO
 *    (fechas, estado, titular: Contratos);
 *  - del apoderado, su documento (es la llave con que LGS lo reconoce) y, si es
 *    además el TITULAR del contrato, su nombre: sería cambiar un dato del contrato.
 *
 * El contacto del niño ES el de su familia (2026-10-21): si el niño tenía el
 * mismo correo/teléfono que el apoderado y aquí se cambia el del apoderado sin
 * tocar el del niño, el niño lo sigue. Y la cuenta del niño, si lleva correo
 * familiar o sintético, toma el correo nuevo del niño (uno propio no se pisa).
 */

export interface DatosNinoEditables {
  nino: {
    id: string;
    /** Solo lectura: se muestran para saber a quién se edita. */
    nombres: string;
    apellidos: string;
    docTipo: string;
    docNumero: string;
    username: string | null;
    fechaNacimiento: string | null;
    email: string | null;
    telefono: string | null;
  };
  apoderado: {
    id: string;
    nombres: string;
    apellidos: string;
    docTipo: string;
    docNumero: string;
    email: string | null;
    telefono: string | null;
    parentesco: string | null;
    /** Es el titular de un contrato: su nombre no se cambia aquí. */
    esTitular: boolean;
    /** Es apoderado de otros niños (hermanos): el cambio también lo ven ellos. */
    otrosNinos: number;
  } | null;
}

async function exigirNino(childPersonId: string, countryScope: string[] | null) {
  const p = await queryOne<{ pais: string; esNino: boolean }>(
    `SELECT country_code AS pais,
            (EXISTS (SELECT 1 FROM contracts_contract c WHERE c.beneficiario_id = p.id)
             OR EXISTS (SELECT 1 FROM people_guardianship g WHERE g.nino_id = p.id)) AS "esNino"
       FROM people_person p WHERE p.id = $1`,
    [childPersonId],
  );
  if (p === null || !p.esNino || (countryScope !== null && !countryScope.includes(p.pais))) {
    throw new NotFoundError("El niño no existe.");
  }
}

/** Lo que muestra el formulario de "Editar datos". */
export async function datosNinoEditables(
  childPersonId: string,
  countryScope: string[] | null,
): Promise<DatosNinoEditables> {
  await exigirNino(childPersonId, countryScope);
  const nino = await queryOne<DatosNinoEditables["nino"]>(
    `SELECT p.id, p.nombres, p.apellidos, p.doc_tipo AS "docTipo", p.doc_numero AS "docNumero",
            u.username, p.fecha_nacimiento::text AS "fechaNacimiento", p.email, p.telefono
       FROM people_person p LEFT JOIN identity_user u ON u.id = p.user_id
      WHERE p.id = $1`,
    [childPersonId],
  );
  // LGS maneja UN apoderado por niño (`reemplazarApoderado`); si hubiera más,
  // se edita el primero.
  const apoderado = await queryOne<NonNullable<DatosNinoEditables["apoderado"]>>(
    `SELECT a.id, a.nombres, a.apellidos, a.doc_tipo AS "docTipo", a.doc_numero AS "docNumero",
            a.email, a.telefono, g.parentesco,
            EXISTS (SELECT 1 FROM contracts_contract c WHERE c.titular_id = a.id) AS "esTitular",
            (SELECT count(*)::int FROM people_guardianship o
              WHERE o.apoderado_id = a.id AND o.nino_id <> g.nino_id) AS "otrosNinos"
       FROM people_guardianship g JOIN people_person a ON a.id = g.apoderado_id
      WHERE g.nino_id = $1
      ORDER BY g.id LIMIT 1`,
    [childPersonId],
  );
  if (nino === null) throw new NotFoundError("El niño no existe.");
  return { nino, apoderado };
}

export interface EdicionDatosNino {
  nino: { fechaNacimiento: string; email: string | null; telefono: string | null };
  apoderado: {
    nombres: string;
    apellidos: string;
    email: string | null;
    telefono: string | null;
    parentesco: string | null;
  } | null;
}

const limpio = (v: string | null | undefined): string | null => {
  const t = v?.trim() ?? "";
  return t === "" ? null : t;
};

/** Guarda la edición: niño + apoderado en UNA transacción, con auditoría del antes. */
export async function editarDatosNino(input: {
  actorUserId: string;
  childPersonId: string;
  countryScope: string[] | null;
  datos: EdicionDatosNino;
  ip?: string | null;
}): Promise<{ cambios: string[] }> {
  const antes = await datosNinoEditables(input.childPersonId, input.countryScope);
  const d = input.datos;

  const hoy = new Date().toISOString().slice(0, 10);
  if (d.nino.fechaNacimiento > hoy) {
    throw new ValidationError("La fecha de nacimiento no puede ser futura.");
  }
  if (d.apoderado !== null && antes.apoderado === null) {
    throw new ValidationError("Este niño no tiene apoderado registrado para editar.");
  }

  const cambios: string[] = [];
  const ap0 = antes.apoderado;
  const ap1 =
    ap0 === null || d.apoderado === null
      ? null
      : {
          nombres: ap0.esTitular ? ap0.nombres : d.apoderado.nombres.trim(),
          apellidos: ap0.esTitular ? ap0.apellidos : d.apoderado.apellidos.trim(),
          email: limpio(d.apoderado.email),
          telefono: limpio(d.apoderado.telefono),
          parentesco: limpio(d.apoderado.parentesco),
        };
  if (ap0 !== null && ap1 !== null && !ap0.esTitular) {
    if (ap1.nombres.length < 2 || ap1.apellidos.length < 2) {
      throw new ValidationError("Nombres y apellidos del apoderado: al menos 2 letras.");
    }
  }

  // El niño SIGUE al apoderado en lo que no se tocó y compartían.
  const sigue = (
    campoNino: string | null,
    nuevoNino: string | null,
    campoAp: string | null | undefined,
    nuevoAp: string | null | undefined,
  ): string | null =>
    nuevoNino === campoNino && ap1 !== null && campoAp === campoNino && nuevoAp !== campoAp
      ? (nuevoAp ?? null)
      : nuevoNino;
  const ninoEmail = sigue(antes.nino.email, limpio(d.nino.email), ap0?.email, ap1?.email);
  const ninoTelefono = sigue(
    antes.nino.telefono,
    limpio(d.nino.telefono),
    ap0?.telefono,
    ap1?.telefono,
  );

  await withTransaction(async (tx) => {
    if (ap0 !== null && ap1 !== null) {
      for (const [campo, a, b] of [
        ["apoderado.nombres", ap0.nombres, ap1.nombres],
        ["apoderado.apellidos", ap0.apellidos, ap1.apellidos],
        ["apoderado.email", ap0.email, ap1.email],
        ["apoderado.telefono", ap0.telefono, ap1.telefono],
        ["apoderado.parentesco", ap0.parentesco, ap1.parentesco],
      ] as const) {
        if (a !== b) cambios.push(campo);
      }
      await execute(
        `UPDATE people_person
            SET nombres = $2, apellidos = $3, email = $4, telefono = $5, updated_at = now()
          WHERE id = $1`,
        [ap0.id, ap1.nombres, ap1.apellidos, ap1.email, ap1.telefono],
        tx,
      );
      await execute(
        `UPDATE people_guardianship SET parentesco = $3 WHERE nino_id = $1 AND apoderado_id = $2`,
        [input.childPersonId, ap0.id, ap1.parentesco],
        tx,
      );
    }

    for (const [campo, a, b] of [
      ["nino.fechaNacimiento", antes.nino.fechaNacimiento, d.nino.fechaNacimiento],
      ["nino.email", antes.nino.email, ninoEmail],
      ["nino.telefono", antes.nino.telefono, ninoTelefono],
    ] as const) {
      if (a !== b) cambios.push(campo);
    }
    await execute(
      `UPDATE people_person
          SET fecha_nacimiento = $2::date, email = $3, telefono = $4, updated_at = now()
        WHERE id = $1`,
      [input.childPersonId, d.nino.fechaNacimiento, ninoEmail, ninoTelefono],
      tx,
    );
    // La cuenta lleva el correo de la familia (regla 7); uno propio no se pisa.
    const cuenta = await queryOne<{ userId: string | null }>(
      `SELECT user_id AS "userId" FROM people_person WHERE id = $1`,
      [input.childPersonId],
      tx,
    );
    if (cuenta?.userId != null && ninoEmail !== antes.nino.email) {
      await actualizarCorreoFamiliarTx(tx, cuenta.userId, ninoEmail);
    }
  });

  if (cambios.length > 0) {
    await registrarAuditoria({
      actorUserId: input.actorUserId,
      accion: "contracts.datos_nino_editados",
      entidad: "people_person",
      entidadId: input.childPersonId,
      payload: {
        cambios,
        antes: { nino: antes.nino, apoderado: antes.apoderado },
        despues: {
          nino: {
            fechaNacimiento: d.nino.fechaNacimiento,
            email: ninoEmail,
            telefono: ninoTelefono,
          },
          apoderado: ap1,
        },
      },
      ip: input.ip ?? null,
    });
  }
  return { cambios };
}
