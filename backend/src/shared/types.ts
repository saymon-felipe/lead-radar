export type CampaignStatus = "draft" | "running" | "paused" | "completed" | "failed";
export type Temperature = "hot" | "warm" | "medium" | "cold" | "discard";
export type UserRole = "admin" | "manager" | "operator" | "viewer";
export type RecommendedOffer =
  | "landing_page"
  | "institutional_site"
  | "redesign"
  | "seo_local"
  | "google_business_optimization"
  | "digital_presence_organization"
  | "maintenance"
  | "no_offer";
export type InteractionStatus =
  | "not_contacted"
  | "contacted"
  | "replied"
  | "interested"
  | "meeting_scheduled"
  | "proposal_sent"
  | "won"
  | "lost"
  | "no_response"
  | "invalid_contact";

export interface Campaign {
  id: number;
  organizationId: number;
  name: string;
  niche: string;
  city: string;
  state: string;
  country: string;
  status: CampaignStatus;
  targetQuantity?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppUser {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: number;
  organizationName: string;
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: number;
  organizationId: number;
  organizationName: string;
  role: UserRole;
  email: string;
  name: string;
}

export interface Lead {
  id: number;
  organizationId: number;
  campaignId?: number;
  businessName: string;
  personName?: string;
  niche: string;
  documentNumber?: string;
  documentStatus?: string;
  professionalRegistry?: string;
  city: string;
  state: string;
  country: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  linkedinUrl?: string;
  googleMapsUrl?: string;
  source?: string;
  rawDataJson?: Record<string, unknown>;
  websiteSignals?: WebsiteSignals;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteSignals {
  hasSsl?: boolean;
  isSlow?: boolean;
  isOutdated?: boolean;
  hasCta?: boolean;
  hasWhatsappCta?: boolean;
  hasSeoTitle?: boolean;
  hasMetaDescription?: boolean;
}

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  points: number;
  applied: boolean;
}

export interface LeadScore {
  id: number;
  organizationId: number;
  leadId: number;
  objectiveScore: number;
  aiCommercialScore?: number;
  digitalPresenceScore?: number;
  embeddingSimilarityScore?: number;
  finalScore: number;
  temperature: Temperature;
  recommendedOffer: RecommendedOffer;
  scoreBreakdownJson: ScoreBreakdownItem[];
  aiReasoning?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DigitalPresence {
  id: number;
  organizationId: number;
  leadId: number;
  hasWebsite: boolean;
  websiteUrl?: string;
  websitePlatform?: string;
  hasInstagram: boolean;
  hasFacebook: boolean;
  hasLinkedin: boolean;
  hasGoogleMaps: boolean;
  hasWhatsapp: boolean;
  hasLinktree: boolean;
  hasOnlySocialMedia: boolean;
  websiteHttpStatus?: number;
  websiteLoadTimeMs?: number;
  websiteHasSsl?: boolean;
  websiteIsMobileFriendly?: boolean;
  websiteHasCta?: boolean;
  websiteHasWhatsappCta?: boolean;
  websiteHasContactForm?: boolean;
  websiteHasSeoTitle?: boolean;
  websiteHasMetaDescription?: boolean;
  websiteDetectedIssuesJson: string[];
  websiteQualityScore?: number;
  socialPresenceScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteSnapshot {
  id: number;
  organizationId: number;
  leadId: number;
  url: string;
  httpStatus?: number;
  title?: string;
  metaDescription?: string;
  h1?: string;
  headingsJson: string[];
  textSummary?: string;
  textSample?: string;
  platform?: string;
  hasSsl: boolean;
  loadTimeMs?: number;
  hasWhatsapp: boolean;
  hasContactForm: boolean;
  hasCta: boolean;
  hasLocation: boolean;
  hasServices: boolean;
  hasTestimonials: boolean;
  detectedIssuesJson: string[];
  rawMetricsJson: Record<string, unknown>;
  snapshotHash: string;
  aiReview?: WebsiteAiReview;
  createdAt: string;
}

export interface WebsiteAiReview {
  websiteQualityScore: number;
  commercialOpportunity: "none" | "landing_page" | "redesign" | "seo_local" | "maintenance";
  problems: string[];
  strengths: string[];
  salesAngle: string;
  confidence: number;
}

export interface SocialSnapshot {
  id: number;
  organizationId: number;
  leadId: number;
  platform: "instagram" | "facebook" | "linkedin" | "google_maps" | "unknown";
  profileUrl: string;
  bioText?: string;
  externalLink?: string;
  hasWhatsapp: boolean;
  hasWebsiteLink: boolean;
  estimatedPostCount?: number;
  lastActivitySignal?: "recent" | "stale" | "unknown";
  contentSignalsJson: string[];
  rawMetricsJson: Record<string, unknown>;
  snapshotHash: string;
  aiReview?: SocialAiReview;
  createdAt: string;
}

export interface SocialAiReview {
  socialPresenceScore: number;
  dependsOnlyOnSocialMedia: boolean;
  opportunity: "none" | "landing_page" | "institutional_site" | "seo_local" | "digital_presence_organization";
  problems: string[];
  strengths: string[];
  salesAngle: string;
  confidence: number;
}

export type EmbeddingType =
  | "search_result"
  | "website_summary"
  | "social_summary"
  | "lead_profile"
  | "conversion_profile"
  | "lost_profile"
  | "sales_message"
  | "ideal_profile";

export interface LeadEmbedding {
  id: number;
  organizationId: number;
  leadId?: number;
  embeddingType: EmbeddingType;
  sourceText: string;
  embeddingVector: number[];
  model: string;
  metadataJson?: Record<string, unknown>;
  createdAt: string;
}

export interface SimilarLeadResult {
  leadId?: number;
  embeddingId: number;
  embeddingType: EmbeddingType;
  sourceText: string;
  similarity: number;
  lead?: Lead;
}

export interface DiscoveryCandidate {
  id: number;
  organizationId: number;
  campaignId: number;
  title: string;
  url: string;
  snippet: string;
  source: string;
  priority: "high" | "medium" | "low" | "discard";
  isPotentialLead: boolean;
  reason: string;
  status: "inserted" | "discarded" | "duplicate" | "pending";
  leadId?: number;
  createdAt: string;
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
  recommendedDecision: "continue_niche" | "adjust_niche" | "adjust_offer" | "adjust_message" | "adjust_scoring";
  checklist: Array<{ label: string; current: number; target: number; done: boolean }>;
}

export interface ScoreWeightVersion {
  id: number;
  organizationId: number;
  version: string;
  weights: {
    objective: number;
    aiCommercial: number;
    digitalPresence: number;
    embeddingSimilarity: number;
  };
  rationale: string[];
  createdAt: string;
}

export interface AiReview {
  id: number;
  organizationId: number;
  leadId?: number;
  analysisType:
    | "lead_final_review"
    | "message_generation"
    | "website_review"
    | "social_review"
    | "search_candidate_review"
    | "aggregator_professional_extraction";
  model: string;
  promptVersion: string;
  inputHash: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  tokensInput?: number;
  tokensOutput?: number;
  costEstimate?: number;
  summary?: string;
  createdAt: string;
}

export interface AiCacheEntry {
  id: number;
  organizationId: number;
  entityType: string;
  entityId: string;
  analysisType: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  tokensInput?: number;
  tokensOutput?: number;
  costEstimate?: number;
  createdAt: string;
}

export interface CommercialInteraction {
  id: number;
  organizationId: number;
  leadId: number;
  status: InteractionStatus;
  contactChannel?: string;
  contactedAt?: string;
  responseAt?: string;
  notes?: string;
  nextActionAt?: string;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedMessage {
  id: number;
  organizationId: number;
  leadId: number;
  messageType: string;
  channel: "whatsapp" | "email" | "instagram";
  content: string;
  tone: string;
  createdAt: string;
}

export interface WorkerDevice {
  id: number;
  deviceId: string;
  userId: number;
  organizationId: number;
  environment: "development" | "production";
  appVersion: string;
  hostname?: string | null;
  status: "active" | "inactive" | "revoked";
  createdAt: string;
  updatedAt: string;
}

export interface WorkerSession {
  id: number;
  workerDeviceId: number;
  accessTokenHash: string;
  refreshTokenHash: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerHeartbeat {
  id: number;
  workerDeviceId: number;
  status: string;
  cpuUsage?: number | null;
  ramUsage?: number | null;
  createdAt: string;
}

export interface DiscoveryRun {
  id: number;
  campaignId: number;
  organizationId: number;
  workerDeviceId?: number | null;
  status: "queued" | "claimed" | "running" | "stopping" | "completed" | "cancelled" | "failed" | "expired";
  level: "nano" | "quick" | "medium" | "deep";
  options?: any;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveryRunEvent {
  id: number;
  runId: number;
  sequence: number;
  kind: string;
  title: string;
  leadName?: string | null;
  url?: string | null;
  payload: any;
  createdAt: string;
}

export interface DiscoveryRunArtifact {
  id: number;
  runId: number;
  type: string;
  path: string;
  uploadId?: string | null;
  createdAt: string;
}

