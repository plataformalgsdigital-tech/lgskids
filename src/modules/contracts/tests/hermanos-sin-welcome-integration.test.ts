import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { setSenderForTests, type MensajeSaliente } from "@/modules/notifications";
import { listarNinos } from "@/modules/people";
import { crearSalon, welcomeDeNino } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import {
  aprobarContrato,
  crearReservaBeneficiario,
  listarContratos,
} from "../application/gestion-contratos";
import {
  completarPerfilNino,
  fichaPorEnlacePerfil,
  reenviarEnlacePerfil,
} from "../application/perfil-nino";

/**
 * Migración de AGOSTO2026 (2026-10-13), con el curso ya andando:
 *  - un contrato de LGS trae VARIOS hermanos con el mismo titular: el segundo
 *    reutiliza al titular (antes se rechazaba con 409 y LGS lo daba por hecho);
 *  - se aprueba SIN mandar el WhatsApp de perfil (se manda después);
 *  - el enlace "sin Welcome" deja crear el perfil sin agendar sesión.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe.runIf(RUN)("hermanos y perfil sin Welcome (integración)", () => {
  let actor: string;
  let campaniaId: string;
  let classroomId: string;
  const enviados: MensajeSaliente[] = [];
  const base = `01-7${marca.replace(/\D/g, "1").slice(0, 4)}-26`;
  const titular = {
    nombres: "Mamá",
    apellidos: `Hermanos${marca}`,
    docTipo: "CC",
    docNumero: `TH-${marca}`,
    countryCode: "CL",
    telefono: "56912345678",
  };
  const reservar = (doc: string, nombres: string) =>
    crearReservaBeneficiario({
      actorUserId: actor,
      externalRef: `${base}#${doc}`,
      countryCode: "CL",
      tipoCurso: "JUNIOR",
      inicio: dias(-30),
      classroomId,
      titular,
      titularEsApoderado: true,
      nino: {
        nombres,
        apellidos: `Hermanos${marca}`,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-10`,
        docTipo: "CC",
        docNumero: doc,
        countryCode: "CL",
      },
      parentesco: "MADRE",
    });

  beforeAll(async () => {
    setSenderForTests({
      enviar: (m) => {
        enviados.push(m);
        return Promise.resolve({ ok: true });
      },
    });
    actor = (
      await queryOne<{ id: string }>(`SELECT id FROM identity_user WHERE username = 'sistema-lgs'`)
    )?.id as string;
    // Curso que YA empezó: el caso de la migración.
    campaniaId = (
      await crearCampania({
        actorUserId: actor,
        nombre: `Hermanos ${marca}`,
        inicio: dias(-60),
        cursoInicio: dias(-30),
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
        nombre: `Hermanos ${marca}`,
        cupo: 5,
        timezone: "America/Santiago",
        holidayCountry: "CL",
        slots: [{ tipo: "SESION", diaSemana: 1, horaLocal: "17:00", duracionMin: 60 }],
      })
    ).id;
  });

  afterAll(async () => {
    setSenderForTests(null);
    await execute(
      `DELETE FROM notifications_outbox WHERE child_person_id IN
         (SELECT id FROM people_person WHERE apellidos = $1)`,
      [`Hermanos${marca}`],
    );
    await execute(
      `DELETE FROM files_object WHERE entidad = 'student_foto' AND entidad_id IN
         (SELECT id::text FROM people_person WHERE apellidos = $1)`,
      [`Hermanos${marca}`],
    );
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM contracts_contract WHERE external_ref LIKE $1`, [`${base}#%`]);
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [`Hermanos${marca}`]);
    await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("dos hermanos del mismo titular: el segundo reutiliza al titular", async () => {
    const a = await reservar(`HA-${marca}`, "Ana");
    const b = await reservar(`HB-${marca}`, "Beto");
    const titulares = await queryOne<{ n: number; distintos: number }>(
      `SELECT count(*)::int AS n, count(DISTINCT titular_id)::int AS distintos
         FROM contracts_contract WHERE id IN ($1, $2)`,
      [a.contractId, b.contractId],
    );
    expect(titulares).toEqual({ n: 2, distintos: 1 });
    // Y el titular no quedó duplicado.
    const personas = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM people_person WHERE doc_numero = $1`,
      [titular.docNumero],
    );
    expect(personas?.n).toBe(1);
  });

  it("buscar por el N° de contrato trae a los dos hermanos; por nombre, en cualquier orden", async () => {
    const porContrato = await listarNinos({ countryScope: null, buscar: base, limit: 50 });
    expect(porContrato.map((n) => n.nombres).sort()).toEqual(["Ana", "Beto"]);
    const alDerecho = await listarNinos({
      countryScope: null,
      buscar: `beto hermanos${marca}`,
      limit: 50,
    });
    const alReves = await listarNinos({
      countryScope: null,
      buscar: `HERMANOS${marca} Beto`,
      limit: 50,
    });
    expect(alDerecho.map((n) => n.nombres)).toEqual(["Beto"]);
    expect(alReves.map((n) => n.nombres)).toEqual(["Beto"]);
    // El documento se encuentra escrito con guiones o sin ellos.
    const porDoc = await listarNinos({ countryScope: null, buscar: `HB${marca}`, limit: 50 });
    expect(porDoc.map((n) => n.nombres)).toEqual(["Beto"]);
  });

  it("Contratos busca igual: por N° de LGS, por el TITULAR y por el documento del niño", async () => {
    const nombres = (cs: { beneficiario: string }[]) =>
      cs.map((c) => c.beneficiario.split(" ")[0]).sort();
    const porContrato = await listarContratos({ countryScope: null, buscar: base });
    expect(nombres(porContrato)).toEqual(["Ana", "Beto"]);
    // El nombre del titular trae los contratos de sus dos hijos, sin tildes.
    const porTitular = await listarContratos({
      countryScope: null,
      buscar: `mama hermanos${marca}`,
    });
    expect(nombres(porTitular)).toEqual(["Ana", "Beto"]);
    const porDoc = await listarContratos({ countryScope: null, buscar: `HA${marca}` });
    expect(nombres(porDoc)).toEqual(["Ana"]);
  });

  it("aprobar sin WhatsApp no manda el enlace de perfil", async () => {
    const c = await queryOne<{ id: string }>(
      `SELECT id FROM contracts_contract WHERE external_ref = $1`,
      [`${base}#HA-${marca}`],
    );
    const antes = enviados.length;
    const r = await aprobarContrato({
      actorUserId: actor,
      contractId: c?.id ?? "",
      enviarPerfil: false,
    });
    expect(r.credenciales?.username).toBeTruthy();
    expect(r.perfil).toBeNull();
    expect(enviados.length).toBe(antes);
  });

  it("el enlace sin Welcome deja crear el perfil sin agendar sesión", async () => {
    const nino = await queryOne<{ id: string }>(
      `SELECT beneficiario_id AS id FROM contracts_contract WHERE external_ref = $1`,
      [`${base}#HA-${marca}`],
    );
    const childPersonId = nino?.id ?? "";
    const r = await reenviarEnlacePerfil({
      actorUserId: actor,
      childPersonId,
      countryScope: null,
      exigeWelcome: false,
    });
    expect(r.enviado).toBe(true);
    expect(enviados.at(-1)?.mensaje).not.toContain("Welcome");
    const token = /crear-perfil\/([A-Za-z0-9_-]{43})/.exec(enviados.at(-1)?.mensaje ?? "")?.[1];

    const ficha = await fichaPorEnlacePerfil(token ?? "");
    expect(ficha).toMatchObject({ estado: "VIGENTE", exigeWelcome: false, welcomes: [] });

    await completarPerfilNino(token ?? "", {
      clave: "anaclave26",
      confirmacion: "anaclave26",
      sobreTi: "Me gusta cantar.",
      hobbies: "Dibujar",
      fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-10`,
      welcomeId: "",
      foto: { nombre: "ana.png", mime: "image/png", bytes: PNG },
    });
    expect(await welcomeDeNino(childPersonId)).toBeNull();
    expect((await fichaPorEnlacePerfil(token ?? "")).estado).toBe("USADO");
  });
});
