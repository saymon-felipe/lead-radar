import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { serializeInteraction, serializeMessage } from "../../shared/http/serializers.js";
import type { GeneratedMessage, Lead } from "../../shared/types.js";
import { inputHash } from "../../shared/utils/hash.js";
import { createOrUpdateObjectiveScore, latestScoreForLead } from "../scoring/scoring.service.js";

const promptVersion = "mvp-2026-06-20";
const model = process.env.OPENAI_MODEL ?? "gpt-5-nano";

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

async function leadInput(lead: Lead): Promise<Record<string, unknown>> {
  const score = (await latestScoreForLead(lead.organizationId, lead.id)) ?? (await createOrUpdateObjectiveScore(lead));
  const interactions = await prisma.commercialInteraction.findMany({
    where: { organizationId: lead.organizationId, leadId: lead.id },
    orderBy: { updatedAt: "desc" },
    take: 20
  });
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
    interactions: interactions.map((interaction) => {
      const serialized = serializeInteraction(interaction);
      return {
        status: serialized.status,
        contactChannel: serialized.contactChannel,
        notes: serialized.notes
      };
    })
  };
}

async function fallbackReview(lead: Lead) {
  const score = (await latestScoreForLead(lead.organizationId, lead.id)) ?? (await createOrUpdateObjectiveScore(lead));
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

async function persistAiReview(
  lead: Lead,
  analysisType: "lead_final_review" | "message_generation",
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  summary?: string
) {
  const hash = inputHash(input);
  await prisma.aiAnalysisCache.upsert({
    where: {
      organizationId_entityType_entityId_analysisType_model_promptVersion_inputHash: {
        organizationId: lead.organizationId,
        entityType: "lead",
        entityId: String(lead.id),
        analysisType,
        model,
        promptVersion,
        inputHash: hash
      }
    },
    create: {
      organizationId: lead.organizationId,
      entityType: "lead",
      entityId: String(lead.id),
      analysisType,
      model,
      promptVersion,
      inputHash: hash,
      inputJson: input as any,
      outputJson: output as any
    },
    update: {
      outputJson: output as any
    }
  });

  return prisma.leadAiReview.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      analysisType,
      model,
      promptVersion,
      inputHash: hash,
      inputJson: input as any,
      outputJson: output as any,
      summary
    }
  });
}

async function cachedAiOutput(lead: Lead, analysisType: string, input: Record<string, unknown>) {
  const hash = inputHash(input);
  return prisma.aiAnalysisCache.findUnique({
    where: {
      organizationId_entityType_entityId_analysisType_model_promptVersion_inputHash: {
        organizationId: lead.organizationId,
        entityType: "lead",
        entityId: String(lead.id),
        analysisType,
        model,
        promptVersion,
        inputHash: hash
      }
    }
  });
}

export async function reviewLead(lead: Lead) {
  const input = await leadInput(lead);
  const cached = await cachedAiOutput(lead, "lead_final_review", input);
  const output =
    cached?.outputJson ??
    (await callOpenAi(
      input,
      "Você é um analista comercial B2B. Retorne apenas JSON válido para classificação comercial do lead. Não invente dados.",
      finalReviewSchema
    )) ??
    (await fallbackReview(lead));

  const parsed = finalReviewSchema.parse(output);
  await persistAiReview(lead, "lead_final_review", input, parsed, parsed.summary);
  await createOrUpdateObjectiveScore(lead);
  return parsed;
}

export async function generateMessage(lead: Lead): Promise<GeneratedMessage> {
  const input = {
    ...(await leadInput(lead)),
    rules: [
      "Não parecer spam",
      "Não prometer resultado",
      "Não mencionar scraping, IA ou automação",
      "Ter CTA leve"
    ]
  };
  const cached = await cachedAiOutput(lead, "message_generation", input);
  const output =
    cached?.outputJson ??
    (await callOpenAi(
      input,
      "Você é um especialista em prospecção B2B consultiva. Retorne apenas JSON válido com uma mensagem curta para contato humano manual.",
      messageSchema
    )) ??
    fallbackMessage(lead);

  const parsed = messageSchema.parse(output);
  await persistAiReview(lead, "message_generation", input, parsed, parsed.message);

  const message = await prisma.generatedMessage.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      messageType: "first_contact",
      channel: parsed.channel,
      content: parsed.message,
      tone: parsed.tone
    }
  });
  return serializeMessage(message);
}
