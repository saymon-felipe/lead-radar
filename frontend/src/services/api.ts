export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionResponse {
  token: string;
  user: AuthenticatedUser;
}

export interface DashboardMetrics {
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  contactedLeads: number;
  repliedLeads: number;
  wonDeals: number;
  potentialRevenue: number;
  responseRate: number;
  conversionRate: number;
  bestNiche?: string;
  bestCity?: string;
  bestScoreBand?: string;
  bestOffer?: string;
  aiCostPerQualifiedLead?: number;
  byTemperature?: DimensionReport[];
  byOffer?: DimensionReport[];
  nextCampaignSuggestions?: string[];
  lossReasons?: string[];
}

export interface DimensionReport {
  key: string;
  leads: number;
  contacted: number;
  replied: number;
  interested: number;
  meetings: number;
  proposals: number;
  won: number;
  lost: number;
  noResponse: number;
  responseRate: number;
  conversionRate: number;
  estimatedRevenue: number;
}

export interface CommercialReport {
  summary: DimensionReport & {
    validLeads: number;
    discardedCandidates: number;
    hotLeads: number;
    warmLeads: number;
    mediumLeads: number;
    coldLeads: number;
    leadsWithWebsite: number;
    leadsWithoutWebsite: number;
    leadsWithWhatsapp: number;
    leadsWithInstagram: number;
    leadsWithGoogleMaps: number;
    tokensUsed: number;
    aiCostEstimate: number;
    aiCostPerQualifiedLead: number;
    averageTicket: number;
  };
  byNiche: DimensionReport[];
  byCity: DimensionReport[];
  byScoreBand: DimensionReport[];
  byOffer: DimensionReport[];
  byChannel: DimensionReport[];
  byTemperature: DimensionReport[];
  bestNiche?: string;
  bestCity?: string;
  bestScoreBand?: string;
  bestOffer?: string;
  lossReasons: string[];
  nextCampaignSuggestions: string[];
}

export interface CampaignValidationReport {
  campaignId: number;
  collectedLeads: number;
  reviewedHotWarm: number;
  manualContacts: number;
  replies: number;
  wonDeals: number;
  estimatedRevenue: number;
  minimumSaleTargetMet: boolean;
  strongChannelTargetMet: boolean;
  interpretation: string;
  recommendedDecision: string;
  checklist: Array<{ label: string; current: number; target: number; done: boolean }>;
}

export interface ScoreWeightVersion {
  id: number;
  version: string;
  weights: Record<string, number>;
  rationale: string[];
  createdAt: string;
}

export interface Campaign {
  id: number;
  name: string;
  niche: string;
  city: string;
  state: string;
  status: string;
  targetQuantity?: number;
  metrics?: {
    leadsFound: number;
    hotLeads: number;
    warmLeads: number;
  };
}

export interface LeadScore {
  id: number;
  objectiveScore: number;
  digitalPresenceScore?: number;
  finalScore: number;
  temperature: string;
  recommendedOffer: string;
  scoreBreakdownJson: Array<{
    key: string;
    label: string;
    points: number;
    applied: boolean;
  }>;
}

export interface Lead {
  id: number;
  campaignId?: number;
  businessName: string;
  personName?: string;
  niche: string;
  city: string;
  state: string;
  whatsapp?: string;
  email?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  googleMapsUrl?: string;
  professionalRegistry?: string;
  documentStatus?: string;
  score?: LeadScore;
  latestInteraction?: Interaction;
  interactions?: Interaction[];
  messages?: GeneratedMessage[];
  digitalPresence?: DigitalPresence;
  websiteSnapshots?: WebsiteSnapshot[];
  socialSnapshots?: SocialSnapshot[];
  embeddings?: LeadEmbedding[];
  aiReviews?: Array<{ id: number; analysisType: string; summary?: string; outputJson: Record<string, unknown> }>;
}

export interface DigitalPresence {
  websiteQualityScore?: number;
  socialPresenceScore?: number;
  hasOnlySocialMedia: boolean;
  websiteDetectedIssuesJson: string[];
}

export interface WebsiteSnapshot {
  id: number;
  url: string;
  httpStatus?: number;
  title?: string;
  metaDescription?: string;
  h1?: string;
  headingsJson: string[];
  platform?: string;
  hasSsl: boolean;
  loadTimeMs?: number;
  hasWhatsapp: boolean;
  hasContactForm: boolean;
  hasCta: boolean;
  hasServices: boolean;
  detectedIssuesJson: string[];
  aiReview?: {
    websiteQualityScore: number;
    commercialOpportunity: string;
    problems: string[];
    strengths: string[];
    salesAngle: string;
    confidence: number;
  };
}

export interface SocialSnapshot {
  id: number;
  platform: string;
  profileUrl: string;
  bioText?: string;
  externalLink?: string;
  hasWhatsapp: boolean;
  hasWebsiteLink: boolean;
  contentSignalsJson: string[];
  aiReview?: {
    socialPresenceScore: number;
    dependsOnlyOnSocialMedia: boolean;
    opportunity: string;
    problems: string[];
    strengths: string[];
    salesAngle: string;
    confidence: number;
  };
}

export interface LeadEmbedding {
  id: number;
  embeddingType: string;
  sourceText: string;
  model: string;
  metadataJson?: Record<string, unknown>;
}

export interface SimilarLead {
  leadId?: number;
  embeddingId: number;
  embeddingType: string;
  sourceText: string;
  similarity: number;
  lead?: Lead;
}

export interface DiscoveryResult {
  collected: number;
  filtered: number;
  reviewed: number;
  inserted: number;
  cancelled?: boolean;
  candidates: Array<{
    id: number;
    title: string;
    url: string;
    priority: string;
    status: string;
    reason: string;
    leadId?: number;
  }>;
  leads: Lead[];
}

export interface DiscoveryStopResult {
  stopped: boolean;
}

export interface DiscoveryTraceEvent {
  id: number;
  at: string;
  kind: "step" | "search_results" | "ai_request" | "ai_response" | "result";
  title: string;
  detail?: string;
  leadName?: string;
  url?: string;
  payload?: unknown;
  response?: unknown;
}

export interface DiscoveryStatus {
  campaignId: number;
  running: boolean;
  startedAt: string;
  updatedAt: string;
  currentStep?: string;
  currentProfessional?: string;
  stats: {
    collected: number;
    extractedProfessionals: number;
    reviewed: number;
    inserted: number;
  };
  events: DiscoveryTraceEvent[];
}

export interface Interaction {
  id: number;
  leadId: number;
  status: string;
  contactChannel?: string;
  notes?: string;
  contactedAt?: string;
  responseAt?: string;
}

export interface GeneratedMessage {
  id: number;
  leadId: number;
  channel: string;
  content: string;
  tone: string;
}

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
let authToken = "";

const temperatureLabels: Record<string, string> = {
  hot: "Hot",
  warm: "Warm",
  medium: "Médio",
  cold: "Cold",
  discard: "Descartar",
  sem_score: "Sem score"
};

const offerLabels: Record<string, string> = {
  landing_page: "Landing page",
  institutional_site: "Site institucional",
  redesign: "Redesign",
  seo_local: "SEO local",
  maintenance: "Manutenção",
  no_offer: "Sem oferta",
  digital_presence_organization: "Organização da presença digital",
  google_business_optimization: "Otimização Google Business",
  none: "Nenhuma"
};

const interactionStatusLabels: Record<string, string> = {
  not_contacted: "Não contatado",
  contacted: "Contatado",
  replied: "Respondeu",
  interested: "Interessado",
  meeting_scheduled: "Reunião agendada",
  proposal_sent: "Proposta enviada",
  won: "Ganho",
  lost: "Perdido",
  no_response: "Sem resposta",
  invalid_contact: "Contato inválido"
};

const campaignStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  running: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  failed: "Falhou"
};

const decisionLabels: Record<string, string> = {
  continue_niche: "Continuar no nicho",
  adjust_niche: "Ajustar nicho",
  adjust_offer: "Ajustar oferta",
  adjust_message: "Ajustar mensagem",
  adjust_scoring: "Ajustar scoring"
};

const analysisTypeLabels: Record<string, string> = {
  lead_final_review: "Revisão final do lead",
  message_generation: "Geração de mensagem",
  website_review: "Análise do site",
  social_review: "Análise social",
  search_candidate_review: "Revisão de candidatos"
};

const embeddingTypeLabels: Record<string, string> = {
  lead_profile: "Perfil do lead",
  ideal_profile: "Perfil ideal",
  website_summary: "Resumo do site",
  social_summary: "Resumo social",
  conversion_profile: "Perfil convertido",
  lost_profile: "Perfil perdido"
};

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  google_maps: "Google Maps",
  unknown: "Desconhecida"
};

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function setApiToken(token: string) {
  authToken = token;
}

export function clearApiToken() {
  authToken = "";
}

export function formatTemperatureLabel(value?: string): string {
  if (!value) return "-";
  return temperatureLabels[value] ?? humanizeKey(value);
}

export function formatOfferLabel(value?: string): string {
  if (!value) return "-";
  return offerLabels[value] ?? humanizeKey(value);
}

export function formatInteractionStatusLabel(value?: string): string {
  if (!value) return "-";
  return interactionStatusLabels[value] ?? humanizeKey(value);
}

export function formatCampaignStatusLabel(value?: string): string {
  if (!value) return "-";
  return campaignStatusLabels[value] ?? humanizeKey(value);
}

export function formatDecisionLabel(value?: string): string {
  if (!value) return "-";
  return decisionLabels[value] ?? humanizeKey(value);
}

export function formatAnalysisTypeLabel(value?: string): string {
  if (!value) return "-";
  return analysisTypeLabels[value] ?? humanizeKey(value);
}

export function formatEmbeddingTypeLabel(value?: string): string {
  if (!value) return "-";
  return embeddingTypeLabels[value] ?? humanizeKey(value);
}

export function formatPlatformLabel(value?: string): string {
  if (!value) return "-";
  return platformLabels[value] ?? humanizeKey(value);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("content-type") && options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (authToken) {
    headers.set("authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(payload.message ?? "Falha na requisição");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/csv")) {
    return (await response.text()) as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  register: (payload: { name: string; email: string; password: string }) =>
    request<AuthSessionResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<AuthSessionResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request<AuthenticatedUser>("/api/auth/me"),
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
  discoverCampaign: (id: number) => request<DiscoveryResult>(`/api/campaigns/${id}/discover`, { method: "POST", body: "{}" }),
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
