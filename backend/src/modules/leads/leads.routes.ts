import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
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
  maxScore: z.coerce.number().int().optional()
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

function leadFromPayload(payload: z.infer<typeof leadPayload>, id: number, now: string, createdAt = now): Lead {
  return {
    id,
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
    rawDataJson: payload.rawDataJson,
    websiteSignals: payload.websiteSignals,
    createdAt,
    updatedAt: now
  };
}

export async function leadRoutes(app: FastifyInstance) {
  app.get("/api/leads", async (request) => {
    const query = leadQuery.parse(request.query);
    return Array.from(store.leads.values())
      .map((lead) => ({
        ...lead,
        score: latestScoreForLead(lead.id),
        latestInteraction: Array.from(store.interactions.values())
          .filter((interaction) => interaction.leadId === lead.id)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      }))
      .filter((lead) => {
        const score = lead.score;
        const latestStatus = lead.latestInteraction?.status;
        if (query.campaignId && lead.campaignId !== query.campaignId) return false;
        if (query.niche && !lead.niche.toLowerCase().includes(query.niche.toLowerCase())) return false;
        if (query.city && !lead.city.toLowerCase().includes(query.city.toLowerCase())) return false;
        if (query.temperature && score?.temperature !== query.temperature) return false;
        if (query.recommendedOffer && score?.recommendedOffer !== query.recommendedOffer) return false;
        if (query.hasWebsite && Boolean(lead.websiteUrl) !== (query.hasWebsite === "true")) return false;
        if (query.hasWhatsapp && Boolean(lead.whatsapp) !== (query.hasWhatsapp === "true")) return false;
        if (query.hasInstagram && Boolean(lead.instagramUrl) !== (query.hasInstagram === "true")) return false;
        if (query.status && latestStatus !== query.status) return false;
        if (query.minScore !== undefined && (score?.finalScore ?? 0) < query.minScore) return false;
        if (query.maxScore !== undefined && (score?.finalScore ?? 0) > query.maxScore) return false;
        return true;
      });
  });

  app.post("/api/leads", async (request, reply) => {
    const payload = leadPayload.parse(request.body);
    if (payload.campaignId && !store.campaigns.has(payload.campaignId)) {
      throw new HttpError(400, "A campanha informada não existe");
    }

    const now = new Date().toISOString();
    const lead = leadFromPayload(payload, store.nextId("lead"), now);
    store.leads.set(lead.id, lead);
    const score = createOrUpdateObjectiveScore(lead);
    reply.code(201);
    return { ...lead, score };
  });

  app.post("/api/leads/import", async (request, reply) => {
    const payload = csvImportPayload.parse(request.body);
    if (payload.campaignId && !store.campaigns.has(payload.campaignId)) {
      throw new HttpError(400, "A campanha informada não existe");
    }

    const rows = parseCsv(payload.csv);
    const imported = rows.map((row) => {
      const now = new Date().toISOString();
      const lead = leadFromPayload(
        leadPayload.parse({
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
        }),
        store.nextId("lead"),
        now
      );
      store.leads.set(lead.id, lead);
      return { ...lead, score: createOrUpdateObjectiveScore(lead) };
    });

    reply.code(201);
    return { imported: imported.length, leads: imported };
  });

  app.get("/api/leads/:id", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = store.leads.get(id);
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    return {
      ...lead,
      score: latestScoreForLead(id),
      digitalPresence: Array.from(store.digitalPresence.values()).find((presence) => presence.leadId === id),
      websiteSnapshots: Array.from(store.websiteSnapshots.values()).filter((snapshot) => snapshot.leadId === id),
      socialSnapshots: Array.from(store.socialSnapshots.values()).filter((snapshot) => snapshot.leadId === id),
      embeddings: Array.from(store.embeddings.values()).filter((embedding) => embedding.leadId === id),
      aiReviews: Array.from(store.aiReviews.values()).filter((review) => review.leadId === id),
      interactions: Array.from(store.interactions.values()).filter((interaction) => interaction.leadId === id),
      messages: Array.from(store.messages.values()).filter((message) => message.leadId === id)
    };
  });

  app.put("/api/leads/:id", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const current = store.leads.get(id);
    if (!current) throw new HttpError(404, "Lead não encontrado");
    const payload = leadPayload.partial().parse(request.body);
    const now = new Date().toISOString();
    const updated: Lead = {
      ...current,
      ...payload,
      updatedAt: now
    };
    store.leads.set(id, updated);
    return { ...updated, score: createOrUpdateObjectiveScore(updated) };
  });

  app.delete("/api/leads/:id", async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.leads.delete(id)) throw new HttpError(404, "Lead não encontrado");
    reply.code(204);
  });

  app.get("/api/campaigns/:id/leads", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.has(id)) throw new HttpError(404, "Campanha não encontrada");
    return Array.from(store.leads.values())
      .filter((lead) => lead.campaignId === id)
      .map((lead) => ({ ...lead, score: latestScoreForLead(lead.id) }));
  });

  app.post("/api/leads/:id/score", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = store.leads.get(id);
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    return createOrUpdateObjectiveScore(lead);
  });

  app.get("/api/leads/:id/score", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = store.leads.get(id);
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    return latestScoreForLead(id) ?? createOrUpdateObjectiveScore(lead);
  });
}
