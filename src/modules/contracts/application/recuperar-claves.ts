import { registrarAuditoria } from "@/modules/audit";
import { bovedaEncendida, guardarCopiaSiCoincide, type ResultadoCopia } from "@/modules/identity";
import { queryOne, queryRows } from "@/platform/db/query";
import { ConflictError, NotFoundError } from "@/platform/errors";
import { clavesInicialesDeLgs } from "../infrastructure/lgs-sync";

/**
 * RECUPERAR desde LGS la copia de la bóveda de los niños que no la tienen
 * (2026-11-12), SIN cambiarles la clave.
 *
 * LGS guarda la clave INICIAL de cada niño que matriculó en KIDS. Para cada cuenta
 * de niño "Sin copia" que viene de LGS se pide esa clave, se comprueba contra el
 * hash de KIDS (`guardarCopiaSiCoincide`) y solo si coincide se guarda cifrada. Si
 * el niño ya la cambió, no coincide y no se toca: para él quedan "Restablecer" o el
 * enlace de perfil.
 *
 * Con `aplicar: false` es una PRUEBA: comprueba todo y no guarda nada. Las claves
 * nunca salen de esta función, ni a la respuesta ni a la auditoría.
 */

export type ResultadoRecuperacion =
  | ResultadoCopia
  /** LGS no tiene guardada su clave inicial. */
  | "SIN_CLAVE_EN_LGS"
  /** LGS la tiene para OTRO usuario: no se usa (prudencia). */
  | "OTRO_USUARIO";

export interface FilaRecuperacion {
  childPersonId: string;
  nombre: string;
  username: string;
  externalRef: string;
  resultado: ResultadoRecuperacion;
}

export interface Recuperacion {
  aplicar: boolean;
  resultados: FilaRecuperacion[];
  resumen: Record<ResultadoRecuperacion, number>;
}

/** Lo que LGS acepta por llamada. */
const LOTE = 200;

interface Candidato {
  childPersonId: string;
  nombre: string;
  userId: string;
  username: string;
  externalRef: string;
}

/** Niños con cuenta SIN copia y con contrato de LGS (el más reciente), en el alcance. */
async function candidatos(
  childPersonId: string | null,
  countryScope: string[] | null,
): Promise<Candidato[]> {
  return queryRows<Candidato>(
    `SELECT p.id AS "childPersonId", TRIM(p.nombres || ' ' || p.apellidos) AS nombre,
            u.id AS "userId", u.username, c.external_ref AS "externalRef"
       FROM people_person p
       JOIN identity_user u ON u.id = p.user_id
       JOIN LATERAL (SELECT cc.external_ref FROM contracts_contract cc
                      WHERE cc.beneficiario_id = p.id AND cc.external_ref IS NOT NULL
                      ORDER BY cc.created_at DESC LIMIT 1) c ON true
      WHERE u.password_cifrada IS NULL
        AND ($1::uuid IS NULL OR p.id = $1::uuid)
        AND ($2::text[] IS NULL OR p.country_code = ANY($2::text[]))
      ORDER BY p.apellidos, p.nombres`,
    [childPersonId, countryScope],
  );
}

function resumenVacio(): Record<ResultadoRecuperacion, number> {
  return {
    RECUPERADA: 0,
    COINCIDE: 0,
    NO_COINCIDE: 0,
    YA_TENIA: 0,
    SIN_CUENTA: 0,
    SIN_CLAVE_EN_LGS: 0,
    OTRO_USUARIO: 0,
  };
}

export async function recuperarClavesDesdeLgs(input: {
  actorUserId: string;
  /** Un niño (botón de la ficha) o null = todos los del alcance. */
  childPersonId?: string | null;
  countryScope: string[] | null;
  aplicar: boolean;
  ip?: string | null;
}): Promise<Recuperacion> {
  if (input.aplicar && !bovedaEncendida()) {
    throw new ConflictError("La bóveda de claves no está configurada (PASSWORD_VAULT_KEY).");
  }
  const lista = await candidatos(input.childPersonId ?? null, input.countryScope);

  if (input.childPersonId != null && lista.length === 0) {
    // Un solo niño que no califica: decir por qué, no "0 recuperadas".
    const n = await queryOne<{
      pais: string;
      tieneCuenta: boolean;
      tieneCopia: boolean;
      deLgs: boolean;
    }>(
      `SELECT p.country_code AS pais, u.id IS NOT NULL AS "tieneCuenta",
              u.password_cifrada IS NOT NULL AS "tieneCopia",
              EXISTS (SELECT 1 FROM contracts_contract cc
                       WHERE cc.beneficiario_id = p.id AND cc.external_ref IS NOT NULL) AS "deLgs"
         FROM people_person p LEFT JOIN identity_user u ON u.id = p.user_id
        WHERE p.id = $1`,
      [input.childPersonId],
    );
    if (n === null || (input.countryScope !== null && !input.countryScope.includes(n.pais))) {
      throw new NotFoundError("El niño no existe.");
    }
    if (!n.tieneCuenta) throw new ConflictError("El niño todavía no tiene cuenta.");
    if (n.tieneCopia) throw new ConflictError("La cuenta ya tiene copia en la bóveda.");
    throw new ConflictError(
      "Este niño no viene de LGS: no hay clave inicial que recuperar. Restablece la clave o envía el enlace de perfil.",
    );
  }

  const resultados: FilaRecuperacion[] = [];
  for (let i = 0; i < lista.length; i += LOTE) {
    const lote = lista.slice(i, i + LOTE);
    const claves = new Map(
      (await clavesInicialesDeLgs(lote.map((c) => c.externalRef))).map((c) => [c.externalRef, c]),
    );
    for (const c of lote) {
      const deLgs = claves.get(c.externalRef);
      let resultado: ResultadoRecuperacion;
      if (deLgs === undefined) resultado = "SIN_CLAVE_EN_LGS";
      else if (
        deLgs.username !== null &&
        deLgs.username.trim().toLowerCase() !== c.username.trim().toLowerCase()
      ) {
        resultado = "OTRO_USUARIO";
      } else {
        resultado = await guardarCopiaSiCoincide(c.userId, deLgs.clave, input.aplicar);
      }
      resultados.push({
        childPersonId: c.childPersonId,
        nombre: c.nombre,
        username: c.username,
        externalRef: c.externalRef,
        resultado,
      });
    }
  }

  const resumen = resumenVacio();
  for (const r of resultados) resumen[r.resultado] += 1;

  if (input.aplicar && resultados.length > 0) {
    await registrarAuditoria({
      actorUserId: input.actorUserId,
      accion: "identity.copia_clave_recuperada_lgs",
      entidad: "identity_user",
      entidadId: input.childPersonId ?? null,
      payload: {
        resumen,
        // Quiénes, nunca las claves.
        recuperadas: resultados
          .filter((r) => r.resultado === "RECUPERADA")
          .map((r) => ({ childPersonId: r.childPersonId, username: r.username })),
      },
      ip: input.ip ?? null,
    });
  }
  return { aplicar: input.aplicar, resultados, resumen };
}
