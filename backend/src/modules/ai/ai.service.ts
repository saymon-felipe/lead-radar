import OpenAI from "openai";
import { z } from "zod";
import { store } from "../../shared/store/memory-store.js";
import type { AiReview, GeneratedMessage, Lead } from "../../shared/types.js";
import { inputHash } from "../../shared/utils/hash.js";
import { createOrUpdateObjectiveScore, latestScoreForLead } from "../scoring/scoring.service.js";

const promptVersion = "mvp-2026-06-20";
const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

export const finalReviewSchema = z.object({
  aiCommercialScore: z.number().int().min(0).max(100),
  temperature: z.enum(["hot", "warm", "medium", "cold", "discard"]),
  recommendedOffer: z.enum(["landing_page", "institutional_site", "redesign", "seo_local", "maintenance", "no_offer"]),
  summary: z.string(),
  salesAngle: z.string(),
  riskFactors: z.array(z.string()),
  bestContactStrategy: z.string(),
  confidence: z.number().min(0).max(1)
});

export const messageSchema = z.object({
  message: z.string(),
  tone: z.literal("consultative"),
  channel: z.enum(["whatsapp", "email", "instagram"]),
  cta: z.string()
});

function cacheKey(entityType: string, entityId: string, analysisType: string, hash: string): string {
  return [entityType, entityId, analysisType, model, promptVersion, hash].join(":");
}

function leadInput(lead: Lead): Record<string, unknown> {
  const score = latestScoreForLead(lead.id) ?? createOrUpdateObjectiveScore(lead);
  const interactions = Array.from(store.interactions.values()).filter((interaction) => interaction.leadId === lead.id);
  return {
    lead: {
      businessName: lead.businessName,
      personName: lead.personName,
      niche: lead.niche,
      city: lead.city,
      state: lead.state,
      documentStatus: lead.documentStatus,
      professionalRegistry: lead.professionalRegistry,
      hasWhatsapp: Boolean(lead.whatsapp),
      hasWebsite: Boolean(lead.websiteUrl),
      hasInstagram: Boolean(lead.instagramUrl),
      hasGoogleMaps: Boolean(lead.googleMapsUrl)
    },
    scores: {
      objectiveScore: score.objectiveScore,
      finalScore: score.finalScore,
      temperature: score.temperature,
      recommendedOffer: score.recommendedOffer
    },
    detectedIssues: score.scoreBreakdownJson.filter((item) => item.applied).map((item) => item.label),
    interactions: interactions.map((interaction) => ({
      status: interaction.status,
      contactChannel: interaction.contactChannel,
      notes: interaction.notes
    }))
  };
}

function fallbackReview(lead: Lead) {
  const score = latestScoreForLead(lead.id) ?? createOrUpdateObjectiveScore(lead);
  return finalReviewSchema.parse({
    aiCommercialScore: score.finalScore,
    temperature: score.temperature,
    recommendedOffer: score.recommendedOffer === "google_business_optimization" ? "seo_local" : score.recommendedOffer,
    summary: `Lead priorizado pelo score objetivo (${score.finalScore}) com base nos sinais disponíveis.`,
    salesAngle: lead.websiteUrl
      ? "Apresentar melhoria objetiva de conversão, clareza e presença local."
      : "Mostrar como uma página própria centraliza autoridade, serviços e contato por WhatsApp.",
    riskFactors: lead.whatsapp ? [] : ["Contato direto por WhatsApp não encontrado."],
    bestContactStrategy: "Abordagem consultiva manual com diagnóstico rápido e CTA leve.",
    confidence: 0.68
  });
}

function fallbackMessage(lead: Lead) {
  const city = lead.city || "sua cidade";
  const name = lead.personName || lead.businessName;
  return messageSchema.parse({
    message: `Olá, ${name}. Vi que você atende em ${city} e encontrei sua presença profissional online. Notei uma oportunidade de organizar melhor suas informações, serviços e contato em uma página simples e objetiva. Posso te enviar uma análise rápida de como isso ficaria?`,
    tone: "consultative",
    channel: lead.whatsapp ? "whatsapp" : lead.instagramUrl ? "instagram" : "email",
    cta: "Posso te enviar uma análise rápida?"
  });
}

async function callOpenAi<T>(input: Record<string, unknown>, system: string, schema: z.ZodType<T>): Promise<T | undefined> {
  if (!process.env.OPENAI_API_KEY) return undefined;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(input) }
    ]
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) return undefined;
  return schema.parse(JSON.parse(raw));
}

function persistAiReview(
  leadId: number,
  analysisType: AiReview["analysisType"],
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  summary?: string
) {
  const hash = inputHash(input);
  const now = new Date().toISOString();
  const cacheId = cacheKey("lead", String(leadId), analysisType, hash);
  store.aiCache.set(cacheId, {
    id: store.nextId("aiCache"),
    entityType: "lead",
    entityId: String(leadId),
    analysisType,
    model,
    promptVersion,
    inputHash: hash,
    inputJson: input,
    outputJson: output,
    createdAt: now
  });

  const review: AiReview = {
    id: store.nextId("aiReview"),
    leadId,
    analysisType,
    model,
    promptVersion,
    inputHash: hash,
    inputJson: input,
    outputJson: output,
    summary,
    createdAt: now
  };
  store.aiReviews.set(review.id, review);
  return review;
}

export async function reviewLead(lead: Lead) {
  const input = leadInput(lead);
  const hash = inputHash(input);
  const cached = store.aiCache.get(cacheKey("lead", String(lead.id), "lead_final_review", hash));
  const output = cached?.outputJson ?? (await callOpenAi(
    input,
    "Você é um analista comercial B2B. Retorne apenas JSON válido para classificação comercial do lead. Não invente dados.",
    finalReviewSchema
  )) ?? fallbackReview(lead);

  const parsed = finalReviewSchema.parse(output);
  persistAiReview(lead.id, "lead_final_review", input, parsed, parsed.summary);
  createOrUpdateObjectiveScore(lead);
  return parsed;
}

export async function generateMessage(lead: Lead): Promise<GeneratedMessage> {
  const input = {
    ...leadInput(lead),
    rules: [
      "Não parecer spam",
      "Não prometer resultado",
      "Não mencionar scraping, IA ou automação",
      "Ter CTA leve"
    ]
  };
  const hash = inputHash(input);
  const cached = store.aiCache.get(cacheKey("lead", String(lead.id), "message_generation", hash));
  const output = cached?.outputJson ?? (await callOpenAi(
    input,
    "Você é um especialista em prospecção B2B consultiva. Retorne apenas JSON válido com uma mensagem curta para contato humano manual.",
    messageSchema
  )) ?? fallbackMessage(lead);

  const parsed = messageSchema.parse(output);
  persistAiReview(lead.id, "message_generation", input, parsed, parsed.message);

  const message: GeneratedMessage = {
    id: store.nextId("message"),
    leadId: lead.id,
    messageType: "first_contact",
    channel: parsed.channel,
    content: parsed.message,
    tone: parsed.tone,
    createdAt: new Date().toISOString()
  };
  store.messages.set(message.id, message);
  return message;
}
