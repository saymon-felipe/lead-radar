import type { FastifyRequest } from "fastify";
import { HttpError } from "../errors/http-error.js";
import { bearerTokenFromAuthorizationHeader, verifySessionToken } from "./jwt.js";
import type { AuthContext, AuthSessionPayload, UserRole } from "../types.js";

interface AuthenticatedRequest extends FastifyRequest {
  authUser?: AuthSessionPayload;
  authContext?: AuthContext;
}

export function getAuthUser(request: FastifyRequest): AuthSessionPayload | undefined {
  return (request as AuthenticatedRequest).authUser;
}

export function requireAuthUser(request: FastifyRequest): AuthSessionPayload {
  const session = getAuthUser(request);
  if (!session) throw new HttpError(401, "Sessão inválida");
  return session;
}

export function getAuthContext(request: FastifyRequest): AuthContext | undefined {
  return (request as AuthenticatedRequest).authContext;
}

export function requireAuthContext(request: FastifyRequest): AuthContext {
  const context = getAuthContext(request);
  if (!context) throw new HttpError(401, "Sessão inválida");
  return context;
}

const ROLE_LEVEL: Record<UserRole, number> = {
  viewer: 1,
  operator: 2,
  manager: 3,
  admin: 4
};

export function requireRole(request: FastifyRequest, minimumRole: UserRole): AuthContext {
  const context = requireAuthContext(request);
  if (ROLE_LEVEL[context.role] < ROLE_LEVEL[minimumRole]) {
    throw new HttpError(403, "Permissão insuficiente para esta ação");
  }
  return context;
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
  (request as AuthenticatedRequest).authContext = {
    userId: Number(session.sub),
    organizationId: session.organizationId,
    organizationName: session.organizationName,
    role: session.role,
    email: session.email,
    name: session.name
  };
}
