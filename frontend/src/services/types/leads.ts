import type { GeneratedMessage, Interaction } from "./interactions";

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
