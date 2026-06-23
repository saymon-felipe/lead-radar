import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext, requireRole } from "../../shared/auth/guard.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  serializeAiReview,
  serializeDigitalPresence,
  serializeEmbedding,
  serializeInteraction,
  serializeLead,
  serializeMessage,
  serializeScore,
  serializeSocialSnapshot,
  serializeWebsiteSnapshot
} from "../../shared/http/serializers.js";
import { inputHash } from "../../shared/utils/hash.js";
import type { Lead } from "../../shared/types.js";
import { createOrUpdateObjectiveScore, latestScoreForLead } from "../scoring/scoring.service.js";

const websiteSignalsSchema = z.object({
  hasSsl: z.boolean().optional(),
  isSlow: z.boolean().optional(),
  isOutdated: z.boolean().optional(),
  hasCta: z.boolean().optional(),
  hasWhatsappCta: z.boolean().optional(),
  hasSeoTitle: z.boolean().optional(),
  hasMetaDescription: z.boolean().optional()
});

const leadPayload = z.object({
  campaignId: z.number().int().positive().optional(),
  businessName: z.string().min(1),
  personName: z.string().optional(),
  niche: z.string().min(1),
  documentNumber: z.string().optional(),
  documentStatus: z.string().optional(),
  professionalRegistry: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().default("BR"),
  address: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  instagramUrl: z.string().url().optional().or(z.literal("")),
  facebookUrl: z.string().url().optional().or(z.literal("")),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  googleMapsUrl: z.string().url().optional().or(z.literal("")),
  source: z.string().default("manual"),
  rawDataJson: z.record(z.unknown()).optional(),
  websiteSignals: websiteSignalsSchema.optional()
});

const csvImportPayload = z.object({
  campaignId: z.number().int().positive().optional(),
  csv: z.string().min(1)
});

const leadQuery = z.object({
  campaignId: z.coerce.number().int().optional(),
  niche: z.string().optional(),
  city: z.string().optional(),
  temperature: z.string().optional(),
  recommendedOffer: z.string().optional(),
  hasWebsite: z.enum(["true", "false"]).optional(),
  hasWhatsapp: z.enum(["true", "false"]).optional(),
  hasInstagram: z.enum(["true", "false"]).optional(),
  status: z.string().optional(),
  minScore: z.coerce.number().int().optional(),
  maxScore: z.coerce.number().int().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(100)
});

function normalizeOptionalString(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function leadDataFromPayload(payload: z.infer<typeof leadPayload>, organizationId: number) {
  return {
    organizationId,
    campaignId: payload.campaignId,
    businessName: payload.businessName,
    personName: normalizeOptionalString(payload.personName),
    niche: payload.niche,
    documentNumber: normalizeOptionalString(payload.documentNumber),
    documentStatus: normalizeOptionalString(payload.documentStatus),
    professionalRegistry: normalizeOptionalString(payload.professionalRegistry),
    city: payload.city,
    state: payload.state,
    country: payload.country,
    address: normalizeOptionalString(payload.address),
    phone: normalizeOptionalString(payload.phone),
    whatsapp: normalizeOptionalString(payload.whatsapp),
    email: normalizeOptionalString(payload.email),
    websiteUrl: normalizeOptionalString(payload.websiteUrl),
    instagramUrl: normalizeOptionalString(payload.instagramUrl),
    facebookUrl: normalizeOptionalString(payload.facebookUrl),
    linkedinUrl: normalizeOptionalString(payload.linkedinUrl),
    googleMapsUrl: normalizeOptionalString(payload.googleMapsUrl),
    source: payload.source,
    rawDataJson: payload.rawDataJson ? ({ ...payload.rawDataJson, websiteSignals: payload.websiteSignals } as any) : undefined
  };
}

async function assertCampaignBelongsToOrganization(organizationId: number, campaignId?: number) {
  if (!campaignId) return;
  const campaign = await prisma.searchCampaign.findFirst({ where: { id: campaignId, organizationId } });
  if (!campaign) throw new HttpError(400, "A campanha informada não existe");
}

async function findLead(organizationId: number, id: number) {
  const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
  if (!lead) throw new HttpError(404, "Lead não encontrado");
  return lead;
}

function leadWhereFromQuery(organizationId: number, query: z.infer<typeof leadQuery>) {
  const where: any = { organizationId };
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.niche) where.niche = { contains: query.niche };
  if (query.city) where.city = { contains: query.city };
  if (query.hasWebsite) where.websiteUrl = query.hasWebsite === "true" ? { not: null } : null;
  if (query.hasWhatsapp) where.whatsapp = query.hasWhatsapp === "true" ? { not: null } : null;
  if (query.hasInstagram) where.instagramUrl = query.hasInstagram === "true" ? { not: null } : null;
  if (query.temperature || query.recommendedOffer || query.minScore !== undefined || query.maxScore !== undefined) {
    where.scores = {
      some: {
        organizationId,
        ...(query.temperature ? { temperature: query.temperature } : {}),
        ...(query.recommendedOffer ? { recommendedOffer: query.recommendedOffer } : {}),
        ...(query.minScore !== undefined || query.maxScore !== undefined
          ? { finalScore: { gte: query.minScore, lte: query.maxScore } }
          : {})
      }
    };
  }
  if (query.status) {
    where.interactions = { some: { organizationId, status: query.status } };
  }
  return where;
}

async function leadWithComputedFields(record: any) {
  const lead = serializeLead(record);
  const [score, latestInteraction] = await Promise.all([
    latestScoreForLead(lead.organizationId, lead.id),
    prisma.commercialInteraction.findFirst({
      where: { organizationId: lead.organizationId, leadId: lead.id },
      orderBy: { updatedAt: "desc" }
    })
  ]);
  return {
    ...lead,
    score,
    latestInteraction: latestInteraction ? serializeInteraction(latestInteraction) : undefined
  };
}

export async function leadRoutes(app: FastifyInstance) {
  app.get("/api/leads", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const query = leadQuery.parse(request.query);
    const leads = await prisma.lead.findMany({
      where: leadWhereFromQuery(organizationId, query),
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    });
    return Promise.all(leads.map(leadWithComputedFields));
  });

  app.post("/api/leads", async (request, reply) => {
    const { organizationId } = requireRole(request, "operator");
    const payload = leadPayload.parse(request.body);
    await assertCampaignBelongsToOrganization(organizationId, payload.campaignId);

    const created = await prisma.lead.create({ data: leadDataFromPayload(payload, organizationId) });
    const lead = serializeLead(created);
    const score = await createOrUpdateObjectiveScore(lead);
    reply.code(201);
    return { ...lead, score };
  });

  app.post("/api/leads/import", async (request, reply) => {
    const context = requireRole(request, "operator");
    const payload = csvImportPayload.parse(request.body);
    await assertCampaignBelongsToOrganization(context.organizationId, payload.campaignId);

    const hash = inputHash(payload);
    const idempotencyKey = request.headers["idempotency-key"]?.toString() ?? hash;
    const existingRun = await prisma.jobRun.findUnique({
      where: {
        organizationId_operation_idempotencyKey: {
          organizationId: context.organizationId,
          operation: "lead_csv_import",
          idempotencyKey
        }
      }
    });
    if (existingRun?.status === "completed" && existingRun.outputJson) {
      return existingRun.outputJson;
    }

    const run = existingRun ?? await prisma.jobRun.create({
      data: {
        organizationId: context.organizationId,
        requestedBy: context.userId,
        operation: "lead_csv_import",
        idempotencyKey,
        inputHash: hash,
        status: "running",
        inputJson: payload as any,
        startedAt: new Date()
      }
    });

    const rows = parseCsv(payload.csv);
    const imported = [];
    for (const row of rows) {
      const parsed = leadPayload.parse({
        campaignId: payload.campaignId,
        businessName: row.businessName || row.nome || row.name,
        personName: row.personName || row.profissional,
        niche: row.niche || row.nicho,
        city: row.city || row.cidade,
        state: row.state || row.estado || "PR",
        whatsapp: row.whatsapp,
        phone: row.phone || row.telefone,
        email: row.email,
        websiteUrl: row.websiteUrl || row.site,
        instagramUrl: row.instagramUrl || row.instagram,
        googleMapsUrl: row.googleMapsUrl || row.googleMaps,
        professionalRegistry: row.professionalRegistry || row.registro,
        documentStatus: row.documentStatus || row.statusDocumento,
        source: "csv"
      });
      const created = await prisma.lead.create({ data: leadDataFromPayload(parsed, context.organizationId) });
      const lead = serializeLead(created);
      imported.push({ ...lead, score: await createOrUpdateObjectiveScore(lead) });
    }

    const output = { imported: imported.length, leads: imported };
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "completed", outputJson: output as any, finishedAt: new Date() }
    });
    reply.code(201);
    return output;
  });

  app.get("/api/leads/:id", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = serializeLead(await findLead(organizationId, id));
    const [score, digitalPresence, websiteSnapshots, socialSnapshots, embeddings, aiReviews, interactions, messages] =
      await Promise.all([
        latestScoreForLead(organizationId, id),
        prisma.leadDigitalPresence.findFirst({ where: { organizationId, leadId: id } }),
        prisma.leadWebsiteSnapshot.findMany({ where: { organizationId, leadId: id }, orderBy: { createdAt: "desc" } }),
        prisma.leadSocialSnapshot.findMany({ where: { organizationId, leadId: id }, orderBy: { createdAt: "desc" } }),
        prisma.leadEmbedding.findMany({ where: { organizationId, leadId: id }, orderBy: { createdAt: "desc" } }),
        prisma.leadAiReview.findMany({ where: { organizationId, leadId: id }, orderBy: { createdAt: "desc" } }),
        prisma.commercialInteraction.findMany({ where: { organizationId, leadId: id }, orderBy: { updatedAt: "desc" } }),
        prisma.generatedMessage.findMany({ where: { organizationId, leadId: id }, orderBy: { createdAt: "desc" } })
      ]);

    return {
      ...lead,
      score,
      digitalPresence: digitalPresence ? serializeDigitalPresence(digitalPresence) : undefined,
      websiteSnapshots: websiteSnapshots.map(serializeWebsiteSnapshot),
      socialSnapshots: socialSnapshots.map(serializeSocialSnapshot),
      embeddings: embeddings.map(serializeEmbedding),
      aiReviews: aiReviews.map(serializeAiReview),
      interactions: interactions.map(serializeInteraction),
      messages: messages.map(serializeMessage)
    };
  });

  app.put("/api/leads/:id", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await findLead(organizationId, id);
    const payload = leadPayload.partial().parse(request.body);
    await assertCampaignBelongsToOrganization(organizationId, payload.campaignId);
    const updated = await prisma.lead.update({
      where: { id },
      data: leadDataFromPayload({ ...payload, country: payload.country ?? "BR", source: payload.source ?? "manual" } as any, organizationId)
    });
    const lead = serializeLead(updated);
    return { ...lead, score: await createOrUpdateObjectiveScore(lead) };
  });

  app.delete("/api/leads/:id", async (request, reply) => {
    const { organizationId } = requireRole(request, "manager");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await findLead(organizationId, id);
    await prisma.lead.delete({ where: { id } });
    reply.code(204);
  });

  app.get("/api/campaigns/:id/leads", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await assertCampaignBelongsToOrganization(organizationId, id);
    const leads = await prisma.lead.findMany({
      where: { organizationId, campaignId: id },
      orderBy: { createdAt: "desc" }
    });
    return Promise.all(leads.map(leadWithComputedFields));
  });

  app.post("/api/leads/:id/score", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = serializeLead(await findLead(organizationId, id));
    return createOrUpdateObjectiveScore(lead);
  });

  app.get("/api/leads/:id/score", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = serializeLead(await findLead(organizationId, id));
    return (await latestScoreForLead(organizationId, id)) ?? createOrUpdateObjectiveScore(lead);
  });
}
