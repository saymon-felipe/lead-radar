import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
import type { AppUser } from "../../shared/types.js";
import { createSessionToken } from "../../shared/auth/jwt.js";
import { hashPassword, verifyPassword } from "../../shared/auth/password.js";

function sanitizeUser(user: AppUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function findUserByEmail(email: string): AppUser | undefined {
  return Array.from(store.users.values()).find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function listUsersCount(): number {
  return store.users.size;
}

export function registerUser(input: { name: string; email: string; password: string }) {
  if (findUserByEmail(input.email)) {
    throw new HttpError(409, "Já existe uma conta com este e-mail");
  }
  const now = new Date().toISOString();
  const user: AppUser = {
    id: store.nextId("user"),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    passwordHash: hashPassword(input.password),
    role: "admin",
    createdAt: now,
    updatedAt: now
  };
  store.users.set(user.id, user);
  return {
    token: createSessionToken(user),
    user: sanitizeUser(user)
  };
}

export function loginUser(input: { email: string; password: string }) {
  const user = findUserByEmail(input.email);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new HttpError(401, "E-mail ou senha inválidos");
  }
  return {
    token: createSessionToken(user),
    user: sanitizeUser(user)
  };
}

export function getUserById(userId: number) {
  const user = store.users.get(userId);
  if (!user) throw new HttpError(404, "Usuário não encontrado");
  return sanitizeUser(user);
}
