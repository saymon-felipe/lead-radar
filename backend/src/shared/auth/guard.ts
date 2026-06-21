import type { FastifyRequest } from "fastify";
import { HttpError } from "../errors/http-error.js";
import { bearerTokenFromAuthorizationHeader, verifySessionToken } from "./jwt.js";
import type { AuthSessionPayload } from "../types.js";

interface AuthenticatedRequest extends FastifyRequest {
  authUser?: AuthSessionPayload;
}

export function getAuthUser(request: FastifyRequest): AuthSessionPayload | undefined {
  return (request as AuthenticatedRequest).authUser;
}

export function requireAuthUser(request: FastifyRequest): AuthSessionPayload {
  const session = getAuthUser(request);
  if (!session) throw new HttpError(401, "Sessão inválida");
  return session;
}

export async function authenticateRequest(request: FastifyRequest): Promise<void> {
  const token = bearerTokenFromAuthorizationHeader(request.headers.authorization);
  if (!token) {
    throw new HttpError(401, "Token de acesso ausente");
  }
  const session = verifySessionToken(token);
  if (!session) {
    throw new HttpError(401, "Token de acesso inválido ou expirado");
  }
  (request as AuthenticatedRequest).authUser = session;
}
