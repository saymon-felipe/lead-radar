import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext, requireRole } from "../../shared/auth/guard.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { serializeEmbedding, serializeLead } from "../../shared/http/serializers.js";
import { rebuildLeadEmbeddings } from "./embeddings.service.js";

async function findLead(organizationId: number, id: number) {
  const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
  if (!lead) throw new HttpError(404, "Lead não encontrado");
  return serializeLead(lead);
}

async function persistEmbedding(organizationId: number, embedding: any) {
  const created = await prisma.leadEmbedding.create({
    data: {
      organizationId,
      leadId: embedding.leadId,
      embeddingType: embedding.embeddingType,
      sourceText: embedding.sourceText,
      embeddingVector: embedding.embeddingVector as any,
      model: embedding.model,
      metadataJson: embedding.metadataJson as any,
      createdAt: embedding.createdAt ? new Date(embedding.createdAt) : undefined
    }
  });
  return serializeEmbedding(created);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

export async function embeddingRoutes(app: FastifyInstance) {
  app.post("/api/leads/:id/embeddings", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = await findLead(organizationId, id);
    const embeddings = [];
    for (const embedding of await rebuildLeadEmbeddings(lead)) {
      embeddings.push(await persistEmbedding(organizationId, embedding));
    }
    return { created: embeddings.length, embeddings };
  });

  app.post("/api/campaigns/:id/embeddings/rebuild", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const campaign = await prisma.searchCampaign.findFirst({ where: { id, organizationId } });
    if (!campaign) throw new HttpError(404, "Campanha não encontrada");
    const leads = await prisma.lead.findMany({ where: { organizationId, campaignId: id } });
    const embeddings = [];
    for (const leadRecord of leads) {
      for (const embedding of await rebuildLeadEmbeddings(serializeLead(leadRecord))) {
        embeddings.push(await persistEmbedding(organizationId, embedding));
      }
    }
    return { created: embeddings.length, embeddings };
  });

  app.get("/api/leads/:id/similar", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }).parse(request.query);
    await findLead(organizationId, id);
    const base = await prisma.leadEmbedding.findFirst({
      where: { organizationId, leadId: id, embeddingType: "lead_profile" },
      orderBy: { createdAt: "desc" }
    });
    if (!base || !Array.isArray(base.embeddingVector)) return [];
    const others = await prisma.leadEmbedding.findMany({
      where: { organizationId, embeddingType: "lead_profile", leadId: { not: id } },
      include: { lead: true },
      orderBy: { createdAt: "desc" },
      take: 500
    });
    return others
      .filter((embedding) => Array.isArray(embedding.embeddingVector))
      .map((embedding) => ({
        leadId: embedding.leadId ?? undefined,
        embeddingId: embedding.id,
        embeddingType: embedding.embeddingType,
        sourceText: embedding.sourceText,
        similarity: cosineSimilarity(base.embeddingVector as number[], embedding.embeddingVector as number[]),
        lead: embedding.lead ? serializeLead(embedding.lead) : undefined
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, query.limit);
  });
}
