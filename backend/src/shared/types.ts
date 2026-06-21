export type CampaignStatus = "draft" | "running" | "paused" | "completed" | "failed";
export type Temperature = "hot" | "warm" | "medium" | "cold" | "discard";
export type UserRole = "admin";
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
  iat: number;
  exp: number;
}

export interface Lead {
  id: number;
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
  leadId: number;
  status: InteractionStatus;
  contactChannel?: string;
  contactedAt?: string;
  responseAt?: string;
  notes?: string;
  nextActionAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedMessage {
  id: number;
  leadId: number;
  messageType: string;
  channel: "whatsapp" | "email" | "instagram";
  content: string;
  tone: string;
  createdAt: string;
}
