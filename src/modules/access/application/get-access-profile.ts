import type { AccessRepositoryPort } from "./ports";
import { AccessProfile } from "./profile";
import { PgAccessRepository } from "../infrastructure/access-repository";

let repository: AccessRepositoryPort = new PgAccessRepository();

/** Solo para pruebas. */
export function setAccessRepositoryForTests(repo: AccessRepositoryPort | null): void {
  repository = repo ?? new PgAccessRepository();
  cache.clear();
}

/**
 * Caché de LECTURA con TTL corto (60 s). Es solo memoria local de proceso:
 * segura ante réplicas (cada una resuelve de la base como máximo cada 60 s)
 * y ante reinicios (se reconstruye sola). No guarda estado de negocio
 * (trampa 2.8.5 no aplica a cachés de lectura con TTL).
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { profile: AccessProfile; expiraEn: number }>();

export async function getAccessProfile(userId: string): Promise<AccessProfile> {
  const hit = cache.get(userId);
  if (hit !== undefined && hit.expiraEn > Date.now()) {
    return hit.profile;
  }
  const data = await repository.getProfile(userId);
  const profile = new AccessProfile(data);
  cache.set(userId, { profile, expiraEn: Date.now() + CACHE_TTL_MS });
  return profile;
}

/** Invalidar tras asignar/quitar roles para que el cambio aplique ya. */
export function invalidateAccessProfile(userId: string): void {
  cache.delete(userId);
}

/** Invalidar TODO (tras editar los permisos de un rol). */
export function invalidateAllProfiles(): void {
  cache.clear();
}

export function accessRepository(): AccessRepositoryPort {
  return repository;
}

/** Roles disponibles (para la UI de gestión de usuarios). */
export async function listarRoles(): Promise<
  { code: string; nombre: string; descripcion: string | null }[]
> {
  return repository.listRoles();
}
