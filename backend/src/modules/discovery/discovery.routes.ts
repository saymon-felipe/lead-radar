import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
import { discoverCampaign, getCampaignDiscoveryStatus, reviewSearchCandidates, stopCampaignDiscovery } from "./discovery.service.js";

const reviewPayload = z.object({
  campaignId: z.number().int().positive(),
  candidates: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
    source: z.string().default("manual")
  }))
});

export async function discoveryRoutes(app: FastifyInstance) {
  app.post("/api/campaigns/:id/discover", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const query = z.object({
      level: z.enum(["nano", "quick", "medium", "deep"]).default("quick"),
      limit: z.coerce.number().int().min(1).max(60).optional()
    }).parse(request.query);
    const campaign = store.campaigns.get(id);
    if (!campaign) throw new HttpError(404, "Campanha não encontrada");
    return discoverCampaign(campaign, { level: query.level, targetFinalLeads: query.limit });
  });

  app.post("/api/campaigns/:id/discover/stop", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.has(id)) throw new HttpError(404, "Campanha não encontrada");
    return stopCampaignDiscovery(id);
  });

  app.post("/api/discovery/review-candidates", async (request) => {
    const payload = reviewPayload.parse(request.body);
    const campaign = store.campaigns.get(payload.campaignId);
    if (!campaign) throw new HttpError(404, "Campanha não encontrada");
    return reviewSearchCandidates(campaign, payload.candidates);
  });

  app.post("/api/ai/review-search-candidates", async (request) => {
    const payload = reviewPayload.parse(request.body);
    const campaign = store.campaigns.get(payload.campaignId);
    if (!campaign) throw new HttpError(404, "Campanha não encontrada");
    return reviewSearchCandidates(campaign, payload.candidates);
  });

  app.get("/api/campaigns/:id/discovery-candidates", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.has(id)) throw new HttpError(404, "Campanha não encontrada");
    return Array.from(store.discoveryCandidates.values()).filter((candidate) => candidate.campaignId === id);
  });

  app.get("/api/campaigns/:id/discovery-status", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.has(id)) throw new HttpError(404, "Campanha não encontrada");
    return getCampaignDiscoveryStatus(id);
  });
}
