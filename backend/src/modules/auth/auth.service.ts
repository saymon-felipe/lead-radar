import { prisma } from "../../shared/prisma.js";
import { createSessionToken } from "../../shared/auth/jwt.js";
import { hashPassword, verifyPassword } from "../../shared/auth/password.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { UserRole } from "../../shared/types.js";

export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "organizacao"
  );
}

export function sanitizeUser(input: {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  membership: {
    role: UserRole;
    organization: { id: number; name: string; slug: string };
  } | null;
}) {
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    role: input.membership?.role ?? "viewer",
    organizationId: input.membership?.organization.id ?? null,
    organizationName: input.membership?.organization.name ?? null,
    organizationSlug: input.membership?.organization.slug ?? null,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString()
  };
}

export async function uniqueOrganizationSlug(baseName: string): Promise<string> {
  const base = slugify(baseName);
  let candidate = base;
  let suffix = 2;
  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function defaultMembershipForUser(userId: number) {
  return prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { organization: true }
  });
}

export function createSessionForMembership(input: {
  user: {
    id: number;
    name: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  };
  membership: {
    role: UserRole;
    organization: { id: number; name: string; slug: string };
  } | null;
}) {
  const token = createSessionToken(input.user, input.membership ? {
    id: input.membership.organization.id,
    name: input.membership.organization.name,
    role: input.membership.role
  } : null);

  return {
    token,
    user: sanitizeUser({ ...input.user, membership: input.membership })
  };
}

export async function registerUser(input: { name: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, "Ja existe uma conta com este e-mail");
  }

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      passwordHash: hashPassword(input.password),
      role: "admin"
    }
  });

  return createSessionForMembership({
    user,
    membership: null
  });
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.trim().toLowerCase() }
  });
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new HttpError(401, "E-mail ou senha invalidos");
  }

  const membership = await defaultMembershipForUser(user.id);
  
  return createSessionForMembership({
    user,
    membership: membership ? { ...membership, role: membership.role as UserRole } : null
  });
}

export async function getUserById(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "Usuario nao encontrado");

  const membership = await defaultMembershipForUser(user.id);
  return sanitizeUser({ ...user, membership: membership ? { ...membership, role: membership.role as UserRole } : null });
}
