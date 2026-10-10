import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { setSenderForTests, type MensajeSaliente } from "@/modules/notifications";
import { crearSalon, crearWelcome, welcomeDeNino } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError, ValidationError } from "@/platform/errors";
import { aprobarContrato, crearReservaBeneficiario } from "../application/gestion-contratos";
import {
  completarPerfilNino,
  estadoPerfilNino,
  fichaPorEnlacePerfil,
  reenviarEnlacePerfil,
  type DatosPerfil,
} from "../application/perfil-nino";

/**
 * CREACIÓN DE PERFIL (2026-10-10): al aprobar el contrato, el apoderado recibe
 * por WhatsApp un enlace donde el niño elige su clave, completa su perfil y
 * agenda su Welcome. Lo que se fija aquí:
 *  - el enlace sale SOLO al aprobar, y el historial no lo guarda;
 *  - clave (8+, letras y números), perfil y Welcome van juntos o no va nada;
 *  - el enlace sirve UNA vez, y reenviarlo invalida el anterior.
 *
 * El actor es `sistema-lgs`: `enviado_por` del historial es clave foránea.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** PNG de 1×1: una foto válida para `files`. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe.runIf(RUN)("creación de perfil del niño (integración)", () => {
  let actor: string;
  let campaniaId: string;
  let classroomId: string;
  let welcomeId: string;
  let contractId: string;
  let childPersonId: string;
  const enviados: MensajeSaliente[] = [];
  const externalRef = `02-8${marca.replace(/\D/g, "1")}1-26#P${marca}`;

  const tokenDelUltimo = (): string => {
    const m = /crear-perfil\/([A-Za-z0-9_-]{43})/.exec(enviados.at(-1)?.mensaje ?? "");
    return m?.[1] ?? "";
  };
  const datos = (cambios: Partial<DatosPerfil> = {}): DatosPerfil => ({
    clave: "rocky2026",
    confirmacion: "rocky2026",
    sobreTi: "Tengo 8 años y vivo en Bogotá.",
    hobbies: "Fútbol y dibujar",
    fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-10`,
    welcomeId,
    foto: { nombre: "yo.png", mime: "image/png", bytes: PNG },
    ...cambios,
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
    campaniaId = (
      await crearCampania({
        actorUserId: actor,
        nombre: `Perfil ${marca}`,
        inicio: dias(0),
        cursoInicio: dias(30),
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
        nombre: `Perfil Jr ${marca}`,
        cupo: 5,
        timezone: "America/Bogota",
        holidayCountry: "CO",
        slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00", duracionMin: 60 }],
      })
    ).id;
    welcomeId = (
      await crearWelcome({
        actorUserId: actor,
        fecha: dias(10),
        horaLocal: "16:00",
        zona: "America/Bogota",
        duracionMin: 60,
        guiaUserId: actor,
        campaignId: campaniaId,
        pais: null,
        curso: null,
        classroomId: null,
        nivel: "ROOKIE",
        limiteUsuarios: 5,
      })
    ).id;
    const r = await crearReservaBeneficiario({
      actorUserId: actor,
      externalRef,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: dias(30),
      classroomId,
      titular: {
        nombres: "Mamá",
        apellidos: `Perfil${marca}`,
        docTipo: "CC",
        docNumero: `TP-${marca}`,
        countryCode: "CO",
        email: `perfil-${marca}@prueba.lgs`,
        telefono: "3001234567",
      },
      titularEsApoderado: true,
      nino: {
        nombres: "Rocky",
        apellidos: `Perfil${marca}`,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-10`,
        docTipo: "TI",
        docNumero: `NP-${marca}`,
        countryCode: "CO",
      },
      parentesco: "MADRE",
    });
    contractId = r.contractId;
    childPersonId = (
      await queryOne<{ id: string }>(
        `SELECT beneficiario_id AS id FROM contracts_contract WHERE id = $1`,
        [contractId],
      )
    )?.id as string;
  });

  afterAll(async () => {
    setSenderForTests(null);
    await execute(`DELETE FROM scheduling_welcome WHERE id = $1`, [welcomeId]);
    await execute(`DELETE FROM notifications_outbox WHERE child_person_id = $1`, [childPersonId]);
    await execute(`DELETE FROM files_object WHERE entidad = 'student_foto' AND entidad_id = $1`, [
      childPersonId,
    ]);
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM contracts_contract WHERE external_ref = $1`, [externalRef]);
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [`Perfil${marca}`]);
    await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("aprobar el contrato manda el enlace al apoderado, y el historial no lo guarda", async () => {
    const r = await aprobarContrato({ actorUserId: actor, contractId });
    expect(r.perfil?.enviado).toBe(true);
    expect(enviados.at(-1)?.destinatario).toBe("573001234567");
    expect(tokenDelUltimo()).toHaveLength(43);
    const guardado = await queryOne<{ mensaje: string }>(
      `SELECT mensaje FROM notifications_outbox WHERE child_person_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [childPersonId],
    );
    expect(guardado?.mensaje).toContain("(enlace personal)");
    expect(guardado?.mensaje).not.toContain(tokenDelUltimo());
  });

  it("el enlace muestra el usuario y los Welcome que le sirven", async () => {
    const f = await fichaPorEnlacePerfil(tokenDelUltimo());
    expect(f.estado).toBe("VIGENTE");
    if (f.estado !== "VIGENTE") return;
    expect(f.usuario).toBeTruthy();
    expect(f.welcomes.map((w) => w.id)).toContain(welcomeId);
    expect((await fichaPorEnlacePerfil("x".repeat(43))).estado).toBe("INVALIDO");
  });

  it("reenviar invalida el enlace anterior", async () => {
    const viejo = tokenDelUltimo();
    await reenviarEnlacePerfil({ actorUserId: actor, childPersonId, countryScope: null });
    expect(tokenDelUltimo()).not.toBe(viejo);
    expect((await fichaPorEnlacePerfil(viejo)).estado).toBe("REVOCADO");
    await expect(completarPerfilNino(viejo, datos())).rejects.toBeInstanceOf(ConflictError);
  });

  it("la clave pide 8 caracteres con letras y números, y el Welcome es obligatorio", async () => {
    const t = tokenDelUltimo();
    await expect(
      completarPerfilNino(t, datos({ clave: "rocky1", confirmacion: "rocky1" })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      completarPerfilNino(t, datos({ clave: "rockyrocky", confirmacion: "rockyrocky" })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(completarPerfilNino(t, datos({ welcomeId: "" }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    // Nada de eso dejó rastro: el enlace sigue sirviendo.
    expect((await fichaPorEnlacePerfil(t)).estado).toBe("VIGENTE");
  });

  it("completar guarda clave, perfil y Welcome juntos, y el enlace no sirve dos veces", async () => {
    const t = tokenDelUltimo();
    const r = await completarPerfilNino(t, datos());
    expect(r.welcome?.welcomeId).toBe(welcomeId);
    expect((await welcomeDeNino(childPersonId))?.welcomeId).toBe(welcomeId);

    const cuenta = await queryOne<{ debe: boolean }>(
      `SELECT u.debe_cambiar_password AS debe FROM identity_user u
         JOIN people_person p ON p.user_id = u.id WHERE p.id = $1`,
      [childPersonId],
    );
    expect(cuenta?.debe).toBe(false);
    const estado = await estadoPerfilNino(childPersonId, null);
    expect(estado.perfilCompletadoEn).not.toBeNull();
    expect(estado.hobbies).toBe("Fútbol y dibujar");
    expect(estado.enlace?.estado).toBe("USADO");

    await expect(completarPerfilNino(t, datos())).rejects.toBeInstanceOf(ConflictError);
    expect((await fichaPorEnlacePerfil(t)).estado).toBe("USADO");
    // Con el perfil hecho, ya no hay enlace que reenviar.
    await expect(
      reenviarEnlacePerfil({ actorUserId: actor, childPersonId, countryScope: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
