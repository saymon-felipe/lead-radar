import type {
  AuthenticatedUser,
  AuthSessionResponse,
  AcceptInvitationPayload,
  AcceptInvitationResponse,
  Campaign,
  CampaignValidationReport,
  CommercialReport,
  CreateOrganizationPayload,
  CreateOrganizationResponse,
  DashboardMetrics,
  DiscoveryResult,
  DiscoverySearchLevel,
  DiscoveryStatus,
  DiscoveryStopResult,
  GeneratedMessage,
  Interaction,
  InviteMemberPayload,
  Lead,
  LeadEmbedding,
  LeadScore,
  OrganizationInvitation,
  OrganizationMember,
  ScoreWeightVersion,
  SimilarLead,
  SocialSnapshot,
  UserOrganization,
  WebsiteSnapshot
} from "./api-types";
import { request } from "./http";

export type * from "./api-types";
export * from "./formatters";
export { clearApiToken, setApiToken } from "./http";

export const api = {
  register: (payload: { name: string; email: string; password: string; organizationName?: string }) =>
    request<AuthSessionResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<AuthSessionResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request<AuthenticatedUser>("/api/auth/me"),
  invitation: (token: string) => request<OrganizationInvitation>(`/api/auth/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (token: string, payload: AcceptInvitationPayload) =>
    request<AcceptInvitationResponse>(`/api/auth/invitations/${encodeURIComponent(token)}/accept`, { method: "POST", body: JSON.stringify(payload) }),
  createOrganization: (payload: CreateOrganizationPayload) =>
    request<CreateOrganizationResponse>("/api/organizations", { method: "POST", body: JSON.stringify(payload) }),
  organizationMembers: () => request<OrganizationMember[]>("/api/organizations/current/members"),
  organizationInvitations: () => request<OrganizationInvitation[]>("/api/organizations/current/invitations"),
  inviteOrganizationMember: (payload: InviteMemberPayload) =>
    request<OrganizationInvitation>("/api/organizations/current/invitations", { method: "POST", body: JSON.stringify(payload) }),
  listOrganizations: () => request<UserOrganization[]>("/api/organizations"),
  switchOrganization: (orgId: number) =>
    request<AuthSessionResponse>(`/api/organizations/${orgId}/switch`, { method: "POST", body: "{}" }),
  dashboard: () => request<DashboardMetrics>("/api/dashboard"),
  campaigns: () => request<Campaign[]>("/api/campaigns"),
  createCampaign: (payload: Partial<Campaign>) =>
    request<Campaign>("/api/campaigns", { method: "POST", body: JSON.stringify(payload) }),
  updateCampaign: (id: number, payload: Partial<Campaign>) =>
    request<Campaign>(`/api/campaigns/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  campaignAction: (id: number, action: "start" | "pause" | "complete") =>
    request<Campaign>(`/api/campaigns/${id}/${action}`, { method: "POST", body: "{}" }),
  commercialReport: () => request<CommercialReport>("/api/reports/commercial"),
  campaignReport: (id: number) => request<CommercialReport>(`/api/campaigns/${id}/report`),
  campaignValidation: (id: number) => request<CampaignValidationReport>(`/api/campaigns/${id}/validation`),
  scoreCalibration: () =>
    request<ScoreWeightVersion>("/api/reports/score-calibration", { method: "POST", body: "{}" }),
  leads: (params = new URLSearchParams()) => request<Lead[]>(`/api/leads?${params.toString()}`),
  lead: (id: number) => request<Lead>(`/api/leads/${id}`),
  createLead: (payload: Partial<Lead>) => request<Lead>("/api/leads", { method: "POST", body: JSON.stringify(payload) }),
  importLeads: (payload: { campaignId?: number; csv: string }) =>
    request<{ imported: number; leads: Lead[] }>("/api/leads/import", { method: "POST", body: JSON.stringify(payload) }),
  scoreLead: (id: number) => request<LeadScore>(`/api/leads/${id}/score`, { method: "POST", body: "{}" }),
  analyzeWebsite: (id: number) => request<WebsiteSnapshot>(`/api/leads/${id}/analyze-website`, { method: "POST", body: "{}" }),
  analyzeSocial: (id: number) => request<SocialSnapshot>(`/api/leads/${id}/analyze-social`, { method: "POST", body: "{}" }),
  rebuildLeadEmbeddings: (id: number) =>
    request<{ created: number; embeddings: LeadEmbedding[] }>(`/api/leads/${id}/embeddings`, { method: "POST", body: "{}" }),
  similarLeads: (id: number) => request<SimilarLead[]>(`/api/leads/${id}/similar`),
  discoverCampaign: (id: number, level: DiscoverySearchLevel = "quick") =>
    request<DiscoveryResult>(`/api/campaigns/${id}/discover?level=${encodeURIComponent(level)}`, { method: "POST", body: "{}" }),
  stopCampaignDiscovery: (id: number) =>
    request<DiscoveryStopResult>(`/api/campaigns/${id}/discover/stop`, { method: "POST", body: "{}" }),
  discoveryStatus: (id: number) => request<DiscoveryStatus | null>(`/api/campaigns/${id}/discovery-status`),
  rebuildCampaignEmbeddings: (id: number) =>
    request<{ created: number; embeddings: LeadEmbedding[] }>(`/api/campaigns/${id}/embeddings/rebuild`, { method: "POST", body: "{}" }),
  reviewLead: (leadId: number) =>
    request<Record<string, unknown>>("/api/ai/review-lead", { method: "POST", body: JSON.stringify({ leadId }) }),
  generateMessage: (leadId: number) =>
    request<GeneratedMessage>("/api/ai/generate-message", { method: "POST", body: JSON.stringify({ leadId }) }),
  createInteraction: (leadId: number, payload: Partial<Interaction>) =>
    request<Interaction>(`/api/leads/${leadId}/interactions`, { method: "POST", body: JSON.stringify(payload) }),
  exportCampaignCsv: (campaignId: number) => request<string>(`/api/campaigns/${campaignId}/export/csv`)
};
