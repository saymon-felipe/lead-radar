export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  organizationId: number | null;
  organizationName: string | null;
  organizationSlug: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionResponse {
  token: string;
  user: AuthenticatedUser;
}
