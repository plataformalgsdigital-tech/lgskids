import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { crearSalon } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { datosNinoEditables, editarDatosNino } from "../application/datos-nino";
import { crearReservaBeneficiario } from "../application/gestion-contratos";
import type { DatosNinoLgs } from "../infrastructure/lgs-sync";

// LGS se simula: la prueba mira QUÉ se le manda y que un rechazo frena todo.
const lgs = vi.hoisted(() => ({
  configurado: false,
  llamadas: [] as DatosNinoLgs[],
  rechazar: false,
}));
vi.mock("../infrastructure/lgs-sync", () => ({
  lgsSyncConfigurado: () => lgs.configurado,
  avisarDatosNinoALgs: (c: DatosNinoLgs) => {
    lgs.llamadas.push(c);
    if (lgs.rechazar) return Promise.reject(new Error("LGS rechazó el cambio: prueba"));
    return Promise.resolve({ configurado: true, aplicado: true });
  },
}));

/**
 * "✏️ Editar datos" de la ficha del niño (2026-11-11): se editan sus datos
 * personales y los del apoderado, pero NO nombre, documento ni usuario del niño,
 * ni lo académico o del contrato (el nombre del apoderado que es TITULAR es dato
 * del contrato). El niño SIGUE el contacto del apoderado cuando lo compartían.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);
const APELLIDO = `Editar${marca}`;
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.runIf(RUN)("editar datos del niño y del apoderado (integración)", () => {
  let actor: string;
  let campaniaId: string;
  let classroomId: string;
  let ninoConApoderado: string;
  let ninoTitular: string;
  const base = `01-8${marca.replace(/\D/g, "2").slice(0, 4)}-26`;

  const reservar = (doc: string, conApoderado: boolean) =>
    crearReservaBeneficiario({
      actorUserId: actor,
      externalRef: `${base}#${doc}`,
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
        email: `titular-${marca}@ejemplo.cl`,
        telefono: "56911111111",
      },
      titularEsApoderado: !conApoderado,
      ...(conApoderado && {
        apoderadoNuevo: {
          nombres: "Abuela",
          apellidos: APELLIDO,
          docTipo: "CC",
          docNumero: `A-${doc}`,
          countryCode: "CL",
          email: `abuela-${marca}@ejemplo.cl`,
          telefono: "56922222222",
        },
      }),
      nino: {
        nombres: "Niño",
        apellidos: APELLIDO,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-10`,
        docTipo: "CC",
        docNumero: doc,
        countryCode: "CL",
      },
      parentesco: conApoderado ? "ABUELA" : "MADRE",
    });

  const nino = (id: string) =>
    queryOne<{ nombres: string; doc: string; email: string | null; telefono: string | null }>(
      `SELECT nombres, doc_numero AS doc, email, telefono FROM people_person WHERE id = $1`,
      [id],
    );

  beforeAll(async () => {
    actor = (
      await queryOne<{ id: string }>(`SELECT id FROM identity_user WHERE username = 'sistema-lgs'`)
    )?.id as string;
    campaniaId = (
      await crearCampania({
        actorUserId: actor,
        nombre: `Editar ${marca}`,
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
        nombre: `Editar ${marca}`,
        cupo: 5,
        timezone: "America/Santiago",
        holidayCountry: "CL",
        slots: [{ tipo: "SESION", diaSemana: 1, horaLocal: "17:00", duracionMin: 60 }],
      })
    ).id;
    const a = await reservar(`EA-${marca}`, true);
    const b = await reservar(`EB-${marca}`, false);
    const id = async (contractId: string) =>
      (
        await queryOne<{ id: string }>(
          `SELECT beneficiario_id AS id FROM contracts_contract WHERE id = $1`,
          [contractId],
        )
      )?.id as string;
    ninoConApoderado = await id(a.contractId);
    ninoTitular = await id(b.contractId);
  });

  afterAll(async () => {
    await execute(
      `DELETE FROM audit_log WHERE accion = 'contracts.datos_nino_editados'
         AND entidad_id IN (SELECT id::text FROM people_person WHERE apellidos = $1)`,
      [APELLIDO],
    );
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM contracts_contract WHERE external_ref LIKE $1`, [`${base}#%`]);
    await execute(
      `DELETE FROM people_guardianship WHERE nino_id IN
         (SELECT id FROM people_person WHERE apellidos = $1)`,
      [APELLIDO],
    );
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [APELLIDO]);
    await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("muestra los datos del niño y de su apoderado", async () => {
    const d = await datosNinoEditables(ninoConApoderado, null);
    expect(d.nino.docNumero).toBe(`EA-${marca}`);
    expect(d.apoderado).toMatchObject({
      nombres: "Abuela",
      parentesco: "ABUELA",
      esTitular: false,
    });
    // El niño copió el contacto del apoderado en la reserva.
    expect(d.nino.email).toBe(`abuela-${marca}@ejemplo.cl`);
  });

  it("fuera del alcance por país, el niño no existe", async () => {
    await expect(datosNinoEditables(ninoConApoderado, ["CO"])).rejects.toThrow(/no existe/);
  });

  it("edita al apoderado y el niño sigue el contacto que compartían; nombre y documento no se tocan", async () => {
    const r = await editarDatosNino({
      actorUserId: actor,
      childPersonId: ninoConApoderado,
      countryScope: null,
      datos: {
        nino: {
          fechaNacimiento: `${String(new Date().getUTCFullYear() - 7)}-05-20`,
          email: `abuela-${marca}@ejemplo.cl`,
          telefono: "56922222222",
        },
        apoderado: {
          nombres: "Abuelita",
          apellidos: APELLIDO,
          email: `nueva-${marca}@ejemplo.cl`,
          telefono: "56933333333",
          parentesco: "ABUELA MATERNA",
        },
      },
    });
    expect(r.cambios).toEqual(
      expect.arrayContaining([
        "apoderado.nombres",
        "apoderado.email",
        "apoderado.telefono",
        "apoderado.parentesco",
        "nino.fechaNacimiento",
        "nino.email",
        "nino.telefono",
      ]),
    );
    const n = await nino(ninoConApoderado);
    expect(n).toMatchObject({
      nombres: "Niño",
      doc: `EA-${marca}`,
      email: `nueva-${marca}@ejemplo.cl`,
      telefono: "56933333333",
    });
    const d = await datosNinoEditables(ninoConApoderado, null);
    expect(d.apoderado).toMatchObject({ nombres: "Abuelita", parentesco: "ABUELA MATERNA" });
    const audit = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log
        WHERE accion = 'contracts.datos_nino_editados' AND entidad_id = $1`,
      [ninoConApoderado],
    );
    expect(audit?.n).toBe(1);
  });

  it("si el niño tiene un contacto PROPIO, cambiar el del apoderado no lo pisa", async () => {
    await editarDatosNino({
      actorUserId: actor,
      childPersonId: ninoConApoderado,
      countryScope: null,
      datos: {
        nino: {
          fechaNacimiento: `${String(new Date().getUTCFullYear() - 7)}-05-20`,
          email: `propio-${marca}@ejemplo.cl`,
          telefono: "56933333333",
        },
        apoderado: {
          nombres: "Abuelita",
          apellidos: APELLIDO,
          email: `otra-${marca}@ejemplo.cl`,
          telefono: "56933333333",
          parentesco: "ABUELA MATERNA",
        },
      },
    });
    expect((await nino(ninoConApoderado))?.email).toBe(`propio-${marca}@ejemplo.cl`);
  });

  it("el apoderado que es TITULAR conserva su nombre (es dato del contrato)", async () => {
    const d = await datosNinoEditables(ninoTitular, null);
    expect(d.apoderado?.esTitular).toBe(true);
    await editarDatosNino({
      actorUserId: actor,
      childPersonId: ninoTitular,
      countryScope: null,
      datos: {
        nino: {
          fechaNacimiento: d.nino.fechaNacimiento ?? "2018-01-01",
          email: d.nino.email,
          telefono: d.nino.telefono,
        },
        apoderado: {
          nombres: "Otro Nombre",
          apellidos: "Otro Apellido",
          email: `titular2-${marca}@ejemplo.cl`,
          telefono: "56944444444",
          parentesco: "MADRE",
        },
      },
    });
    const despues = await datosNinoEditables(ninoTitular, null);
    expect(despues.apoderado).toMatchObject({
      nombres: "Titular",
      apellidos: APELLIDO,
      email: `titular2-${marca}@ejemplo.cl`,
      telefono: "56944444444",
    });
  });

  it("rechaza una fecha de nacimiento futura", async () => {
    await expect(
      editarDatosNino({
        actorUserId: actor,
        childPersonId: ninoConApoderado,
        countryScope: null,
        datos: {
          nino: { fechaNacimiento: dias(30), email: null, telefono: null },
          apoderado: null,
        },
      }),
    ).rejects.toThrow(/futura/);
  });

  it("avisa a LGS ANTES de guardar, con el N° de LGS y lo editado", async () => {
    lgs.configurado = true;
    lgs.llamadas.length = 0;
    const fecha = `${String(new Date().getUTCFullYear() - 7)}-06-01`;
    await editarDatosNino({
      actorUserId: actor,
      childPersonId: ninoConApoderado,
      countryScope: null,
      datos: {
        nino: {
          fechaNacimiento: fecha,
          email: `propio-${marca}@ejemplo.cl`,
          telefono: "56955555555",
        },
        apoderado: {
          nombres: "Abuelita",
          apellidos: APELLIDO,
          email: `otra-${marca}@ejemplo.cl`,
          telefono: "56933333333",
          parentesco: "ABUELA MATERNA",
        },
      },
    });
    expect(lgs.llamadas).toHaveLength(1);
    expect(lgs.llamadas[0]).toMatchObject({
      externalRef: `${base}#EA-${marca}`,
      nino: { fechaNacimiento: fecha, telefono: "56955555555" },
      apoderado: { nombres: "Abuelita", parentesco: "ABUELA MATERNA" },
    });
  });

  it("si LGS rechaza, KIDS no guarda nada", async () => {
    lgs.configurado = true;
    lgs.rechazar = true;
    try {
      await expect(
        editarDatosNino({
          actorUserId: actor,
          childPersonId: ninoConApoderado,
          countryScope: null,
          datos: {
            nino: {
              fechaNacimiento: `${String(new Date().getUTCFullYear() - 7)}-06-01`,
              email: `nunca-${marca}@ejemplo.cl`,
              telefono: "56955555555",
            },
            apoderado: null,
          },
        }),
      ).rejects.toThrow(/LGS/);
      expect((await nino(ninoConApoderado))?.email).toBe(`propio-${marca}@ejemplo.cl`);
    } finally {
      lgs.rechazar = false;
      lgs.configurado = false;
    }
  });
});
