import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import {
  aprobarContrato,
  cambiarApoderadoPorExternalRef,
  crearReservaBeneficiario,
} from "@/modules/contracts";
import { crearUsuarioStaff, fichaPorEnlaceClave, usarEnlaceClave } from "@/modules/identity";
import { crearSalon } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError, ValidationError } from "@/platform/errors";
import { enviarEnlaceDeSolicitud, registrarOlvidoClave } from "../application/olvido-clave";
import type { MensajeSaliente } from "../application/ports";
import { setSenderForTests } from "../infrastructure/senders";

/**
 * "¿Olvidaste tu clave?" por WhatsApp (2026-10-21):
 *  - el niño usa el correo y el celular de su apoderado; los HERMANOS comparten
 *    el correo sin chocar con el índice de correo único;
 *  - el enlace le llega al APODERADO; al guía o administrativo, a SU teléfono;
 *  - sirve una vez, y la solicitud queda registrada y atendida "por el enlace";
 *  - sin teléfono, o pasado el tope diario, no sale: la atiende el equipo.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "11111111-1111-4111-8111-111111111111";
const marca = randomUUID().slice(0, 6);
const hoy = new Date().toISOString().slice(0, 10);
const enviados: MensajeSaliente[] = [];
const ipNueva = () => `10.${String(randomInt(1, 250))}.${String(randomInt(1, 250))}.9`;

/** Pide la clave y corre el envío (en la ruta va después de responder). */
async function pedir(usuario: string) {
  const ip = ipNueva();
  const s = await registrarOlvidoClave({ usuario, contacto: null, ip });
  await enviarEnlaceDeSolicitud(s, ip);
  return queryOne<{
    estado: string;
    enviadoA: string | null;
    problema: string | null;
    porEnlace: boolean;
  }>(
    `SELECT estado, enlace_enviado_a AS "enviadoA", enlace_problema AS problema,
            resuelta_por_enlace AS "porEnlace"
       FROM identity_solicitud_clave WHERE id = $1`,
    [s.solicitudId],
  );
}

/** El N° de LGS del contrato del niño dueño de la cuenta. */
async function refDe(userId: string): Promise<string | null> {
  const f = await queryOne<{ ref: string }>(
    `SELECT c.external_ref AS ref FROM contracts_contract c
       JOIN people_person p ON p.id = c.beneficiario_id WHERE p.user_id = $1`,
    [userId],
  );
  return f?.ref ?? null;
}

const tokenDe = (m: MensajeSaliente | undefined): string =>
  /\/restablecer-clave\/([A-Za-z0-9_-]{43})/.exec(m?.mensaje ?? "")?.[1] ?? "";

describe.runIf(RUN)("olvidé mi clave por WhatsApp (integración)", () => {
  let campaniaId: string;
  let classroomId: string;
  const usuarios: string[] = [];
  const ninos: { usuario: string; userId: string }[] = [];

  beforeAll(async () => {
    setSenderForTests({
      enviar: (m) => {
        enviados.push(m);
        return Promise.resolve({ ok: true });
      },
    });
    campaniaId = (
      await crearCampania({
        actorUserId: ACTOR,
        nombre: `Olvido ${marca}`,
        inicio: hoy,
        cursoInicio: hoy,
      })
    ).id;
    const curso = await queryOne<{ id: string }>(
      `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
      [campaniaId],
    );
    classroomId = (
      await crearSalon({
        actorUserId: ACTOR,
        courseId: curso?.id ?? "",
        nombre: `JUNIOR Salón O${marca}`,
        cupo: 5,
        timezone: "America/Bogota",
        holidayCountry: "CO",
        slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00", duracionMin: 60 }],
      })
    ).id;
    // Dos HERMANOS del mismo contrato de LGS: mismo titular, mismo correo.
    for (const [i, nombre] of ["Juan", "Ana"].entries()) {
      const r = await crearReservaBeneficiario({
        actorUserId: ACTOR,
        externalRef: `02-8${String(randomInt(1000, 9999))}-26#O${marca}${String(i)}`,
        countryCode: "CO",
        tipoCurso: "JUNIOR",
        inicio: hoy,
        classroomId,
        titular: {
          nombres: "Julián Eduardo",
          apellidos: `Olv${marca}`,
          docTipo: "CC",
          docNumero: `OT-${marca}`,
          countryCode: "CO",
          email: `familia-${marca}@prueba.lgs`,
          telefono: "300 765 4321",
        },
        titularEsApoderado: true,
        nino: {
          nombres: nombre,
          apellidos: `Olv${marca}`,
          fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-1${String(i)}`,
          docTipo: "TI",
          docNumero: `ON-${marca}-${String(i)}`,
          countryCode: "CO",
        },
        parentesco: "PADRE",
      });
      const alta = await aprobarContrato({
        actorUserId: ACTOR,
        contractId: r.contractId,
        enviarPerfil: false,
      });
      ninos.push({
        usuario: alta.credenciales?.username ?? "",
        userId: alta.credenciales?.userId ?? "",
      });
    }
  });

  afterAll(async () => {
    setSenderForTests(null);
    const ids = ninos.map((n) => n.userId);
    await execute(`DELETE FROM notifications_outbox WHERE payload->>'userId' = ANY($1)`, [
      [...ids, ...usuarios],
    ]);
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM contracts_contract WHERE external_ref LIKE $1`, [`%#O${marca}%`]);
    await execute(
      `DELETE FROM people_guardianship WHERE nino_id IN (SELECT id FROM people_person WHERE apellidos = $1)`,
      [`Olv${marca}`],
    );
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [`Olv${marca}`]);
    for (const id of [...ids, ...usuarios]) {
      await execute(`DELETE FROM access_user_role WHERE user_id = $1`, [id]);
      await execute(`DELETE FROM identity_user WHERE id = $1`, [id]);
    }
    await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("los hermanos llevan el correo y el celular de la familia, sin chocar entre sí", async () => {
    for (const n of ninos) {
      const c = await queryOne<{ email: string; familiar: boolean; tel: string | null }>(
        `SELECT u.email, u.email_familiar AS familiar, p.telefono AS tel
           FROM identity_user u JOIN people_person p ON p.user_id = u.id WHERE u.id = $1`,
        [n.userId],
      );
      expect(c).toEqual({
        email: `familia-${marca}@prueba.lgs`,
        familiar: true,
        tel: "300 765 4321",
      });
    }
  });

  it("NIÑO: el enlace llega al apoderado y se usa UNA vez; la solicitud queda atendida", async () => {
    const nino = ninos[0] as { usuario: string; userId: string };
    const antes = enviados.length;
    const s = await pedir(nino.usuario);
    expect(enviados.length).toBe(antes + 1);
    const m = enviados.at(-1);
    expect(m?.destinatario).toBe("573007654321");
    expect(s).toMatchObject({ estado: "PENDIENTE", enviadoA: "•••• 4321", problema: null });

    const token = tokenDe(m);
    const ficha = await fichaPorEnlaceClave(token);
    expect(ficha).toEqual({ estado: "VIGENTE", usuario: nino.usuario, esAlumno: true, minimo: 8 });
    // El historial no guarda el enlace.
    const guardado = await queryOne<{ mensaje: string }>(
      `SELECT mensaje FROM notifications_outbox WHERE payload->>'userId' = $1
        ORDER BY created_at DESC LIMIT 1`,
      [nino.userId],
    );
    expect(guardado?.mensaje).not.toContain(token);

    await expect(
      usarEnlaceClave({ token, clave: "corta1", confirmacion: "corta1" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await usarEnlaceClave({ token, clave: "rocky2026", confirmacion: "rocky2026" });
    const cuenta = await queryOne<{ debe: boolean }>(
      `SELECT debe_cambiar_password AS debe FROM identity_user WHERE id = $1`,
      [nino.userId],
    );
    expect(cuenta?.debe).toBe(false);
    const sol = await queryOne<{ estado: string; porEnlace: boolean }>(
      `SELECT estado, resuelta_por_enlace AS "porEnlace" FROM identity_solicitud_clave
        WHERE user_id = $1 ORDER BY creada_en DESC LIMIT 1`,
      [nino.userId],
    );
    expect(sol).toEqual({ estado: "ATENDIDA", porEnlace: true });
    await expect(
      usarEnlaceClave({ token, clave: "otra20266", confirmacion: "otra20266" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await fichaPorEnlaceClave(token)).estado).toBe("USADO");
  });

  it("ADMINISTRATIVO: a SU teléfono, con la política de 10; y con tope diario", async () => {
    const staff = await crearUsuarioStaff({
      actorUserId: ACTOR,
      nombres: "Paola",
      apellidos: `Olv${marca}`,
      email: `paola-${marca}@prueba.lgs`,
      telefono: "310 555 1234",
      roleCode: "coordinador",
      countryCode: "CO",
    });
    usuarios.push(staff.userId);
    const s = await pedir(staff.username);
    expect(enviados.at(-1)?.destinatario).toBe("573105551234");
    expect(s?.enviadoA).toBe("•••• 1234");
    const ficha = await fichaPorEnlaceClave(tokenDe(enviados.at(-1)));
    expect(ficha).toMatchObject({ estado: "VIGENTE", esAlumno: false, minimo: 10 });

    // Tres enlaces en 24 h y el cuarto ya no sale: la atiende el equipo.
    await pedir(staff.username);
    await pedir(staff.username);
    const antes = enviados.length;
    const cuarto = await pedir(staff.username);
    expect(enviados.length).toBe(antes);
    expect(cuarto?.problema).toContain("3 enlaces");
    expect(cuarto?.estado).toBe("PENDIENTE");
  });

  it("LGS cambia el apoderado de UN hermano: ese niño y su cuenta toman el contacto nuevo", async () => {
    const [juan, ana] = ninos as [
      { usuario: string; userId: string },
      { usuario: string; userId: string },
    ];
    await cambiarApoderadoPorExternalRef({
      actorUserId: ACTOR,
      externalRef: (await refDe(ana.userId)) ?? "",
      titularEsApoderado: false,
      apoderado: {
        nombres: "Laura",
        apellidos: `Olv${marca}`,
        docTipo: "CC",
        docNumero: `OA-${marca}`,
        countryCode: "CO",
        email: `mama-${marca}@prueba.lgs`,
        // Como lo manda LGS desde 2026-10-21: dígitos con indicativo.
        telefono: "573119998877",
      },
      parentesco: "MADRE",
    });
    const contacto = async (userId: string) =>
      queryOne<{ email: string; tel: string | null }>(
        `SELECT u.email, p.telefono AS tel
           FROM identity_user u JOIN people_person p ON p.user_id = u.id WHERE u.id = $1`,
        [userId],
      );
    expect(await contacto(ana.userId)).toEqual({
      email: `mama-${marca}@prueba.lgs`,
      tel: "573119998877",
    });
    // El hermano sigue con el apoderado de antes.
    expect((await contacto(juan.userId))?.email).toBe(`familia-${marca}@prueba.lgs`);
    // Y el enlace de "olvidé mi clave" de Ana va al apoderado nuevo.
    await pedir(ana.usuario);
    expect(enviados.at(-1)?.destinatario).toBe("573119998877");
  });

  it("SIN teléfono no sale nada, y un usuario inexistente solo queda registrado", async () => {
    const staff = await crearUsuarioStaff({
      actorUserId: ACTOR,
      nombres: "Sin",
      apellidos: `Olv${marca}`,
      email: `sin-${marca}@prueba.lgs`,
      roleCode: "coordinador",
      countryCode: "CO",
    });
    usuarios.push(staff.userId);
    const antes = enviados.length;
    const s = await pedir(staff.username);
    expect(enviados.length).toBe(antes);
    expect(s?.problema).toContain("Sin WhatsApp registrado");
    const fantasma = await pedir(`nadie-${marca}`);
    expect(enviados.length).toBe(antes);
    expect(fantasma).toMatchObject({ estado: "PENDIENTE", enviadoA: null, problema: null });
  });
});
