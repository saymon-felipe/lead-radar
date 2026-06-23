import { createHmac } from "node:crypto";
import type { AuthSessionPayload, AppUser, UserRole } from "../types.js";

const HEADER = {
  alg: "HS256",
  typ: "JWT"
};

const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60 * 12;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf-8");
}

function secret(): string {
  return process.env.JWT_SECRET ?? "lead-radar-dev-secret";
}

function signatureFor(input: string): string {
  return createHmac("sha256", secret())
    .update(input)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createSessionToken(
  user: Pick<AppUser, "id" | "email" | "name">,
  organization: { id: number; name: string; role: UserRole } | null,
  expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthSessionPayload = {
    sub: String(user.id),
    email: user.email,
    name: user.name,
    role: organization?.role ?? "viewer",
    organizationId: (organization?.id ?? null) as number,
    organizationName: (organization?.name ?? null) as string,
    iat: now,
    exp: now + expiresInSeconds
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(HEADER));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signatureFor(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): AuthSessionPayload | undefined {
  const [encodedHeader, encodedPayload, providedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !providedSignature) return undefined;
  const expectedSignature = signatureFor(`${encodedHeader}.${encodedPayload}`);
  if (expectedSignature !== providedSignature) return undefined;

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as AuthSessionPayload;
    if (typeof parsed.exp !== "number" || parsed.exp < Math.floor(Date.now() / 1000)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function bearerTokenFromAuthorizationHeader(header?: string): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}
