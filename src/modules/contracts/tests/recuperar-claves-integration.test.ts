import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { bovedaEncendida } from "@/modules/identity";
import { crearSalon } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { aprobarContrato, crearReservaBeneficiario } from "../application/gestion-contratos";
import { recuperarClavesDesdeLgs } from "../application/recuperar-claves";
import type { ClaveInicialLgs } from "../infrastructure/lgs-sync";

/**
 * Recuperar desde LGS la copia de la bóveda de los niños "Sin copia" (2026-11-12).
 * LGS se simula: devuelve la clave inicial REAL de un niño y una VIEJA de otro (el
 * que ya la cambió). Solo la que abre la cuenta se guarda, y nadie cambia de clave.
 */
const lgs = vi.hoisted(() => ({ claves: [] as ClaveInicialLgs[] }));
vi.mock("../infrastructure/lgs-sync", async (original) => ({
  ...(await original<typeof import("../infrastructure/lgs-sync")>()),
  clavesInicialesDeLgs: (refs: string[]) =>
    Promise.resolve(lgs.claves.filter((c) => refs.includes(c.externalRef))),
}));

const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);
const APELLIDO = `Copia${marca}`;
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.runIf(RUN)("recuperar copias de la bóveda desde LGS (integración)", () => {
  let actor: string;
  let campaniaId: string;
  let classroomId: string;
  const base = `01-9${marca.replace(/\D/g, "3").slice(0, 4)}-26`;
  const ninos: {
    personaId: string;
    userId: string;
    username: string;
    clave: string;
    ref: string;
    hash: string;
  }[] = [];

  async function alta(doc: string) {
    const ref = `${base}#${doc}`;
    const r = await crearReservaBeneficiario({
      actorUserId: actor,
      externalRef: ref,
      countryCode: "CL",
      tipoCurso: "JUNIOR",
      inicio: dias(5),
      classroomId,
      titular: {
        nombres: "Titular",
        apellidos: APELLIDO,
        docTipo: "CC",
        docNumero: `T-${doc}`,
        countryCode: "CL",
        telefono: "56911111111",
      },
      titularEsApoderado: true,
      nino: {
        nombres: "Niño",
        apellidos: APELLIDO,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-10`,
        docTipo: "CC",
        docNumero: doc,
        countryCode: "CL",
      },
      parentesco: "MADRE",
    });
    const a = await aprobarContrato({
      actorUserId: actor,
      contractId: r.contractId,
      enviarPerfil: false,
    });
    const cred = a.credenciales!;
    // Como las cuentas de AGOSTO2026: solo el hash, sin copia.
    await execute(`UPDATE identity_user SET password_cifrada = NULL WHERE id = $1`, [cred.userId]);
    const fila = await queryOne<{ personaId: string; hash: string }>(
      `SELECT p.id AS "personaId", u.password_hash AS hash
         FROM people_person p JOIN identity_user u ON u.id = p.user_id WHERE u.id = $1`,
      [cred.userId],
    );
    ninos.push({
      personaId: fila!.personaId,
      userId: cred.userId,
      username: cred.username,
      clave: cred.passwordInicial,
      ref,
      hash: fila!.hash,
    });
  }

  const copia = async (userId: string) =>
    (await queryOne<{ c: string | null; h: string }>(
      `SELECT password_cifrada AS c, password_hash AS h FROM identity_user WHERE id = $1`,
      [userId],
    ))!;

  beforeAll(async () => {
    actor = (
      await queryOne<{ id: string }>(`SELECT id FROM identity_user WHERE username = 'sistema-lgs'`)
    )?.id as string;
    campaniaId = (
      await crearCampania({
        actorUserId: actor,
        nombre: `Copia ${marca}`,
        inicio: dias(-10),
        cursoInicio: dias(5),
      })
    ).id;
    const curso = await queryOne<{ id: string }>(
      `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
      [campaniaId],
    );
    classroomId = (
      await crearSalon({
        actorUserId: actor,
        courseId: curso?.id ?? "",
        nombre: `Copia ${marca}`,
        cupo: 5,
        timezone: "America/Santiago",
        holidayCountry: "CL",
        slots: [{ tipo: "SESION", diaSemana: 1, horaLocal: "17:00", duracionMin: 60 }],
      })
    ).id;
    await alta(`CA-${marca}`);
    await alta(`CB-${marca}`);
    const [a, b] = ninos;
    lgs.claves = [
      { externalRef: a!.ref, username: a!.username, clave: a!.clave },
      // El segundo ya cambió su clave: LGS solo tiene la inicial, que ya no abre.
      { externalRef: b!.ref, username: b!.username, clave: "ClaveVieja123" },
    ];
  });

  afterAll(async () => {
    const ids = ninos.map((n) => n.userId);
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM contracts_contract WHERE external_ref LIKE $1`, [`${base}#%`]);
    await execute(
      `DELETE FROM people_guardianship WHERE nino_id IN
         (SELECT id FROM people_person WHERE apellidos = $1)`,
      [APELLIDO],
    );
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [APELLIDO]);
    await execute(`DELETE FROM access_user_role WHERE user_id = ANY($1::uuid[])`, [ids]);
    await execute(`DELETE FROM identity_refresh_token WHERE user_id = ANY($1::uuid[])`, [ids]);
    await execute(`DELETE FROM identity_user WHERE id = ANY($1::uuid[])`, [ids]);
    await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("la REVISIÓN comprueba sin guardar nada", async () => {
    const r = await recuperarClavesDesdeLgs({
      actorUserId: actor,
      countryScope: null,
      aplicar: false,
    });
    const mios = r.resultados.filter((f) => ninos.some((n) => n.personaId === f.childPersonId));
    expect(mios.map((f) => f.resultado).sort()).toEqual(["COINCIDE", "NO_COINCIDE"]);
    for (const n of ninos) expect((await copia(n.userId)).c).toBeNull();
  });

  it.runIf(bovedaEncendida())(
    "recupera SOLO la que abre la cuenta, sin cambiar ninguna clave",
    async () => {
      const [a, b] = ninos;
      const r = await recuperarClavesDesdeLgs({
        actorUserId: actor,
        childPersonId: a!.personaId,
        countryScope: null,
        aplicar: true,
      });
      expect(r.resultados[0]?.resultado).toBe("RECUPERADA");
      const ca = await copia(a!.userId);
      expect(ca.c).not.toBeNull();
      expect(ca.h).toBe(a!.hash);

      const rb = await recuperarClavesDesdeLgs({
        actorUserId: actor,
        childPersonId: b!.personaId,
        countryScope: null,
        aplicar: true,
      });
      expect(rb.resultados[0]?.resultado).toBe("NO_COINCIDE");
      expect((await copia(b!.userId)).c).toBeNull();

      // Ya tiene copia: el botón de la ficha lo dice en vez de "0 recuperadas".
      await expect(
        recuperarClavesDesdeLgs({
          actorUserId: actor,
          childPersonId: a!.personaId,
          countryScope: null,
          aplicar: true,
        }),
      ).rejects.toThrow(/ya tiene copia/);
    },
  );

  it.runIf(!bovedaEncendida())("sin la llave de la bóveda no se aplica", async () => {
    await expect(
      recuperarClavesDesdeLgs({ actorUserId: actor, countryScope: null, aplicar: true }),
    ).rejects.toThrow(/bóveda/);
  });

  it("fuera del alcance por país, el niño no existe", async () => {
    await expect(
      recuperarClavesDesdeLgs({
        actorUserId: actor,
        childPersonId: ninos[0]!.personaId,
        countryScope: ["CO"],
        aplicar: false,
      }),
    ).rejects.toThrow(/no existe/);
  });
});
