import { describe, expect, it } from "vitest";
import {
  DIAS_VIGENCIA_INVITACION,
  enlaceInvitacion,
  estadoInvitacion,
  hashTokenInvitacion,
  nuevoTokenInvitacion,
  vencimientoInvitacion,
} from "../domain/invitacion";

/**
 * El token del enlace es la ÚNICA credencial de la puerta pública
 * /nuevo-guia. Lo que lo sostiene se prueba aquí.
 */

const AHORA = new Date("2026-08-29T12:00:00Z");

describe("token de invitación", () => {
  it("no se repite", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => nuevoTokenInvitacion()));
    expect(tokens.size).toBe(200);
  });

  it("viaja en la URL sin necesitar escape", () => {
    for (let i = 0; i < 50; i++) {
      const t = nuevoTokenInvitacion();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(t)).toBe(t);
    }
  });

  it("el hash es estable y no deja ver el token", () => {
    const t = nuevoTokenInvitacion();
    expect(hashTokenInvitacion(t)).toBe(hashTokenInvitacion(t));
    expect(hashTokenInvitacion(t)).not.toContain(t);
    expect(hashTokenInvitacion(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("estado del enlace", () => {
  const vigente = { expiraEn: new Date("2026-09-05T12:00:00Z"), usadoEn: null, revocadoEn: null };

  it("está vigente antes de vencer, sin usar ni revocar", () => {
    expect(estadoInvitacion(vigente, AHORA)).toBe("VIGENTE");
  });

  it("vence exactamente al llegar la fecha (el borde NO sirve)", () => {
    const justo = { ...vigente, expiraEn: AHORA };
    expect(estadoInvitacion(justo, AHORA)).toBe("VENCIDA");
  });

  it("usado gana a vencido: un enlace consumido no revive ni se reabre", () => {
    const usadoYVencido = {
      expiraEn: new Date("2026-08-01T00:00:00Z"),
      usadoEn: new Date("2026-07-30T00:00:00Z"),
      revocadoEn: null,
    };
    expect(estadoInvitacion(usadoYVencido, AHORA)).toBe("USADA");
  });

  it("revocado gana a vencido", () => {
    const revocadoYVencido = {
      expiraEn: new Date("2026-08-01T00:00:00Z"),
      usadoEn: null,
      revocadoEn: new Date("2026-07-30T00:00:00Z"),
    };
    expect(estadoInvitacion(revocadoYVencido, AHORA)).toBe("REVOCADA");
  });
});

describe("vigencia y enlace", () => {
  it("vence a los días declarados", () => {
    const hasta = vencimientoInvitacion(AHORA);
    const dias = (hasta.getTime() - AHORA.getTime()) / (24 * 60 * 60 * 1000);
    expect(dias).toBe(DIAS_VIGENCIA_INVITACION);
  });

  it("arma la URL sin duplicar la barra del dominio", () => {
    expect(enlaceInvitacion("https://kids.test/", "abc")).toBe(
      "https://kids.test/nuevo-guia?t=abc",
    );
    expect(enlaceInvitacion("https://kids.test", "abc")).toBe("https://kids.test/nuevo-guia?t=abc");
  });
});
