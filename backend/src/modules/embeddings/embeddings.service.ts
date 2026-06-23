// @ts-nocheck
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { store } from "../../shared/store/memory-store.js";
import type { EmbeddingType, Lead, LeadEmbedding, SimilarLeadResult } from "../../shared/types.js";
import { createOrUpdateObjectiveScore } from "../scoring/scoring.service.js";

const fallbackModel = "local-hash-embedding-v1";
const openAiEmbeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function idealProfileText(niche: string): string {
  const normalizedNiche = normalize(niche);
  if (normalizedNiche.includes("psicolog")) {
    return "Psicólogo local com Instagram ativo, WhatsApp público, atuação clara, sem site próprio e presença digital fragmentada.";
  }
  return `${niche} local com canal de contato público, atuação clara, baixa presença digital própria e oportunidade de organizar site, SEO local ou landing page.`;
}

function hashEmbedding(text: string, dimensions = 96): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    for (let i = 0; i < dimensions; i += 1) {
      vector[i] += (digest[i % digest.length] - 128) / 128;
    }
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

async function createVector(text: string): Promise<{ vector: number[]; model: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { vector: hashEmbedding(text), model: fallbackModel };
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.embeddings.create({
    model: openAiEmbeddingModel,
    input: text
  });
  return { vector: response.data[0].embedding, model: openAiEmbeddingModel };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function leadProfileText(lead: Lead): string {
  const websiteSummary = Array.from(store.websiteSnapshots.values())
    .filter((snapshot) => snapshot.leadId === lead.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const socialSummary = Array.from(store.socialSnapshots.values())
    .filter((snapshot) => snapshot.leadId === lead.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const score = Array.from(store.scores.values())
    .filter((item) => item.leadId === lead.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  return [
    `Lead: ${lead.businessName}`,
    `Nicho: ${lead.niche}`,
    `Cidade: ${lead.city}/${lead.state}`,
    `Tem site: ${lead.websiteUrl ? "sim" : "não"}`,
    `Tem Instagram: ${lead.instagramUrl ? "sim" : "não"}`,
    `Tem WhatsApp: ${lead.whatsapp ? "sim" : "não"}`,
    `Oferta recomendada: ${score?.recommendedOffer ?? "desconhecida"}`,
    websiteSummary?.textSummary ? `Resumo do site: ${websiteSummary.textSummary}` : "",
    socialSummary?.bioText ? `Resumo social: ${socialSummary.bioText}` : "",
    score ? `Sinais: ${score.scoreBreakdownJson.filter((item) => item.applied).map((item) => item.label).join(", ")}` : ""
  ].filter(Boolean).join("\n");
}

async function saveEmbedding(
  embeddingType: EmbeddingType,
  sourceText: string,
  leadId?: number,
  metadataJson?: Record<string, unknown>
): Promise<LeadEmbedding> {
  const { vector, model } = await createVector(sourceText);
  const embedding: LeadEmbedding = {
    id: store.nextId("embedding"),
    leadId,
    embeddingType,
    sourceText,
    embeddingVector: vector,
    model,
    metadataJson,
    createdAt: new Date().toISOString()
  };
  store.embeddings.set(embedding.id, embedding);
  return embedding;
}

async function ensureIdealProfile(niche: string): Promise<LeadEmbedding> {
  const sourceText = idealProfileText(niche);
  const existing = Array.from(store.embeddings.values()).find(
    (embedding) => embedding.embeddingType === "ideal_profile" && normalize(embedding.sourceText) === normalize(sourceText)
  );
  if (existing) return existing;
  return saveEmbedding("ideal_profile", sourceText, undefined, { niche });
}

export async function rebuildLeadEmbeddings(lead: Lead): Promise<LeadEmbedding[]> {
  const ideal = await ensureIdealProfile(lead.niche);
  const profileText = leadProfileText(lead);
  const profileVector = await createVector(profileText);
  const idealSimilarity = cosineSimilarity(profileVector.vector, ideal.embeddingVector);
  const profileEmbedding: LeadEmbedding = {
    id: store.nextId("embedding"),
    leadId: lead.id,
    embeddingType: "lead_profile",
    sourceText: profileText,
    embeddingVector: profileVector.vector,
    model: profileVector.model,
    metadataJson: {
      idealEmbeddingId: ideal.id,
      idealSimilarity,
      idealSimilarityScore: Math.round(((idealSimilarity + 1) / 2) * 100)
    },
    createdAt: new Date().toISOString()
  };
  store.embeddings.set(profileEmbedding.id, profileEmbedding);

  const created = [profileEmbedding, ideal];
  const website = Array.from(store.websiteSnapshots.values())
    .filter((snapshot) => snapshot.leadId === lead.id && snapshot.textSummary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (website?.textSummary) {
    created.push(await saveEmbedding("website_summary", website.textSummary, lead.id));
  }

  const social = Array.from(store.socialSnapshots.values())
    .filter((snapshot) => snapshot.leadId === lead.id && snapshot.bioText)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (social?.bioText) {
    created.push(await saveEmbedding("social_summary", social.bioText, lead.id));
  }

  createOrUpdateObjectiveScore(lead);
  return created;
}

export async function rebuildCampaignEmbeddings(campaignId: number): Promise<LeadEmbedding[]> {
  const leads = Array.from(store.leads.values()).filter((lead) => lead.campaignId === campaignId);
  const created: LeadEmbedding[] = [];
  for (const lead of leads) {
    created.push(...(await rebuildLeadEmbeddings(lead)));
  }
  return created;
}

export async function registerCommercialMemory(lead: Lead, status: "won" | "lost"): Promise<LeadEmbedding> {
  const type: EmbeddingType = status === "won" ? "conversion_profile" : "lost_profile";
  return saveEmbedding(type, leadProfileText(lead), lead.id, { status });
}

export async function similarLeads(lead: Lead, limit = 10): Promise<SimilarLeadResult[]> {
  let base = Array.from(store.embeddings.values())
    .filter((embedding) => embedding.leadId === lead.id && embedding.embeddingType === "lead_profile")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!base) {
    [base] = await rebuildLeadEmbeddings(lead);
  }

  return Array.from(store.embeddings.values())
    .filter((embedding) => embedding.id !== base.id && embedding.embeddingType !== "ideal_profile")
    .map((embedding) => ({
      leadId: embedding.leadId,
      embeddingId: embedding.id,
      embeddingType: embedding.embeddingType,
      sourceText: embedding.sourceText,
      similarity: cosineSimilarity(base.embeddingVector, embedding.embeddingVector),
      lead: embedding.leadId ? store.leads.get(embedding.leadId) : undefined
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
