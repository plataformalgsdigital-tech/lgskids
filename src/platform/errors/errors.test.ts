import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  isAppError,
} from "./index";

describe("jerarquía de errores", () => {
  it.each([
    [new ValidationError("x"), 400, "VALIDATION_ERROR"],
    [new UnauthorizedError("x"), 401, "UNAUTHORIZED"],
    [new ForbiddenError("x"), 403, "FORBIDDEN"],
    [new NotFoundError("x"), 404, "NOT_FOUND"],
    [new ConflictError("x"), 409, "CONFLICT"],
  ])("%s mapea a su status y código", (error, status, code) => {
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(isAppError(error)).toBe(true);
  });

  it("conserva detalles y causa", () => {
    const cause = new Error("raíz");
    const error = new ConflictError("Cupo lleno", { cause, details: { salonId: "abc" } });
    expect(error.details).toEqual({ salonId: "abc" });
    expect(error.cause).toBe(cause);
  });

  it("los errores ajenos no son AppError", () => {
    expect(isAppError(new Error("cualquiera"))).toBe(false);
    expect(isAppError("texto")).toBe(false);
  });
});
