import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { aprobarContrato, crearReservaBeneficiario } from "@/modules/contracts";
import { crearSalon } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ConflictError, ValidationError } from "@/platform/errors";
import {
  buscarDestinatarios,
  crearPlantilla,
  encolarEnvio,
  enviarCredenciales,
  listarPlantillas,
  actualizarPlantilla,
} from "../application/mensajes";
import { procesarOutbox } from "../application/outbox";
import type { MensajeSaliente } from "../application/ports";
import { setSenderForTests } from "../infrastructure/senders";

/**
 * Administración › Mensajes (2026-10-07): lo que no puede fallar.
 *  - el destinatario es el APODERADO, con su número normalizado;
 *  - un envío no sale dos veces aunque el worker y el envío inmediato coincidan;
 *  - la CLAVE llega al apoderado y NUNCA queda escrita en el historial;
 *  - un envío masivo no puede llevar la clave.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const CON_BOVEDA = env().PASSWORD_VAULT_KEY !== undefined;
// sistema-lgs: el historial y las plantillas guardan quién fue (clave foránea).
const ACTOR = "11111111-1111-4111-8111-111111111111";
const marca = randomUUID().slice(0, 6);
const hoy = new Date().toISOString().slice(0, 10);

const enviados: MensajeSaliente[] = [];

describe.runIf(RUN)("mensajes por WhatsApp (integración)", () => {
  let campaniaId: string;
  let classroomId: string;
  let ninoId: string;
  let clave: string;

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
        nombre: `Mensajes ${marca}`,
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
        nombre: `JUNIOR Salón M${marca}`,
        cupo: 5,
        timezone: "America/Bogota",
        holidayCountry: "CO",
        slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00", duracionMin: 60 }],
      })
    ).id;
    const reserva = await crearReservaBeneficiario({
      actorUserId: ACTOR,
      externalRef: `02-9${marca.replace(/\D/g, "1")}1-26#M${marca}`,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: hoy,
      classroomId,
      // El apoderado escribió su celular SIN el 57: debe llegar igual.
      titular: {
        nombres: "Marcela Andrea",
        apellidos: `Msj${marca}`,
        docTipo: "CC",
        docNumero: `MT-${marca}`,
        countryCode: "CO",
        telefono: "300 123 4567",
      },
      titularEsApoderado: true,
      nino: {
        nombres: "Sofía",
        apellidos: `Msj${marca}`,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-10`,
        docTipo: "TI",
        docNumero: `MN-${marca}`,
        countryCode: "CO",
      },
      parentesco: "MADRE",
    });
    const alta = await aprobarContrato({ actorUserId: ACTOR, contractId: reserva.contractId });
    clave = alta.credenciales?.passwordInicial ?? "";
    const nino = await queryOne<{ id: string }>(
      `SELECT id FROM people_person WHERE doc_numero = $1`,
      [`MN-${marca}`],
    );
    ninoId = nino?.id ?? "";
  });

  afterAll(async () => {
    setSenderForTests(null);
    await execute(`DELETE FROM notifications_outbox WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM notifications_plantilla WHERE slug = $1`, [`prueba-${marca}`]);
    const user = await queryOne<{ id: string }>(
      `SELECT user_id AS id FROM people_person WHERE id = $1`,
      [ninoId],
    );
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM contracts_contract WHERE external_ref LIKE $1`, [`%#M${marca}`]);
    await execute(
      `DELETE FROM people_guardianship WHERE nino_id IN (SELECT id FROM people_person WHERE apellidos = $1)`,
      [`Msj${marca}`],
    );
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [`Msj${marca}`]);
    if (user?.id) {
      await execute(`DELETE FROM access_user_role WHERE user_id = $1`, [user.id]);
      await execute(`DELETE FROM identity_user WHERE id = $1`, [user.id]);
    }
    await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("el destinatario es el apoderado, con el indicativo puesto", async () => {
    const recordatorio = (await listarPlantillas(false)).find(
      (p) => p.slug === "recordatorio-clase",
    );
    const { destinatarios } = await buscarDestinatarios({
      countryScope: null,
      classroomId,
      plantillaId: recordatorio?.id,
    });
    expect(destinatarios).toHaveLength(1);
    expect(destinatarios[0]).toMatchObject({
      childPersonId: ninoId,
      apoderado: `Marcela Andrea Msj${marca}`,
      telefonoDe: "apoderado",
      whatsapp: "573001234567",
      problema: null,
    });
    expect(destinatarios[0]?.vistaPrevia).toContain("¡Hola Marcela!");

    const porDoc = await buscarDestinatarios({
      countryScope: null,
      documentos: [`mn-${marca}`, "NO-EXISTE-1"],
    });
    expect(porDoc.destinatarios.map((d) => d.childPersonId)).toEqual([ninoId]);
    expect(porDoc.noEncontrados).toEqual(["NOEXISTE1"]);
    // Otro país no lo ve.
    expect(
      (await buscarDestinatarios({ countryScope: ["CL"], classroomId })).destinatarios,
    ).toEqual([]);
  });

  it("un envío sale UNA vez aunque se despache dos veces", async () => {
    const recordatorio = (await listarPlantillas(false)).find(
      (p) => p.slug === "recordatorio-clase",
    );
    const r = await encolarEnvio({
      actorUserId: ACTOR,
      countryScope: null,
      plantillaId: recordatorio?.id ?? "",
      childPersonIds: [ninoId],
    });
    expect(r.encolados).toBe(1);
    enviados.length = 0;
    const [a, b] = await Promise.all([procesarOutbox(10, r.ids), procesarOutbox(10, r.ids)]);
    expect(a.enviadas + b.enviadas).toBe(1);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ destinatario: "573001234567", canal: "WHATSAPP" });
    const fila = await queryOne<{ estado: string }>(
      `SELECT estado::text AS estado FROM notifications_outbox WHERE id = $1`,
      [r.ids[0]],
    );
    expect(fila?.estado).toBe("ENVIADA");
  });

  it("un envío masivo NO puede llevar la clave", async () => {
    const cred = (await listarPlantillas(false)).find((p) => p.slug === "credenciales-kids");
    await expect(
      encolarEnvio({
        actorUserId: ACTOR,
        countryScope: null,
        plantillaId: cred?.id ?? "",
        childPersonIds: [ninoId],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it.runIf(CON_BOVEDA)(
    "la ficha envía usuario y clave al apoderado, y el historial no guarda la clave",
    async () => {
      enviados.length = 0;
      const r = await enviarCredenciales({
        actorUserId: ACTOR,
        childPersonId: ninoId,
        countryScope: null,
      });
      expect(r).toEqual({ ok: true, destinatario: "573001234567" });
      expect(enviados).toHaveLength(1);
      expect(enviados[0]?.mensaje).toContain(clave);

      const filas = await queryRows<{ mensaje: string; estado: string }>(
        `SELECT mensaje, estado::text AS estado FROM notifications_outbox
          WHERE child_person_id = $1 AND plantilla_slug = 'credenciales-kids'`,
        [ninoId],
      );
      expect(filas).toHaveLength(1);
      expect(filas[0]?.estado).toBe("ENVIADA");
      expect(filas[0]?.mensaje).not.toContain(clave);
      expect(filas[0]?.mensaje).toContain("••••••");
    },
  );

  it("las plantillas: slug único y la de credenciales no se desactiva", async () => {
    await crearPlantilla({
      actorUserId: ACTOR,
      slug: `prueba-${marca}`,
      nombre: "Prueba",
      contenido: "Hola {{nombre}}",
    });
    await expect(
      crearPlantilla({
        actorUserId: ACTOR,
        slug: `prueba-${marca}`,
        nombre: "Otra",
        contenido: "x",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const cred = (await listarPlantillas(true)).find((p) => p.slug === "credenciales-kids");
    await expect(
      actualizarPlantilla({ actorUserId: ACTOR, id: cred?.id ?? "", activo: false }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
