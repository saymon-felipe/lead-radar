import type { AuthSessionResponse } from "./auth";

export type OrganizationRole = "admin" | "manager" | "operator" | "viewer";

export interface OrganizationMember {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: OrganizationRole;
  createdAt: string;
}

export interface OrganizationInvitation {
  id: number;
  email: string;
  role: OrganizationRole;
  acceptedAt?: string;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
  userExists?: boolean;
  devInviteUrl?: string;
  organization: {
    id: number;
    name: string;
    slug: string;
  };
}

export interface CreateOrganizationPayload {
  name: string;
}

export interface InviteMemberPayload {
  email: string;
  role: OrganizationRole;
}

export interface AcceptInvitationPayload {
  name?: string;
  password: string;
}

export interface UserOrganization {
  id: number;
  name: string;
  slug: string;
  role: OrganizationRole;
  createdAt: string;
}

export type CreateOrganizationResponse = AuthSessionResponse;
export type AcceptInvitationResponse = AuthSessionResponse;
