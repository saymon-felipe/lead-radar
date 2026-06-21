import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
import type { Campaign, CampaignStatus } from "../../shared/types.js";

const campaignPayload = z.object({
  name: z.string().min(1),
  niche: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().default("BR"),
  status: z.enum(["draft", "running", "paused", "completed", "failed"]).default("draft"),
  targetQuantity: z.number().int().positive().optional()
});

function campaignMetrics(campaignId: number) {
  const leads = Array.from(store.leads.values()).filter((lead) => lead.campaignId === campaignId);
  const scores = leads
    .map((lead) => Array.from(store.scores.values()).find((score) => score.leadId === lead.id))
    .filter(Boolean);

  return {
    leadsFound: leads.length,
    hotLeads: scores.filter((score) => score?.temperature === "hot").length,
    warmLeads: scores.filter((score) => score?.temperature === "warm").length
  };
}

export async function campaignRoutes(app: FastifyInstance) {
  app.get("/api/campaigns", async () => {
    return Array.from(store.campaigns.values()).map((campaign) => ({
      ...campaign,
      metrics: campaignMetrics(campaign.id)
    }));
  });

  app.post("/api/campaigns", async (request, reply) => {
    const payload = campaignPayload.parse(request.body);
    const now = new Date().toISOString();
    const campaign: Campaign = {
      id: store.nextId("campaign"),
      ...payload,
      createdAt: now,
      updatedAt: now
    };
    store.campaigns.set(campaign.id, campaign);
    reply.code(201);
    return campaign;
  });

  app.get("/api/campaigns/:id", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const campaign = store.campaigns.get(id);
    if (!campaign) throw new HttpError(404, "Campanha não encontrada");
    return { ...campaign, metrics: campaignMetrics(campaign.id) };
  });

  app.put("/api/campaigns/:id", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const current = store.campaigns.get(id);
    if (!current) throw new HttpError(404, "Campanha não encontrada");
    const payload = campaignPayload.partial().parse(request.body);
    const updated: Campaign = {
      ...current,
      ...payload,
      updatedAt: new Date().toISOString()
    };
    store.campaigns.set(id, updated);
    return updated;
  });

  app.delete("/api/campaigns/:id", async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.delete(id)) throw new HttpError(404, "Campanha não encontrada");
    reply.code(204);
  });

  for (const [path, status] of [
    ["/api/campaigns/:id/start", "running"],
    ["/api/campaigns/:id/pause", "paused"],
    ["/api/campaigns/:id/complete", "completed"]
  ] as Array<[string, CampaignStatus]>) {
    app.post(path, async (request) => {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
      const current = store.campaigns.get(id);
      if (!current) throw new HttpError(404, "Campanha não encontrada");
      const updated: Campaign = {
        ...current,
        status,
        startedAt: status === "running" ? new Date().toISOString() : current.startedAt,
        finishedAt: status === "completed" ? new Date().toISOString() : current.finishedAt,
        updatedAt: new Date().toISOString()
      };
      store.campaigns.set(id, updated);
      return updated;
    });
  }
}
