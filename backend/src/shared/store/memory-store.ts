// @ts-nocheck
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import type {
  AiCacheEntry,
  AiReview,
  AppUser,
  Campaign,
  CommercialInteraction,
  DiscoveryCandidate,
  DigitalPresence,
  GeneratedMessage,
  Lead,
  LeadEmbedding,
  LeadScore,
  ScoreWeightVersion,
  SocialSnapshot,
  WebsiteSnapshot
} from "../types.js";
import { prisma } from "../prisma.js";

interface Counters {
  user: number;
  campaign: number;
  lead: number;
  score: number;
  aiReview: number;
  aiCache: number;
  interaction: number;
  message: number;
  digitalPresence: number;
  websiteSnapshot: number;
  socialSnapshot: number;
  embedding: number;
  discoveryCandidate: number;
  scoreWeightVersion: number;
}

interface PersistedStoreData {
  counters?: Partial<Counters>;
  users?: Array<[number, AppUser]>;
  campaigns?: Array<[number, Campaign]>;
  leads?: Array<[number, Lead]>;
  scores?: Array<[number, LeadScore]>;
  aiReviews?: Array<[number, AiReview]>;
  aiCache?: Array<[string, AiCacheEntry]>;
  interactions?: Array<[number, CommercialInteraction]>;
  messages?: Array<[number, GeneratedMessage]>;
  digitalPresence?: Array<[number, DigitalPresence]>;
  websiteSnapshots?: Array<[number, WebsiteSnapshot]>;
  socialSnapshots?: Array<[number, SocialSnapshot]>;
  embeddings?: Array<[number, LeadEmbedding]>;
  discoveryCandidates?: Array<[number, DiscoveryCandidate]>;
  scoreWeightVersions?: Array<[number, ScoreWeightVersion]>;
}

type StoreMapName =
  | "users"
  | "campaigns"
  | "leads"
  | "scores"
  | "aiReviews"
  | "aiCache"
  | "interactions"
  | "messages"
  | "digitalPresence"
  | "websiteSnapshots"
  | "socialSnapshots"
  | "embeddings"
  | "discoveryCandidates"
  | "scoreWeightVersions";

class PersistentMap<K, V> extends Map<K, V> {
  constructor(
    private readonly onSet: (key: K, value: V) => void,
    private readonly onDelete: (key: K, value: V | undefined) => void,
    private readonly onClear: () => void
  ) {
    super();
  }

  override set(key: K, value: V): this {
    super.set(key, value);
    this.onSet(key, value);
    return this;
  }

  override delete(key: K): boolean {
    const existing = this.get(key);
    const removed = super.delete(key);
    if (removed) this.onDelete(key, existing);
    return removed;
  }

  override clear(): void {
    if (this.size === 0) return;
    super.clear();
    this.onClear();
  }
}

function defaultCounters(): Counters {
  return {
    user: 1,
    campaign: 1,
    lead: 1,
    score: 1,
    aiReview: 1,
    aiCache: 1,
    interaction: 1,
    message: 1,
    digitalPresence: 1,
    websiteSnapshot: 1,
    socialSnapshot: 1,
    embedding: 1,
    discoveryCandidate: 1,
    scoreWeightVersion: 1
  };
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    return ((value as { toNumber(): number }).toNumber());
  }
  return Number(value);
}

function toDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toPrismaNullableJson(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return toPrismaJson(value);
}

function fromPrismaJson<T>(value: Prisma.JsonValue | null | undefined): T | undefined {
  if (value === null || value === undefined) return undefined;
  return value as unknown as T;
}

function fromPrismaJsonRequired<T>(value: Prisma.JsonValue): T {
  return value as unknown as T;
}

const AI_CACHE_ENTITY_ID_MAX_LENGTH = 64;

function normalizeAiCacheEntityId(entityId: string): string {
  if (entityId.length <= AI_CACHE_ENTITY_ID_MAX_LENGTH) return entityId;
  const hash = createHash("sha256").update(entityId).digest("hex");
  return `sha256:${hash.slice(0, AI_CACHE_ENTITY_ID_MAX_LENGTH - "sha256:".length)}`;
}

function aiCacheInputJsonForDb(cache: AiCacheEntry): Prisma.InputJsonValue {
  const normalizedEntityId = normalizeAiCacheEntityId(cache.entityId);
  if (normalizedEntityId === cache.entityId) return toPrismaJson(cache.inputJson);

  return toPrismaJson({
    ...cache.inputJson,
    __aiCacheEntityId: {
      original: cache.entityId,
      normalized: normalizedEntityId
    }
  });
}

function aiCacheUniqueWhere(cache: AiCacheEntry) {
  return {
    entityType: cache.entityType,
    entityId: normalizeAiCacheEntityId(cache.entityId),
    analysisType: cache.analysisType,
    model: cache.model,
    promptVersion: cache.promptVersion,
    inputHash: cache.inputHash
  };
}

export class MemoryStore {
  users: PersistentMap<number, AppUser>;
  campaigns: PersistentMap<number, Campaign>;
  leads: PersistentMap<number, Lead>;
  scores: PersistentMap<number, LeadScore>;
  aiReviews: PersistentMap<number, AiReview>;
  aiCache: PersistentMap<string, AiCacheEntry>;
  interactions: PersistentMap<number, CommercialInteraction>;
  messages: PersistentMap<number, GeneratedMessage>;
  digitalPresence: PersistentMap<number, DigitalPresence>;
  websiteSnapshots: PersistentMap<number, WebsiteSnapshot>;
  socialSnapshots: PersistentMap<number, SocialSnapshot>;
  embeddings: PersistentMap<number, LeadEmbedding>;
  discoveryCandidates: PersistentMap<number, DiscoveryCandidate>;
  scoreWeightVersions: PersistentMap<number, ScoreWeightVersion>;

  private counters: Counters = defaultCounters();
  private readonly legacyStoragePath = join(process.cwd(), "storage", "memory-store.json");
  private isHydrating = false;
  private isInitialized = false;
  private syncQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.users = this.createTrackedMap<number, AppUser>("users");
    this.campaigns = this.createTrackedMap<number, Campaign>("campaigns");
    this.leads = this.createTrackedMap<number, Lead>("leads");
    this.scores = this.createTrackedMap<number, LeadScore>("scores");
    this.aiReviews = this.createTrackedMap<number, AiReview>("aiReviews");
    this.aiCache = this.createTrackedMap<string, AiCacheEntry>("aiCache");
    this.interactions = this.createTrackedMap<number, CommercialInteraction>("interactions");
    this.messages = this.createTrackedMap<number, GeneratedMessage>("messages");
    this.digitalPresence = this.createTrackedMap<number, DigitalPresence>("digitalPresence");
    this.websiteSnapshots = this.createTrackedMap<number, WebsiteSnapshot>("websiteSnapshots");
    this.socialSnapshots = this.createTrackedMap<number, SocialSnapshot>("socialSnapshots");
    this.embeddings = this.createTrackedMap<number, LeadEmbedding>("embeddings");
    this.discoveryCandidates = this.createTrackedMap<number, DiscoveryCandidate>("discoveryCandidates");
    this.scoreWeightVersions = this.createTrackedMap<number, ScoreWeightVersion>("scoreWeightVersions");
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await prisma.$connect();
    const hasDatabaseData = await this.hasDatabaseData();
    if (!hasDatabaseData) {
      await this.importLegacySnapshot();
    }
    await this.loadFromDatabase();
    this.isInitialized = true;
  }

  async waitForIdle(): Promise<void> {
    await this.syncQueue;
  }

  nextId(key: keyof Counters): number {
    const id = this.counters[key];
    this.counters[key] += 1;
    return id;
  }

  private createTrackedMap<K, V>(name: StoreMapName): PersistentMap<K, V> {
    return new PersistentMap<K, V>(
      (key, value) => this.handleSet(name, key, value),
      (key, value) => this.handleDelete(name, key, value),
      () => this.handleClear(name)
    );
  }

  private handleSet(name: StoreMapName, key: unknown, value: unknown): void {
    if (this.isHydrating || !this.isInitialized) return;
    this.enqueueSync(() => this.upsertEntry(name, key, value));
  }

  private handleDelete(name: StoreMapName, key: unknown, value: unknown): void {
    if (this.isHydrating || !this.isInitialized) return;
    this.enqueueSync(() => this.deleteEntry(name, key, value));
  }

  private handleClear(name: StoreMapName): void {
    if (this.isHydrating || !this.isInitialized) return;
    this.enqueueSync(() => this.clearEntries(name));
  }

  private enqueueSync(task: () => Promise<void>): void {
    this.syncQueue = this.syncQueue
      .then(task)
      .catch((error) => {
        console.error(`[sql-store] Failed to sync ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  private async hasDatabaseData(): Promise<boolean> {
    const counts = await Promise.all([
      prisma.searchCampaign.count(),
      prisma.lead.count(),
      prisma.commercialInteraction.count(),
      prisma.generatedMessage.count(),
      prisma.leadScore.count(),
      prisma.leadAiReview.count(),
      prisma.aiAnalysisCache.count()
    ]);
    return counts.some((count) => count > 0);
  }

  private async importLegacySnapshot(): Promise<void> {
    if (!existsSync(this.legacyStoragePath)) return;

    const raw = readFileSync(this.legacyStoragePath, "utf8");
    const data = JSON.parse(raw) as PersistedStoreData;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const [, user] of data.users ?? []) {
        await tx.user.upsert({
          where: { id: user.id },
          create: {
            id: user.id,
            name: user.name,
            email: user.email,
            passwordHash: user.passwordHash,
            role: user.role,
            createdAt: new Date(user.createdAt),
            updatedAt: new Date(user.updatedAt)
          },
          update: {
            name: user.name,
            email: user.email,
            passwordHash: user.passwordHash,
            role: user.role,
            createdAt: new Date(user.createdAt),
            updatedAt: new Date(user.updatedAt)
          }
        });
      }

      for (const [, campaign] of data.campaigns ?? []) {
        await tx.searchCampaign.upsert({
          where: { id: campaign.id },
          create: {
            id: campaign.id,
            name: campaign.name,
            niche: campaign.niche,
            city: campaign.city,
            state: campaign.state,
            country: campaign.country,
            status: campaign.status,
            targetQuantity: campaign.targetQuantity,
            startedAt: toDate(campaign.startedAt),
            finishedAt: toDate(campaign.finishedAt),
            createdAt: new Date(campaign.createdAt),
            updatedAt: new Date(campaign.updatedAt)
          },
          update: {
            name: campaign.name,
            niche: campaign.niche,
            city: campaign.city,
            state: campaign.state,
            country: campaign.country,
            status: campaign.status,
            targetQuantity: campaign.targetQuantity,
            startedAt: toDate(campaign.startedAt),
            finishedAt: toDate(campaign.finishedAt),
            createdAt: new Date(campaign.createdAt),
            updatedAt: new Date(campaign.updatedAt)
          }
        });
      }

      for (const [, lead] of data.leads ?? []) {
        await tx.lead.upsert({
          where: { id: lead.id },
          create: {
            id: lead.id,
            campaignId: lead.campaignId,
            businessName: lead.businessName,
            personName: lead.personName,
            niche: lead.niche,
            documentNumber: lead.documentNumber,
            documentStatus: lead.documentStatus,
            professionalRegistry: lead.professionalRegistry,
            city: lead.city,
            state: lead.state,
            country: lead.country,
            address: lead.address,
            phone: lead.phone,
            whatsapp: lead.whatsapp,
            email: lead.email,
            websiteUrl: lead.websiteUrl,
            instagramUrl: lead.instagramUrl,
            facebookUrl: lead.facebookUrl,
            linkedinUrl: lead.linkedinUrl,
            googleMapsUrl: lead.googleMapsUrl,
            source: lead.source,
            rawDataJson: toPrismaNullableJson(lead.rawDataJson),
            createdAt: new Date(lead.createdAt),
            updatedAt: new Date(lead.updatedAt)
          },
          update: {
            campaignId: lead.campaignId,
            businessName: lead.businessName,
            personName: lead.personName,
            niche: lead.niche,
            documentNumber: lead.documentNumber,
            documentStatus: lead.documentStatus,
            professionalRegistry: lead.professionalRegistry,
            city: lead.city,
            state: lead.state,
            country: lead.country,
            address: lead.address,
            phone: lead.phone,
            whatsapp: lead.whatsapp,
            email: lead.email,
            websiteUrl: lead.websiteUrl,
            instagramUrl: lead.instagramUrl,
            facebookUrl: lead.facebookUrl,
            linkedinUrl: lead.linkedinUrl,
            googleMapsUrl: lead.googleMapsUrl,
            source: lead.source,
            rawDataJson: toPrismaNullableJson(lead.rawDataJson),
            createdAt: new Date(lead.createdAt),
            updatedAt: new Date(lead.updatedAt)
          }
        });
      }

      for (const [, score] of data.scores ?? []) {
        await tx.leadScore.upsert({
          where: { id: score.id },
          create: {
            id: score.id,
            leadId: score.leadId,
            objectiveScore: score.objectiveScore,
            aiCommercialScore: score.aiCommercialScore,
            digitalPresenceScore: score.digitalPresenceScore,
            embeddingSimilarityScore: score.embeddingSimilarityScore,
            finalScore: score.finalScore,
            temperature: score.temperature,
            recommendedOffer: score.recommendedOffer,
            scoreBreakdownJson: toPrismaJson(score.scoreBreakdownJson),
            aiReasoning: score.aiReasoning,
            createdAt: new Date(score.createdAt),
            updatedAt: new Date(score.updatedAt)
          },
          update: {
            leadId: score.leadId,
            objectiveScore: score.objectiveScore,
            aiCommercialScore: score.aiCommercialScore,
            digitalPresenceScore: score.digitalPresenceScore,
            embeddingSimilarityScore: score.embeddingSimilarityScore,
            finalScore: score.finalScore,
            temperature: score.temperature,
            recommendedOffer: score.recommendedOffer,
            scoreBreakdownJson: toPrismaJson(score.scoreBreakdownJson),
            aiReasoning: score.aiReasoning,
            createdAt: new Date(score.createdAt),
            updatedAt: new Date(score.updatedAt)
          }
        });
      }

      for (const [, review] of data.aiReviews ?? []) {
        await tx.leadAiReview.upsert({
          where: { id: review.id },
          create: {
            id: review.id,
            leadId: review.leadId,
            analysisType: review.analysisType,
            model: review.model,
            promptVersion: review.promptVersion,
            inputHash: review.inputHash,
            inputJson: toPrismaJson(review.inputJson),
            outputJson: toPrismaJson(review.outputJson),
            tokensInput: review.tokensInput,
            tokensOutput: review.tokensOutput,
            costEstimate: review.costEstimate,
            summary: review.summary,
            createdAt: new Date(review.createdAt)
          },
          update: {
            leadId: review.leadId,
            analysisType: review.analysisType,
            model: review.model,
            promptVersion: review.promptVersion,
            inputHash: review.inputHash,
            inputJson: toPrismaJson(review.inputJson),
            outputJson: toPrismaJson(review.outputJson),
            tokensInput: review.tokensInput,
            tokensOutput: review.tokensOutput,
            costEstimate: review.costEstimate,
            summary: review.summary,
            createdAt: new Date(review.createdAt)
          }
        });
      }

      for (const [, cache] of data.aiCache ?? []) {
        await tx.aiAnalysisCache.upsert({
          where: {
            entityType_entityId_analysisType_model_promptVersion_inputHash: aiCacheUniqueWhere(cache)
          },
          create: {
            id: cache.id,
            entityType: cache.entityType,
            entityId: normalizeAiCacheEntityId(cache.entityId),
            analysisType: cache.analysisType,
            model: cache.model,
            promptVersion: cache.promptVersion,
            inputHash: cache.inputHash,
            inputJson: aiCacheInputJsonForDb(cache),
            outputJson: toPrismaJson(cache.outputJson),
            tokensInput: cache.tokensInput,
            tokensOutput: cache.tokensOutput,
            costEstimate: cache.costEstimate,
            createdAt: new Date(cache.createdAt)
          },
          update: {
            inputJson: aiCacheInputJsonForDb(cache),
            outputJson: toPrismaJson(cache.outputJson),
            tokensInput: cache.tokensInput,
            tokensOutput: cache.tokensOutput,
            costEstimate: cache.costEstimate,
            createdAt: new Date(cache.createdAt)
          }
        });
      }

      for (const [, interaction] of data.interactions ?? []) {
        await tx.commercialInteraction.upsert({
          where: { id: interaction.id },
          create: {
            id: interaction.id,
            leadId: interaction.leadId,
            status: interaction.status,
            contactChannel: interaction.contactChannel,
            contactedAt: toDate(interaction.contactedAt),
            responseAt: toDate(interaction.responseAt),
            notes: interaction.notes,
            nextActionAt: toDate(interaction.nextActionAt),
            createdAt: new Date(interaction.createdAt),
            updatedAt: new Date(interaction.updatedAt)
          },
          update: {
            leadId: interaction.leadId,
            status: interaction.status,
            contactChannel: interaction.contactChannel,
            contactedAt: toDate(interaction.contactedAt),
            responseAt: toDate(interaction.responseAt),
            notes: interaction.notes,
            nextActionAt: toDate(interaction.nextActionAt),
            createdAt: new Date(interaction.createdAt),
            updatedAt: new Date(interaction.updatedAt)
          }
        });
      }

      for (const [, message] of data.messages ?? []) {
        await tx.generatedMessage.upsert({
          where: { id: message.id },
          create: {
            id: message.id,
            leadId: message.leadId,
            messageType: message.messageType,
            channel: message.channel,
            content: message.content,
            tone: message.tone,
            createdAt: new Date(message.createdAt)
          },
          update: {
            leadId: message.leadId,
            messageType: message.messageType,
            channel: message.channel,
            content: message.content,
            tone: message.tone,
            createdAt: new Date(message.createdAt)
          }
        });
      }

      for (const [, presence] of data.digitalPresence ?? []) {
        await tx.leadDigitalPresence.upsert({
          where: { leadId: presence.leadId },
          create: {
            id: presence.id,
            leadId: presence.leadId,
            hasWebsite: presence.hasWebsite,
            websiteUrl: presence.websiteUrl,
            websitePlatform: presence.websitePlatform,
            hasInstagram: presence.hasInstagram,
            hasFacebook: presence.hasFacebook,
            hasLinkedin: presence.hasLinkedin,
            hasGoogleMaps: presence.hasGoogleMaps,
            hasWhatsapp: presence.hasWhatsapp,
            hasLinktree: presence.hasLinktree,
            hasOnlySocialMedia: presence.hasOnlySocialMedia,
            websiteHttpStatus: presence.websiteHttpStatus,
            websiteLoadTimeMs: presence.websiteLoadTimeMs,
            websiteHasSsl: presence.websiteHasSsl,
            websiteIsMobileFriendly: presence.websiteIsMobileFriendly,
            websiteHasCta: presence.websiteHasCta,
            websiteHasWhatsappCta: presence.websiteHasWhatsappCta,
            websiteHasContactForm: presence.websiteHasContactForm,
            websiteHasSeoTitle: presence.websiteHasSeoTitle,
            websiteHasMetaDescription: presence.websiteHasMetaDescription,
            websiteDetectedIssuesJson: toPrismaJson(presence.websiteDetectedIssuesJson),
            websiteQualityScore: presence.websiteQualityScore,
            socialPresenceScore: presence.socialPresenceScore,
            createdAt: new Date(presence.createdAt),
            updatedAt: new Date(presence.updatedAt)
          },
          update: {
            hasWebsite: presence.hasWebsite,
            websiteUrl: presence.websiteUrl,
            websitePlatform: presence.websitePlatform,
            hasInstagram: presence.hasInstagram,
            hasFacebook: presence.hasFacebook,
            hasLinkedin: presence.hasLinkedin,
            hasGoogleMaps: presence.hasGoogleMaps,
            hasWhatsapp: presence.hasWhatsapp,
            hasLinktree: presence.hasLinktree,
            hasOnlySocialMedia: presence.hasOnlySocialMedia,
            websiteHttpStatus: presence.websiteHttpStatus,
            websiteLoadTimeMs: presence.websiteLoadTimeMs,
            websiteHasSsl: presence.websiteHasSsl,
            websiteIsMobileFriendly: presence.websiteIsMobileFriendly,
            websiteHasCta: presence.websiteHasCta,
            websiteHasWhatsappCta: presence.websiteHasWhatsappCta,
            websiteHasContactForm: presence.websiteHasContactForm,
            websiteHasSeoTitle: presence.websiteHasSeoTitle,
            websiteHasMetaDescription: presence.websiteHasMetaDescription,
            websiteDetectedIssuesJson: toPrismaJson(presence.websiteDetectedIssuesJson),
            websiteQualityScore: presence.websiteQualityScore,
            socialPresenceScore: presence.socialPresenceScore,
            createdAt: new Date(presence.createdAt),
            updatedAt: new Date(presence.updatedAt)
          }
        });
      }

      for (const [, snapshot] of data.websiteSnapshots ?? []) {
        await tx.leadWebsiteSnapshot.upsert({
          where: { id: snapshot.id },
          create: {
            id: snapshot.id,
            leadId: snapshot.leadId,
            url: snapshot.url,
            httpStatus: snapshot.httpStatus,
            title: snapshot.title,
            metaDescription: snapshot.metaDescription,
            h1: snapshot.h1,
            headingsJson: toPrismaJson(snapshot.headingsJson),
            textSummary: snapshot.textSummary,
            textSample: snapshot.textSample,
            platform: snapshot.platform,
            hasSsl: snapshot.hasSsl,
            loadTimeMs: snapshot.loadTimeMs,
            hasWhatsapp: snapshot.hasWhatsapp,
            hasContactForm: snapshot.hasContactForm,
            hasCta: snapshot.hasCta,
            hasLocation: snapshot.hasLocation,
            hasServices: snapshot.hasServices,
            hasTestimonials: snapshot.hasTestimonials,
            detectedIssuesJson: toPrismaJson(snapshot.detectedIssuesJson),
            rawMetricsJson: toPrismaJson(snapshot.rawMetricsJson),
            snapshotHash: snapshot.snapshotHash,
            aiReviewJson: toPrismaNullableJson(snapshot.aiReview),
            createdAt: new Date(snapshot.createdAt)
          },
          update: {
            leadId: snapshot.leadId,
            url: snapshot.url,
            httpStatus: snapshot.httpStatus,
            title: snapshot.title,
            metaDescription: snapshot.metaDescription,
            h1: snapshot.h1,
            headingsJson: toPrismaJson(snapshot.headingsJson),
            textSummary: snapshot.textSummary,
            textSample: snapshot.textSample,
            platform: snapshot.platform,
            hasSsl: snapshot.hasSsl,
            loadTimeMs: snapshot.loadTimeMs,
            hasWhatsapp: snapshot.hasWhatsapp,
            hasContactForm: snapshot.hasContactForm,
            hasCta: snapshot.hasCta,
            hasLocation: snapshot.hasLocation,
            hasServices: snapshot.hasServices,
            hasTestimonials: snapshot.hasTestimonials,
            detectedIssuesJson: toPrismaJson(snapshot.detectedIssuesJson),
            rawMetricsJson: toPrismaJson(snapshot.rawMetricsJson),
            snapshotHash: snapshot.snapshotHash,
            aiReviewJson: toPrismaNullableJson(snapshot.aiReview),
            createdAt: new Date(snapshot.createdAt)
          }
        });
      }

      for (const [, snapshot] of data.socialSnapshots ?? []) {
        await tx.leadSocialSnapshot.upsert({
          where: { id: snapshot.id },
          create: {
            id: snapshot.id,
            leadId: snapshot.leadId,
            platform: snapshot.platform,
            profileUrl: snapshot.profileUrl,
            bioText: snapshot.bioText,
            externalLink: snapshot.externalLink,
            hasWhatsapp: snapshot.hasWhatsapp,
            hasWebsiteLink: snapshot.hasWebsiteLink,
            estimatedPostCount: snapshot.estimatedPostCount,
            lastActivitySignal: snapshot.lastActivitySignal,
            contentSignalsJson: toPrismaJson(snapshot.contentSignalsJson),
            rawMetricsJson: toPrismaJson(snapshot.rawMetricsJson),
            snapshotHash: snapshot.snapshotHash,
            aiReviewJson: toPrismaNullableJson(snapshot.aiReview),
            createdAt: new Date(snapshot.createdAt)
          },
          update: {
            leadId: snapshot.leadId,
            platform: snapshot.platform,
            profileUrl: snapshot.profileUrl,
            bioText: snapshot.bioText,
            externalLink: snapshot.externalLink,
            hasWhatsapp: snapshot.hasWhatsapp,
            hasWebsiteLink: snapshot.hasWebsiteLink,
            estimatedPostCount: snapshot.estimatedPostCount,
            lastActivitySignal: snapshot.lastActivitySignal,
            contentSignalsJson: toPrismaJson(snapshot.contentSignalsJson),
            rawMetricsJson: toPrismaJson(snapshot.rawMetricsJson),
            snapshotHash: snapshot.snapshotHash,
            aiReviewJson: toPrismaNullableJson(snapshot.aiReview),
            createdAt: new Date(snapshot.createdAt)
          }
        });
      }

      for (const [, embedding] of data.embeddings ?? []) {
        await tx.leadEmbedding.upsert({
          where: { id: embedding.id },
          create: {
            id: embedding.id,
            leadId: embedding.leadId,
            embeddingType: embedding.embeddingType,
            sourceText: embedding.sourceText,
            embeddingVector: toPrismaJson(embedding.embeddingVector),
            model: embedding.model,
            metadataJson: toPrismaNullableJson(embedding.metadataJson),
            createdAt: new Date(embedding.createdAt)
          },
          update: {
            leadId: embedding.leadId,
            embeddingType: embedding.embeddingType,
            sourceText: embedding.sourceText,
            embeddingVector: toPrismaJson(embedding.embeddingVector),
            model: embedding.model,
            metadataJson: toPrismaNullableJson(embedding.metadataJson),
            createdAt: new Date(embedding.createdAt)
          }
        });
      }

      for (const [, candidate] of data.discoveryCandidates ?? []) {
        await tx.discoveryCandidate.upsert({
          where: { id: candidate.id },
          create: {
            id: candidate.id,
            campaignId: candidate.campaignId,
            leadId: candidate.leadId,
            title: candidate.title,
            url: candidate.url,
            snippet: candidate.snippet,
            source: candidate.source,
            priority: candidate.priority,
            isPotentialLead: candidate.isPotentialLead,
            reason: candidate.reason,
            status: candidate.status,
            createdAt: new Date(candidate.createdAt)
          },
          update: {
            campaignId: candidate.campaignId,
            leadId: candidate.leadId,
            title: candidate.title,
            url: candidate.url,
            snippet: candidate.snippet,
            source: candidate.source,
            priority: candidate.priority,
            isPotentialLead: candidate.isPotentialLead,
            reason: candidate.reason,
            status: candidate.status,
            createdAt: new Date(candidate.createdAt)
          }
        });
      }

      for (const [, version] of data.scoreWeightVersions ?? []) {
        await tx.scoreWeightVersion.upsert({
          where: { id: version.id },
          create: {
            id: version.id,
            version: version.version,
            weights: toPrismaJson(version.weights),
            rationale: toPrismaJson(version.rationale),
            createdAt: new Date(version.createdAt)
          },
          update: {
            version: version.version,
            weights: toPrismaJson(version.weights),
            rationale: toPrismaJson(version.rationale),
            createdAt: new Date(version.createdAt)
          }
        });
      }
    });
  }

  private async loadFromDatabase(): Promise<void> {
    this.isHydrating = true;
    try {
      const [
        users,
        campaigns,
        leads,
        scores,
        aiReviews,
        aiCache,
        interactions,
        messages,
        digitalPresence,
        websiteSnapshots,
        socialSnapshots,
        embeddings,
        discoveryCandidates,
        scoreWeightVersions
      ] = await Promise.all([
        prisma.user.findMany(),
        prisma.searchCampaign.findMany(),
        prisma.lead.findMany(),
        prisma.leadScore.findMany(),
        prisma.leadAiReview.findMany(),
        prisma.aiAnalysisCache.findMany(),
        prisma.commercialInteraction.findMany(),
        prisma.generatedMessage.findMany(),
        prisma.leadDigitalPresence.findMany(),
        prisma.leadWebsiteSnapshot.findMany(),
        prisma.leadSocialSnapshot.findMany(),
        prisma.leadEmbedding.findMany(),
        prisma.discoveryCandidate.findMany(),
        prisma.scoreWeightVersion.findMany()
      ]);

      this.restoreMap(this.users, users.map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          email: item.email,
          passwordHash: item.passwordHash,
          role: item.role as AppUser["role"],
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        }
      ]));

      this.restoreMap(this.campaigns, campaigns.map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          niche: item.niche,
          city: item.city,
          state: item.state,
          country: item.country,
          status: item.status as Campaign["status"],
          targetQuantity: item.targetQuantity ?? undefined,
          startedAt: toIso(item.startedAt),
          finishedAt: toIso(item.finishedAt),
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        }
      ]));

      this.restoreMap(this.leads, leads.map((item) => [
        item.id,
        {
          id: item.id,
          campaignId: item.campaignId ?? undefined,
          businessName: item.businessName,
          personName: item.personName ?? undefined,
          niche: item.niche,
          documentNumber: item.documentNumber ?? undefined,
          documentStatus: item.documentStatus ?? undefined,
          professionalRegistry: item.professionalRegistry ?? undefined,
          city: item.city,
          state: item.state,
          country: item.country,
          address: item.address ?? undefined,
          phone: item.phone ?? undefined,
          whatsapp: item.whatsapp ?? undefined,
          email: item.email ?? undefined,
          websiteUrl: item.websiteUrl ?? undefined,
          instagramUrl: item.instagramUrl ?? undefined,
          facebookUrl: item.facebookUrl ?? undefined,
          linkedinUrl: item.linkedinUrl ?? undefined,
          googleMapsUrl: item.googleMapsUrl ?? undefined,
          source: item.source ?? undefined,
          rawDataJson: fromPrismaJson<Record<string, unknown>>(item.rawDataJson),
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        }
      ]));

      this.restoreMap(this.scores, scores.map((item) => [
        item.id,
        {
          id: item.id,
          leadId: item.leadId,
          objectiveScore: item.objectiveScore,
          aiCommercialScore: item.aiCommercialScore ?? undefined,
          digitalPresenceScore: item.digitalPresenceScore ?? undefined,
          embeddingSimilarityScore: item.embeddingSimilarityScore ?? undefined,
          finalScore: item.finalScore,
          temperature: item.temperature as LeadScore["temperature"],
          recommendedOffer: item.recommendedOffer as LeadScore["recommendedOffer"],
          scoreBreakdownJson: fromPrismaJsonRequired<LeadScore["scoreBreakdownJson"]>(item.scoreBreakdownJson),
          aiReasoning: item.aiReasoning ?? undefined,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        }
      ]));

      this.restoreMap(this.aiReviews, aiReviews.map((item) => [
        item.id,
        {
          id: item.id,
          leadId: item.leadId ?? undefined,
          analysisType: item.analysisType as AiReview["analysisType"],
          model: item.model,
          promptVersion: item.promptVersion,
          inputHash: item.inputHash,
          inputJson: fromPrismaJsonRequired<Record<string, unknown>>(item.inputJson),
          outputJson: fromPrismaJsonRequired<Record<string, unknown>>(item.outputJson),
          tokensInput: item.tokensInput ?? undefined,
          tokensOutput: item.tokensOutput ?? undefined,
          costEstimate: toNumber(item.costEstimate),
          summary: item.summary ?? undefined,
          createdAt: item.createdAt.toISOString()
        }
      ]));

      this.restoreMap(this.aiCache, aiCache.map((item) => {
        const inputJson = fromPrismaJsonRequired<Record<string, unknown>>(item.inputJson);
        const entityIdMetadata = inputJson.__aiCacheEntityId as Record<string, unknown> | undefined;
        const entityId = typeof entityIdMetadata?.original === "string" ? entityIdMetadata.original : item.entityId;
        const key = [item.entityType, entityId, item.analysisType, item.model, item.promptVersion, item.inputHash].join(":");
        return [
          key,
          {
            id: item.id,
            entityType: item.entityType,
            entityId,
            analysisType: item.analysisType,
            model: item.model,
            promptVersion: item.promptVersion,
            inputHash: item.inputHash,
            inputJson,
            outputJson: fromPrismaJsonRequired<Record<string, unknown>>(item.outputJson),
            tokensInput: item.tokensInput ?? undefined,
            tokensOutput: item.tokensOutput ?? undefined,
            costEstimate: toNumber(item.costEstimate),
            createdAt: item.createdAt.toISOString()
          }
        ] as const;
      }));

      this.restoreMap(this.interactions, interactions.map((item) => [
        item.id,
        {
          id: item.id,
          leadId: item.leadId,
          status: item.status as CommercialInteraction["status"],
          contactChannel: item.contactChannel ?? undefined,
          contactedAt: toIso(item.contactedAt),
          responseAt: toIso(item.responseAt),
          notes: item.notes ?? undefined,
          nextActionAt: toIso(item.nextActionAt),
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        }
      ]));

      this.restoreMap(this.messages, messages.map((item) => [
        item.id,
        {
          id: item.id,
          leadId: item.leadId,
          messageType: item.messageType,
          channel: item.channel as GeneratedMessage["channel"],
          content: item.content,
          tone: item.tone,
          createdAt: item.createdAt.toISOString()
        }
      ]));

      this.restoreMap(this.digitalPresence, digitalPresence.map((item) => [
        item.id,
        {
          id: item.id,
          leadId: item.leadId,
          hasWebsite: item.hasWebsite,
          websiteUrl: item.websiteUrl ?? undefined,
          websitePlatform: item.websitePlatform ?? undefined,
          hasInstagram: item.hasInstagram,
          hasFacebook: item.hasFacebook,
          hasLinkedin: item.hasLinkedin,
          hasGoogleMaps: item.hasGoogleMaps,
          hasWhatsapp: item.hasWhatsapp,
          hasLinktree: item.hasLinktree,
          hasOnlySocialMedia: item.hasOnlySocialMedia,
          websiteHttpStatus: item.websiteHttpStatus ?? undefined,
          websiteLoadTimeMs: item.websiteLoadTimeMs ?? undefined,
          websiteHasSsl: item.websiteHasSsl ?? undefined,
          websiteIsMobileFriendly: item.websiteIsMobileFriendly ?? undefined,
          websiteHasCta: item.websiteHasCta ?? undefined,
          websiteHasWhatsappCta: item.websiteHasWhatsappCta ?? undefined,
          websiteHasContactForm: item.websiteHasContactForm ?? undefined,
          websiteHasSeoTitle: item.websiteHasSeoTitle ?? undefined,
          websiteHasMetaDescription: item.websiteHasMetaDescription ?? undefined,
          websiteDetectedIssuesJson: fromPrismaJsonRequired<string[]>(item.websiteDetectedIssuesJson),
          websiteQualityScore: item.websiteQualityScore ?? undefined,
          socialPresenceScore: item.socialPresenceScore ?? undefined,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        }
      ]));

      this.restoreMap(this.websiteSnapshots, websiteSnapshots.map((item) => [
        item.id,
        {
          id: item.id,
          leadId: item.leadId,
          url: item.url,
          httpStatus: item.httpStatus ?? undefined,
          title: item.title ?? undefined,
          metaDescription: item.metaDescription ?? undefined,
          h1: item.h1 ?? undefined,
          headingsJson: fromPrismaJsonRequired<string[]>(item.headingsJson),
          textSummary: item.textSummary ?? undefined,
          textSample: item.textSample ?? undefined,
          platform: item.platform ?? undefined,
          hasSsl: item.hasSsl,
          loadTimeMs: item.loadTimeMs ?? undefined,
          hasWhatsapp: item.hasWhatsapp,
          hasContactForm: item.hasContactForm,
          hasCta: item.hasCta,
          hasLocation: item.hasLocation,
          hasServices: item.hasServices,
          hasTestimonials: item.hasTestimonials,
          detectedIssuesJson: fromPrismaJsonRequired<string[]>(item.detectedIssuesJson),
          rawMetricsJson: fromPrismaJsonRequired<Record<string, unknown>>(item.rawMetricsJson),
          snapshotHash: item.snapshotHash,
          aiReview: fromPrismaJson<WebsiteSnapshot["aiReview"]>(item.aiReviewJson),
          createdAt: item.createdAt.toISOString()
        }
      ]));

      this.restoreMap(this.socialSnapshots, socialSnapshots.map((item) => [
        item.id,
        {
          id: item.id,
          leadId: item.leadId,
          platform: item.platform as SocialSnapshot["platform"],
          profileUrl: item.profileUrl,
          bioText: item.bioText ?? undefined,
          externalLink: item.externalLink ?? undefined,
          hasWhatsapp: item.hasWhatsapp,
          hasWebsiteLink: item.hasWebsiteLink,
          estimatedPostCount: item.estimatedPostCount ?? undefined,
          lastActivitySignal: item.lastActivitySignal as SocialSnapshot["lastActivitySignal"],
          contentSignalsJson: fromPrismaJsonRequired<string[]>(item.contentSignalsJson),
          rawMetricsJson: fromPrismaJsonRequired<Record<string, unknown>>(item.rawMetricsJson),
          snapshotHash: item.snapshotHash,
          aiReview: fromPrismaJson<SocialSnapshot["aiReview"]>(item.aiReviewJson),
          createdAt: item.createdAt.toISOString()
        }
      ]));

      this.restoreMap(this.embeddings, embeddings.map((item) => [
        item.id,
        {
          id: item.id,
          leadId: item.leadId ?? undefined,
          embeddingType: item.embeddingType as LeadEmbedding["embeddingType"],
          sourceText: item.sourceText,
          embeddingVector: fromPrismaJsonRequired<number[]>(item.embeddingVector),
          model: item.model,
          metadataJson: fromPrismaJson<Record<string, unknown>>(item.metadataJson),
          createdAt: item.createdAt.toISOString()
        }
      ]));

      this.restoreMap(this.discoveryCandidates, discoveryCandidates.map((item) => [
        item.id,
        {
          id: item.id,
          campaignId: item.campaignId,
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          source: item.source,
          priority: item.priority as DiscoveryCandidate["priority"],
          isPotentialLead: item.isPotentialLead,
          reason: item.reason,
          status: item.status as DiscoveryCandidate["status"],
          leadId: item.leadId ?? undefined,
          createdAt: item.createdAt.toISOString()
        }
      ]));

      this.restoreMap(this.scoreWeightVersions, scoreWeightVersions.map((item) => [
        item.id,
        {
          id: item.id,
          version: item.version,
          weights: fromPrismaJsonRequired<ScoreWeightVersion["weights"]>(item.weights),
          rationale: fromPrismaJsonRequired<string[]>(item.rationale),
          createdAt: item.createdAt.toISOString()
        }
      ]));

      this.refreshCounters();
    } finally {
      this.isHydrating = false;
    }
  }

  private restoreMap<K, V>(map: PersistentMap<K, V>, entries: Array<readonly [K, V]>): void {
    map.clear();
    for (const [key, value] of entries) {
      map.set(key, value);
    }
  }

  private refreshCounters(): void {
    this.counters = {
      user: this.nextCounterValue(this.users),
      campaign: this.nextCounterValue(this.campaigns),
      lead: this.nextCounterValue(this.leads),
      score: this.nextCounterValue(this.scores),
      aiReview: this.nextCounterValue(this.aiReviews),
      aiCache: this.nextCounterValueFromValues(this.aiCache, (item) => item.id),
      interaction: this.nextCounterValue(this.interactions),
      message: this.nextCounterValue(this.messages),
      digitalPresence: this.nextCounterValue(this.digitalPresence),
      websiteSnapshot: this.nextCounterValue(this.websiteSnapshots),
      socialSnapshot: this.nextCounterValue(this.socialSnapshots),
      embedding: this.nextCounterValue(this.embeddings),
      discoveryCandidate: this.nextCounterValue(this.discoveryCandidates),
      scoreWeightVersion: this.nextCounterValue(this.scoreWeightVersions)
    };
  }

  private nextCounterValue(map: Map<number, unknown>): number {
    return this.nextCounterValueFromValues(map, (_item, key) => key);
  }

  private nextCounterValueFromValues<K, V>(map: Map<K, V>, selector: (item: V, key: K) => number): number {
    let max = 0;
    for (const [key, value] of map.entries()) {
      max = Math.max(max, selector(value, key));
    }
    return max + 1;
  }

  private async upsertEntry(name: StoreMapName, _key: unknown, value: unknown): Promise<void> {
    switch (name) {
      case "users": {
        const user = value as AppUser;
        await prisma.user.upsert({
          where: { id: user.id },
          create: {
            id: user.id,
            name: user.name,
            email: user.email,
            passwordHash: user.passwordHash,
            role: user.role,
            createdAt: new Date(user.createdAt),
            updatedAt: new Date(user.updatedAt)
          },
          update: {
            name: user.name,
            email: user.email,
            passwordHash: user.passwordHash,
            role: user.role,
            createdAt: new Date(user.createdAt),
            updatedAt: new Date(user.updatedAt)
          }
        });
        break;
      }
      case "campaigns": {
        const campaign = value as Campaign;
        await prisma.searchCampaign.upsert({
          where: { id: campaign.id },
          create: {
            id: campaign.id,
            name: campaign.name,
            niche: campaign.niche,
            city: campaign.city,
            state: campaign.state,
            country: campaign.country,
            status: campaign.status,
            targetQuantity: campaign.targetQuantity,
            startedAt: toDate(campaign.startedAt),
            finishedAt: toDate(campaign.finishedAt),
            createdAt: new Date(campaign.createdAt),
            updatedAt: new Date(campaign.updatedAt)
          },
          update: {
            name: campaign.name,
            niche: campaign.niche,
            city: campaign.city,
            state: campaign.state,
            country: campaign.country,
            status: campaign.status,
            targetQuantity: campaign.targetQuantity,
            startedAt: toDate(campaign.startedAt),
            finishedAt: toDate(campaign.finishedAt),
            createdAt: new Date(campaign.createdAt),
            updatedAt: new Date(campaign.updatedAt)
          }
        });
        break;
      }
      case "leads": {
        const lead = value as Lead;
        await prisma.lead.upsert({
          where: { id: lead.id },
          create: {
            id: lead.id,
            campaignId: lead.campaignId,
            businessName: lead.businessName,
            personName: lead.personName,
            niche: lead.niche,
            documentNumber: lead.documentNumber,
            documentStatus: lead.documentStatus,
            professionalRegistry: lead.professionalRegistry,
            city: lead.city,
            state: lead.state,
            country: lead.country,
            address: lead.address,
            phone: lead.phone,
            whatsapp: lead.whatsapp,
            email: lead.email,
            websiteUrl: lead.websiteUrl,
            instagramUrl: lead.instagramUrl,
            facebookUrl: lead.facebookUrl,
            linkedinUrl: lead.linkedinUrl,
            googleMapsUrl: lead.googleMapsUrl,
            source: lead.source,
            rawDataJson: toPrismaNullableJson(lead.rawDataJson),
            createdAt: new Date(lead.createdAt),
            updatedAt: new Date(lead.updatedAt)
          },
          update: {
            campaignId: lead.campaignId,
            businessName: lead.businessName,
            personName: lead.personName,
            niche: lead.niche,
            documentNumber: lead.documentNumber,
            documentStatus: lead.documentStatus,
            professionalRegistry: lead.professionalRegistry,
            city: lead.city,
            state: lead.state,
            country: lead.country,
            address: lead.address,
            phone: lead.phone,
            whatsapp: lead.whatsapp,
            email: lead.email,
            websiteUrl: lead.websiteUrl,
            instagramUrl: lead.instagramUrl,
            facebookUrl: lead.facebookUrl,
            linkedinUrl: lead.linkedinUrl,
            googleMapsUrl: lead.googleMapsUrl,
            source: lead.source,
            rawDataJson: toPrismaNullableJson(lead.rawDataJson),
            createdAt: new Date(lead.createdAt),
            updatedAt: new Date(lead.updatedAt)
          }
        });
        break;
      }
      case "scores": {
        const score = value as LeadScore;
        await prisma.leadScore.upsert({
          where: { id: score.id },
          create: {
            id: score.id,
            leadId: score.leadId,
            objectiveScore: score.objectiveScore,
            aiCommercialScore: score.aiCommercialScore,
            digitalPresenceScore: score.digitalPresenceScore,
            embeddingSimilarityScore: score.embeddingSimilarityScore,
            finalScore: score.finalScore,
            temperature: score.temperature,
            recommendedOffer: score.recommendedOffer,
            scoreBreakdownJson: toPrismaJson(score.scoreBreakdownJson),
            aiReasoning: score.aiReasoning,
            createdAt: new Date(score.createdAt),
            updatedAt: new Date(score.updatedAt)
          },
          update: {
            leadId: score.leadId,
            objectiveScore: score.objectiveScore,
            aiCommercialScore: score.aiCommercialScore,
            digitalPresenceScore: score.digitalPresenceScore,
            embeddingSimilarityScore: score.embeddingSimilarityScore,
            finalScore: score.finalScore,
            temperature: score.temperature,
            recommendedOffer: score.recommendedOffer,
            scoreBreakdownJson: toPrismaJson(score.scoreBreakdownJson),
            aiReasoning: score.aiReasoning,
            createdAt: new Date(score.createdAt),
            updatedAt: new Date(score.updatedAt)
          }
        });
        break;
      }
      case "aiReviews": {
        const review = value as AiReview;
        await prisma.leadAiReview.upsert({
          where: { id: review.id },
          create: {
            id: review.id,
            leadId: review.leadId,
            analysisType: review.analysisType,
            model: review.model,
            promptVersion: review.promptVersion,
            inputHash: review.inputHash,
            inputJson: toPrismaJson(review.inputJson),
            outputJson: toPrismaJson(review.outputJson),
            tokensInput: review.tokensInput,
            tokensOutput: review.tokensOutput,
            costEstimate: review.costEstimate,
            summary: review.summary,
            createdAt: new Date(review.createdAt)
          },
          update: {
            leadId: review.leadId,
            analysisType: review.analysisType,
            model: review.model,
            promptVersion: review.promptVersion,
            inputHash: review.inputHash,
            inputJson: toPrismaJson(review.inputJson),
            outputJson: toPrismaJson(review.outputJson),
            tokensInput: review.tokensInput,
            tokensOutput: review.tokensOutput,
            costEstimate: review.costEstimate,
            summary: review.summary,
            createdAt: new Date(review.createdAt)
          }
        });
        break;
      }
      case "aiCache": {
        const cache = value as AiCacheEntry;
        await prisma.aiAnalysisCache.upsert({
          where: {
            entityType_entityId_analysisType_model_promptVersion_inputHash: aiCacheUniqueWhere(cache)
          },
          create: {
            id: cache.id,
            entityType: cache.entityType,
            entityId: normalizeAiCacheEntityId(cache.entityId),
            analysisType: cache.analysisType,
            model: cache.model,
            promptVersion: cache.promptVersion,
            inputHash: cache.inputHash,
            inputJson: aiCacheInputJsonForDb(cache),
            outputJson: toPrismaJson(cache.outputJson),
            tokensInput: cache.tokensInput,
            tokensOutput: cache.tokensOutput,
            costEstimate: cache.costEstimate,
            createdAt: new Date(cache.createdAt)
          },
          update: {
            inputJson: aiCacheInputJsonForDb(cache),
            outputJson: toPrismaJson(cache.outputJson),
            tokensInput: cache.tokensInput,
            tokensOutput: cache.tokensOutput,
            costEstimate: cache.costEstimate,
            createdAt: new Date(cache.createdAt)
          }
        });
        break;
      }
      case "interactions": {
        const interaction = value as CommercialInteraction;
        await prisma.commercialInteraction.upsert({
          where: { id: interaction.id },
          create: {
            id: interaction.id,
            leadId: interaction.leadId,
            status: interaction.status,
            contactChannel: interaction.contactChannel,
            contactedAt: toDate(interaction.contactedAt),
            responseAt: toDate(interaction.responseAt),
            notes: interaction.notes,
            nextActionAt: toDate(interaction.nextActionAt),
            createdAt: new Date(interaction.createdAt),
            updatedAt: new Date(interaction.updatedAt)
          },
          update: {
            leadId: interaction.leadId,
            status: interaction.status,
            contactChannel: interaction.contactChannel,
            contactedAt: toDate(interaction.contactedAt),
            responseAt: toDate(interaction.responseAt),
            notes: interaction.notes,
            nextActionAt: toDate(interaction.nextActionAt),
            createdAt: new Date(interaction.createdAt),
            updatedAt: new Date(interaction.updatedAt)
          }
        });
        break;
      }
      case "messages": {
        const message = value as GeneratedMessage;
        await prisma.generatedMessage.upsert({
          where: { id: message.id },
          create: {
            id: message.id,
            leadId: message.leadId,
            messageType: message.messageType,
            channel: message.channel,
            content: message.content,
            tone: message.tone,
            createdAt: new Date(message.createdAt)
          },
          update: {
            leadId: message.leadId,
            messageType: message.messageType,
            channel: message.channel,
            content: message.content,
            tone: message.tone,
            createdAt: new Date(message.createdAt)
          }
        });
        break;
      }
      case "digitalPresence": {
        const presence = value as DigitalPresence;
        await prisma.leadDigitalPresence.upsert({
          where: { leadId: presence.leadId },
          create: {
            id: presence.id,
            leadId: presence.leadId,
            hasWebsite: presence.hasWebsite,
            websiteUrl: presence.websiteUrl,
            websitePlatform: presence.websitePlatform,
            hasInstagram: presence.hasInstagram,
            hasFacebook: presence.hasFacebook,
            hasLinkedin: presence.hasLinkedin,
            hasGoogleMaps: presence.hasGoogleMaps,
            hasWhatsapp: presence.hasWhatsapp,
            hasLinktree: presence.hasLinktree,
            hasOnlySocialMedia: presence.hasOnlySocialMedia,
            websiteHttpStatus: presence.websiteHttpStatus,
            websiteLoadTimeMs: presence.websiteLoadTimeMs,
            websiteHasSsl: presence.websiteHasSsl,
            websiteIsMobileFriendly: presence.websiteIsMobileFriendly,
            websiteHasCta: presence.websiteHasCta,
            websiteHasWhatsappCta: presence.websiteHasWhatsappCta,
            websiteHasContactForm: presence.websiteHasContactForm,
            websiteHasSeoTitle: presence.websiteHasSeoTitle,
            websiteHasMetaDescription: presence.websiteHasMetaDescription,
            websiteDetectedIssuesJson: toPrismaJson(presence.websiteDetectedIssuesJson),
            websiteQualityScore: presence.websiteQualityScore,
            socialPresenceScore: presence.socialPresenceScore,
            createdAt: new Date(presence.createdAt),
            updatedAt: new Date(presence.updatedAt)
          },
          update: {
            hasWebsite: presence.hasWebsite,
            websiteUrl: presence.websiteUrl,
            websitePlatform: presence.websitePlatform,
            hasInstagram: presence.hasInstagram,
            hasFacebook: presence.hasFacebook,
            hasLinkedin: presence.hasLinkedin,
            hasGoogleMaps: presence.hasGoogleMaps,
            hasWhatsapp: presence.hasWhatsapp,
            hasLinktree: presence.hasLinktree,
            hasOnlySocialMedia: presence.hasOnlySocialMedia,
            websiteHttpStatus: presence.websiteHttpStatus,
            websiteLoadTimeMs: presence.websiteLoadTimeMs,
            websiteHasSsl: presence.websiteHasSsl,
            websiteIsMobileFriendly: presence.websiteIsMobileFriendly,
            websiteHasCta: presence.websiteHasCta,
            websiteHasWhatsappCta: presence.websiteHasWhatsappCta,
            websiteHasContactForm: presence.websiteHasContactForm,
            websiteHasSeoTitle: presence.websiteHasSeoTitle,
            websiteHasMetaDescription: presence.websiteHasMetaDescription,
            websiteDetectedIssuesJson: toPrismaJson(presence.websiteDetectedIssuesJson),
            websiteQualityScore: presence.websiteQualityScore,
            socialPresenceScore: presence.socialPresenceScore,
            createdAt: new Date(presence.createdAt),
            updatedAt: new Date(presence.updatedAt)
          }
        });
        break;
      }
      case "websiteSnapshots": {
        const snapshot = value as WebsiteSnapshot;
        await prisma.leadWebsiteSnapshot.upsert({
          where: { id: snapshot.id },
          create: {
            id: snapshot.id,
            leadId: snapshot.leadId,
            url: snapshot.url,
            httpStatus: snapshot.httpStatus,
            title: snapshot.title,
            metaDescription: snapshot.metaDescription,
            h1: snapshot.h1,
            headingsJson: toPrismaJson(snapshot.headingsJson),
            textSummary: snapshot.textSummary,
            textSample: snapshot.textSample,
            platform: snapshot.platform,
            hasSsl: snapshot.hasSsl,
            loadTimeMs: snapshot.loadTimeMs,
            hasWhatsapp: snapshot.hasWhatsapp,
            hasContactForm: snapshot.hasContactForm,
            hasCta: snapshot.hasCta,
            hasLocation: snapshot.hasLocation,
            hasServices: snapshot.hasServices,
            hasTestimonials: snapshot.hasTestimonials,
            detectedIssuesJson: toPrismaJson(snapshot.detectedIssuesJson),
            rawMetricsJson: toPrismaJson(snapshot.rawMetricsJson),
            snapshotHash: snapshot.snapshotHash,
            aiReviewJson: toPrismaNullableJson(snapshot.aiReview),
            createdAt: new Date(snapshot.createdAt)
          },
          update: {
            leadId: snapshot.leadId,
            url: snapshot.url,
            httpStatus: snapshot.httpStatus,
            title: snapshot.title,
            metaDescription: snapshot.metaDescription,
            h1: snapshot.h1,
            headingsJson: toPrismaJson(snapshot.headingsJson),
            textSummary: snapshot.textSummary,
            textSample: snapshot.textSample,
            platform: snapshot.platform,
            hasSsl: snapshot.hasSsl,
            loadTimeMs: snapshot.loadTimeMs,
            hasWhatsapp: snapshot.hasWhatsapp,
            hasContactForm: snapshot.hasContactForm,
            hasCta: snapshot.hasCta,
            hasLocation: snapshot.hasLocation,
            hasServices: snapshot.hasServices,
            hasTestimonials: snapshot.hasTestimonials,
            detectedIssuesJson: toPrismaJson(snapshot.detectedIssuesJson),
            rawMetricsJson: toPrismaJson(snapshot.rawMetricsJson),
            snapshotHash: snapshot.snapshotHash,
            aiReviewJson: toPrismaNullableJson(snapshot.aiReview),
            createdAt: new Date(snapshot.createdAt)
          }
        });
        break;
      }
      case "socialSnapshots": {
        const snapshot = value as SocialSnapshot;
        await prisma.leadSocialSnapshot.upsert({
          where: { id: snapshot.id },
          create: {
            id: snapshot.id,
            leadId: snapshot.leadId,
            platform: snapshot.platform,
            profileUrl: snapshot.profileUrl,
            bioText: snapshot.bioText,
            externalLink: snapshot.externalLink,
            hasWhatsapp: snapshot.hasWhatsapp,
            hasWebsiteLink: snapshot.hasWebsiteLink,
            estimatedPostCount: snapshot.estimatedPostCount,
            lastActivitySignal: snapshot.lastActivitySignal,
            contentSignalsJson: toPrismaJson(snapshot.contentSignalsJson),
            rawMetricsJson: toPrismaJson(snapshot.rawMetricsJson),
            snapshotHash: snapshot.snapshotHash,
            aiReviewJson: toPrismaNullableJson(snapshot.aiReview),
            createdAt: new Date(snapshot.createdAt)
          },
          update: {
            leadId: snapshot.leadId,
            platform: snapshot.platform,
            profileUrl: snapshot.profileUrl,
            bioText: snapshot.bioText,
            externalLink: snapshot.externalLink,
            hasWhatsapp: snapshot.hasWhatsapp,
            hasWebsiteLink: snapshot.hasWebsiteLink,
            estimatedPostCount: snapshot.estimatedPostCount,
            lastActivitySignal: snapshot.lastActivitySignal,
            contentSignalsJson: toPrismaJson(snapshot.contentSignalsJson),
            rawMetricsJson: toPrismaJson(snapshot.rawMetricsJson),
            snapshotHash: snapshot.snapshotHash,
            aiReviewJson: toPrismaNullableJson(snapshot.aiReview),
            createdAt: new Date(snapshot.createdAt)
          }
        });
        break;
      }
      case "embeddings": {
        const embedding = value as LeadEmbedding;
        await prisma.leadEmbedding.upsert({
          where: { id: embedding.id },
          create: {
            id: embedding.id,
            leadId: embedding.leadId,
            embeddingType: embedding.embeddingType,
            sourceText: embedding.sourceText,
            embeddingVector: toPrismaJson(embedding.embeddingVector),
            model: embedding.model,
            metadataJson: toPrismaNullableJson(embedding.metadataJson),
            createdAt: new Date(embedding.createdAt)
          },
          update: {
            leadId: embedding.leadId,
            embeddingType: embedding.embeddingType,
            sourceText: embedding.sourceText,
            embeddingVector: toPrismaJson(embedding.embeddingVector),
            model: embedding.model,
            metadataJson: toPrismaNullableJson(embedding.metadataJson),
            createdAt: new Date(embedding.createdAt)
          }
        });
        break;
      }
      case "discoveryCandidates": {
        const candidate = value as DiscoveryCandidate;
        await prisma.discoveryCandidate.upsert({
          where: { id: candidate.id },
          create: {
            id: candidate.id,
            campaignId: candidate.campaignId,
            leadId: candidate.leadId,
            title: candidate.title,
            url: candidate.url,
            snippet: candidate.snippet,
            source: candidate.source,
            priority: candidate.priority,
            isPotentialLead: candidate.isPotentialLead,
            reason: candidate.reason,
            status: candidate.status,
            createdAt: new Date(candidate.createdAt)
          },
          update: {
            campaignId: candidate.campaignId,
            leadId: candidate.leadId,
            title: candidate.title,
            url: candidate.url,
            snippet: candidate.snippet,
            source: candidate.source,
            priority: candidate.priority,
            isPotentialLead: candidate.isPotentialLead,
            reason: candidate.reason,
            status: candidate.status,
            createdAt: new Date(candidate.createdAt)
          }
        });
        break;
      }
      case "scoreWeightVersions": {
        const version = value as ScoreWeightVersion;
        await prisma.scoreWeightVersion.upsert({
          where: { id: version.id },
          create: {
            id: version.id,
            version: version.version,
            weights: toPrismaJson(version.weights),
            rationale: toPrismaJson(version.rationale),
            createdAt: new Date(version.createdAt)
          },
          update: {
            version: version.version,
            weights: toPrismaJson(version.weights),
            rationale: toPrismaJson(version.rationale),
            createdAt: new Date(version.createdAt)
          }
        });
        break;
      }
    }
  }

  private async deleteEntry(name: StoreMapName, key: unknown, value: unknown): Promise<void> {
    switch (name) {
      case "campaigns": {
        await this.deleteCampaignCascade(Number(key));
        break;
      }
      case "leads": {
        await this.deleteLeadCascade(Number(key));
        break;
      }
      case "scores":
        await prisma.leadScore.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
      case "aiReviews":
        await prisma.leadAiReview.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
      case "aiCache": {
        const cache = value as AiCacheEntry | undefined;
        if (!cache) return;
        await prisma.aiAnalysisCache.delete({
          where: {
            entityType_entityId_analysisType_model_promptVersion_inputHash: aiCacheUniqueWhere(cache)
          }
        }).catch(() => undefined);
        break;
      }
      case "interactions":
        await prisma.commercialInteraction.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
      case "messages":
        await prisma.generatedMessage.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
      case "digitalPresence":
        await prisma.leadDigitalPresence.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
      case "websiteSnapshots":
        await prisma.leadWebsiteSnapshot.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
      case "socialSnapshots":
        await prisma.leadSocialSnapshot.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
      case "embeddings":
        await prisma.leadEmbedding.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
      case "discoveryCandidates":
        await prisma.discoveryCandidate.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
      case "scoreWeightVersions":
        await prisma.scoreWeightVersion.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
      case "users":
        await prisma.user.delete({ where: { id: Number(key) } }).catch(() => undefined);
        break;
    }
  }

  private async clearEntries(name: StoreMapName): Promise<void> {
    switch (name) {
      case "users":
        await prisma.user.deleteMany();
        break;
      case "campaigns":
        await prisma.searchCampaign.deleteMany();
        break;
      case "leads":
        await prisma.lead.deleteMany();
        break;
      case "scores":
        await prisma.leadScore.deleteMany();
        break;
      case "aiReviews":
        await prisma.leadAiReview.deleteMany();
        break;
      case "aiCache":
        await prisma.aiAnalysisCache.deleteMany();
        break;
      case "interactions":
        await prisma.commercialInteraction.deleteMany();
        break;
      case "messages":
        await prisma.generatedMessage.deleteMany();
        break;
      case "digitalPresence":
        await prisma.leadDigitalPresence.deleteMany();
        break;
      case "websiteSnapshots":
        await prisma.leadWebsiteSnapshot.deleteMany();
        break;
      case "socialSnapshots":
        await prisma.leadSocialSnapshot.deleteMany();
        break;
      case "embeddings":
        await prisma.leadEmbedding.deleteMany();
        break;
      case "discoveryCandidates":
        await prisma.discoveryCandidate.deleteMany();
        break;
      case "scoreWeightVersions":
        await prisma.scoreWeightVersion.deleteMany();
        break;
    }
  }

  private async deleteCampaignCascade(campaignId: number): Promise<void> {
    const leadIds = Array.from(this.leads.values())
      .filter((lead) => lead.campaignId === campaignId)
      .map((lead) => lead.id);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const leadId of leadIds) {
        await tx.discoveryCandidate.deleteMany({ where: { leadId } });
        await tx.leadScore.deleteMany({ where: { leadId } });
        await tx.leadAiReview.deleteMany({ where: { leadId } });
        await tx.commercialInteraction.deleteMany({ where: { leadId } });
        await tx.generatedMessage.deleteMany({ where: { leadId } });
        await tx.leadDigitalPresence.deleteMany({ where: { leadId } });
        await tx.leadWebsiteSnapshot.deleteMany({ where: { leadId } });
        await tx.leadSocialSnapshot.deleteMany({ where: { leadId } });
        await tx.leadEmbedding.deleteMany({ where: { leadId } });
        await tx.lead.deleteMany({ where: { id: leadId } });
      }

      await tx.discoveryCandidate.deleteMany({ where: { campaignId } });
      await tx.searchCampaign.deleteMany({ where: { id: campaignId } });
    });
  }

  private async deleteLeadCascade(leadId: number): Promise<void> {
    await prisma.$transaction([
      prisma.discoveryCandidate.deleteMany({ where: { leadId } }),
      prisma.leadScore.deleteMany({ where: { leadId } }),
      prisma.leadAiReview.deleteMany({ where: { leadId } }),
      prisma.commercialInteraction.deleteMany({ where: { leadId } }),
      prisma.generatedMessage.deleteMany({ where: { leadId } }),
      prisma.leadDigitalPresence.deleteMany({ where: { leadId } }),
      prisma.leadWebsiteSnapshot.deleteMany({ where: { leadId } }),
      prisma.leadSocialSnapshot.deleteMany({ where: { leadId } }),
      prisma.leadEmbedding.deleteMany({ where: { leadId } }),
      prisma.lead.deleteMany({ where: { id: leadId } })
    ]);
  }
}

export const store = new MemoryStore();
