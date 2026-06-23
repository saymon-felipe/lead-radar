import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../shared/prisma.js";
import { hashPassword, verifyPassword } from "../../shared/auth/password.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { sendMail } from "../../shared/email/mailer.js";
import type { AuthContext, UserRole } from "../../shared/types.js";
import { createSessionForMembership, uniqueOrganizationSlug } from "../auth/auth.service.js";

const INVITATION_TTL_DAYS = 7;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function invitationTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function frontendUrl(): string {
  return (process.env.FRONTEND_URL ?? process.env.CORS_ORIGIN ?? "http://localhost:5173").replace(/\/$/, "");
}

function serializeInvitation(record: {
  id: number;
  email: string;
  role: string;
  acceptedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  organization: { id: number; name: string; slug: string };
}) {
  return {
    id: record.id,
    email: record.email,
    role: record.role,
    acceptedAt: record.acceptedAt?.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    expired: record.expiresAt.getTime() < Date.now(),
    organization: {
      id: record.organization.id,
      name: record.organization.name,
      slug: record.organization.slug
    }
  };
}

async function invitationFromToken(token: string) {
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: invitationTokenHash(token) },
    include: { organization: true }
  });

  if (!invitation) {
    throw new HttpError(404, "Convite nao encontrado");
  }

  return invitation;
}

export async function createOrganization(context: AuthContext, input: { name: string }) {
  const user = await prisma.user.findUnique({ where: { id: context.userId } });
  if (!user) throw new HttpError(404, "Usuario nao encontrado");

  const organizationName = input.name.trim();
  const slug = await uniqueOrganizationSlug(organizationName);

  const created = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: organizationName,
        slug
      }
    });

    const membership = await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "admin"
      },
      include: { organization: true }
    });

    return { membership };
  });

  return createSessionForMembership({
    user,
    membership: { ...created.membership, role: created.membership.role as UserRole }
  });
}

export async function listOrganizationMembers(context: AuthContext) {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: context.organizationId },
    include: { user: true },
    orderBy: { createdAt: "asc" }
  });

  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
    createdAt: member.createdAt.toISOString()
  }));
}

export async function listOrganizationInvitations(context: AuthContext) {
  const invitations = await prisma.organizationInvitation.findMany({
    where: { organizationId: context.organizationId },
    include: { organization: true },
    orderBy: { createdAt: "desc" }
  });

  return invitations.map(serializeInvitation);
}

export async function inviteOrganizationMember(context: AuthContext, input: { email: string; role: UserRole }) {
  const email = normalizeEmail(input.email);
  const organization = await prisma.organization.findUnique({ where: { id: context.organizationId } });
  if (!organization) throw new HttpError(404, "Organizacao nao encontrada");

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: context.organizationId,
          userId: existingUser.id
        }
      }
    });
    if (existingMembership) {
      throw new HttpError(409, "Usuario ja faz parte desta empresa");
    }
  }

  const token = randomBytes(32).toString("base64url");
  const inviteUrl = `${frontendUrl()}/invite/${token}`;
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await prisma.organizationInvitation.create({
    data: {
      organizationId: context.organizationId,
      email,
      role: input.role,
      tokenHash: invitationTokenHash(token),
      invitedBy: context.userId,
      expiresAt
    },
    include: { organization: true }
  });

  await sendMail({
    to: email,
    subject: `Convite para entrar na empresa ${organization.name} no Lead Radar`,
    text: [
      `Voce foi convidado para entrar na empresa ${organization.name} no Lead Radar.`,
      `Acesse o convite: ${inviteUrl}`,
      `Este convite expira em ${INVITATION_TTL_DAYS} dias.`
    ].join("\n\n"),
    html: `
      <p>Voce foi convidado para entrar na empresa <strong>${organization.name}</strong> no Lead Radar.</p>
      <p><a href="${inviteUrl}">Aceitar convite</a></p>
      <p>Este convite expira em ${INVITATION_TTL_DAYS} dias.</p>
    `
  });

  return {
    ...serializeInvitation(invitation),
    devInviteUrl: process.env.SMTP_HOST ? undefined : inviteUrl
  };
}

export async function invitationDetails(token: string) {
  const invitation = await invitationFromToken(token);
  const user = await prisma.user.findUnique({ where: { email: invitation.email } });

  return {
    ...serializeInvitation(invitation),
    userExists: Boolean(user)
  };
}

export async function acceptInvitation(token: string, input: { name?: string; password: string }) {
  const invitation = await invitationFromToken(token);
  if (invitation.acceptedAt) throw new HttpError(409, "Convite ja foi aceito");
  if (invitation.expiresAt.getTime() < Date.now()) throw new HttpError(410, "Convite expirado");

  const email = invitation.email;
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser && !verifyPassword(input.password, existingUser.passwordHash)) {
    throw new HttpError(401, "Senha invalida para o e-mail convidado");
  }

  if (!existingUser && !input.name?.trim()) {
    throw new HttpError(400, "Nome e obrigatorio para criar a conta");
  }

  const result = await prisma.$transaction(async (tx) => {
    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          name: input.name!.trim(),
          email,
          passwordHash: hashPassword(input.password),
          role: invitation.role
        }
      }));

    const existingMembership = await tx.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: user.id
        }
      },
      include: { organization: true }
    });

    const membership =
      existingMembership ??
      (await tx.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role
        },
        include: { organization: true }
      }));

    await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        acceptedAt: new Date(),
        acceptedBy: user.id
      }
    });

    return { user, membership };
  });

  return createSessionForMembership({
    user: result.user,
    membership: { ...result.membership, role: result.membership.role as UserRole }
  });
}

export async function listUserOrganizations(userId: number) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" }
  });

  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role,
    createdAt: m.organization.createdAt.toISOString()
  }));
}

export async function switchOrganization(userId: number, organizationId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "Usuário não encontrado");

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId
      }
    },
    include: { organization: true }
  });

  if (!membership) {
    throw new HttpError(403, "Você não faz parte desta empresa");
  }

  return createSessionForMembership({
    user,
    membership: { ...membership, role: membership.role as UserRole }
  });
}
