import type {
  CommercialInteraction,
  DigitalPresence,
  DiscoveryCandidate,
  GeneratedMessage,
  Lead,
  LeadEmbedding,
  LeadScore,
  SocialSnapshot,
  WebsiteSnapshot
} from "../types.js";

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function jsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  return value as Record<string, unknown>;
}

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function serializeCampaign(record: any) {
  return {
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    niche: record.niche,
    city: record.city,
    state: record.state,
    country: record.country,
    status: record.status,
    targetQuantity: record.targetQuantity ?? undefined,
    discoveryLevel: record.discoveryLevel ?? "quick",
    startedAt: toIso(record.startedAt),
    finishedAt: toIso(record.finishedAt),
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt)
  };
}

export function serializeLead(record: any): Lead {
  return {
    id: record.id,
    organizationId: record.organizationId,
    campaignId: record.campaignId ?? undefined,
    businessName: record.businessName,
    personName: record.personName ?? undefined,
    niche: record.niche,
    documentNumber: record.documentNumber ?? undefined,
    documentStatus: record.documentStatus ?? undefined,
    professionalRegistry: record.professionalRegistry ?? undefined,
    city: record.city,
    state: record.state,
    country: record.country,
    address: record.address ?? undefined,
    phone: record.phone ?? undefined,
    whatsapp: record.whatsapp ?? undefined,
    email: record.email ?? undefined,
    websiteUrl: record.websiteUrl ?? undefined,
    instagramUrl: record.instagramUrl ?? undefined,
    facebookUrl: record.facebookUrl ?? undefined,
    linkedinUrl: record.linkedinUrl ?? undefined,
    googleMapsUrl: record.googleMapsUrl ?? undefined,
    source: record.source ?? undefined,
    rawDataJson: jsonRecord(record.rawDataJson),
    createdAt: toIso(record.createdAt) ?? "",
    updatedAt: toIso(record.updatedAt) ?? ""
  };
}

export function serializeScore(record: any): LeadScore {
  return {
    id: record.id,
    organizationId: record.organizationId,
    leadId: record.leadId,
    objectiveScore: record.objectiveScore,
    aiCommercialScore: record.aiCommercialScore ?? undefined,
    digitalPresenceScore: record.digitalPresenceScore ?? undefined,
    embeddingSimilarityScore: record.embeddingSimilarityScore ?? undefined,
    finalScore: record.finalScore,
    temperature: record.temperature,
    recommendedOffer: record.recommendedOffer,
    scoreBreakdownJson: jsonArray(record.scoreBreakdownJson),
    aiReasoning: record.aiReasoning ?? undefined,
    createdAt: toIso(record.createdAt) ?? "",
    updatedAt: toIso(record.updatedAt) ?? ""
  };
}

export function serializeInteraction(record: any): CommercialInteraction {
  return {
    id: record.id,
    organizationId: record.organizationId,
    leadId: record.leadId,
    status: record.status,
    contactChannel: record.contactChannel ?? undefined,
    contactedAt: toIso(record.contactedAt),
    responseAt: toIso(record.responseAt),
    notes: record.notes ?? undefined,
    nextActionAt: toIso(record.nextActionAt),
    createdBy: record.createdBy ?? undefined,
    createdAt: toIso(record.createdAt) ?? "",
    updatedAt: toIso(record.updatedAt) ?? ""
  };
}

export function serializeDigitalPresence(record: any): DigitalPresence {
  return {
    ...record,
    websiteDetectedIssuesJson: jsonArray(record.websiteDetectedIssuesJson),
    createdAt: toIso(record.createdAt) ?? "",
    updatedAt: toIso(record.updatedAt) ?? ""
  };
}

export function serializeWebsiteSnapshot(record: any): WebsiteSnapshot {
  return {
    ...record,
    metaDescription: record.metaDescription ?? undefined,
    h1: record.h1 ?? undefined,
    headingsJson: jsonArray(record.headingsJson),
    textSummary: record.textSummary ?? undefined,
    textSample: record.textSample ?? undefined,
    detectedIssuesJson: jsonArray(record.detectedIssuesJson),
    rawMetricsJson: jsonRecord(record.rawMetricsJson) ?? {},
    aiReview: jsonRecord(record.aiReviewJson),
    createdAt: toIso(record.createdAt) ?? ""
  };
}

export function serializeSocialSnapshot(record: any): SocialSnapshot {
  return {
    ...record,
    bioText: record.bioText ?? undefined,
    externalLink: record.externalLink ?? undefined,
    contentSignalsJson: jsonArray(record.contentSignalsJson),
    rawMetricsJson: jsonRecord(record.rawMetricsJson) ?? {},
    aiReview: jsonRecord(record.aiReviewJson),
    createdAt: toIso(record.createdAt) ?? ""
  };
}

export function serializeEmbedding(record: any): LeadEmbedding {
  return {
    ...record,
    leadId: record.leadId ?? undefined,
    embeddingVector: jsonArray<number>(record.embeddingVector),
    metadataJson: jsonRecord(record.metadataJson),
    createdAt: toIso(record.createdAt) ?? ""
  };
}

export function serializeAiReview(record: any) {
  return {
    id: record.id,
    organizationId: record.organizationId,
    leadId: record.leadId ?? undefined,
    analysisType: record.analysisType,
    model: record.model,
    promptVersion: record.promptVersion,
    inputHash: record.inputHash,
    inputJson: jsonRecord(record.inputJson) ?? {},
    outputJson: jsonRecord(record.outputJson) ?? {},
    tokensInput: record.tokensInput ?? undefined,
    tokensOutput: record.tokensOutput ?? undefined,
    costEstimate: record.costEstimate ? Number(record.costEstimate) : undefined,
    summary: record.summary ?? undefined,
    createdAt: toIso(record.createdAt) ?? ""
  };
}

export function serializeMessage(record: any): GeneratedMessage {
  return {
    ...record,
    createdAt: toIso(record.createdAt) ?? ""
  };
}

export function serializeDiscoveryCandidate(record: any): DiscoveryCandidate {
  return {
    ...record,
    leadId: record.leadId ?? undefined,
    createdAt: toIso(record.createdAt) ?? ""
  };
}
