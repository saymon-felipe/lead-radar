import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext } from "../../shared/auth/guard.js";
import { serializeCampaign, serializeDiscoveryCandidate } from "../../shared/http/serializers.js";
import { discoverCampaign, reviewSearchCandidates } from "./discovery.service.js";
import {
  createDiscoveryRun,
  stopDiscoveryRun,
  getDiscoveryRunStatus
} from "./discovery-orchestrator.service.js";
import { getCampaignDiscoveryLevel, setCampaignDiscoveryLevel, type CampaignDiscoveryLevel } from "../campaigns/discovery-level.store.js";

function defaultDiscoveryTarget(level: CampaignDiscoveryLevel): number {
  switch (level) {
    case "nano": return 5;
    case "medium": return 30;
    case "deep": return 60;
    case "quick":
    default: return 10;
  }
}

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
      level: z.enum(["nano", "quick", "medium", "deep"]).optional(),
      limit: z.coerce.number().int().min(1).max(60).optional()
    }).parse(request.query);

    const { organizationId } = requireAuthContext(request);
    const campaignRecord = await prisma.searchCampaign.findFirst({ where: { id, organizationId } });
    if (!campaignRecord) throw new HttpError(404, "Campanha não encontrada");

    if (campaignRecord.status !== "running") {
      throw new HttpError(409, "Para iniciar o scraping, coloque a campanha em andamento primeiro.");
    }

    const currentLevel = await getCampaignDiscoveryLevel(id);
    const level = query.level ?? currentLevel;
    const savedLevel = query.level && query.level !== currentLevel
      ? await setCampaignDiscoveryLevel(id, level)
      : currentLevel;
    const campaign = serializeCampaign({ ...campaignRecord, discoveryLevel: savedLevel }) as any;

    const mode = process.env.DISCOVERY_EXECUTION_MODE || "legacy";
    const targetFinalLeads = level === "nano" ? 5 : query.limit ?? defaultDiscoveryTarget(level);
    if (mode === "worker") {
      return createDiscoveryRun(id, level, targetFinalLeads);
    }

    return discoverCampaign(campaign, { level, targetFinalLeads });
  });

  app.post("/api/campaigns/:id/discover/stop", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    
    const { organizationId } = requireAuthContext(request);
    const campaignExists = await prisma.searchCampaign.findFirst({ where: { id, organizationId } });
    if (!campaignExists) throw new HttpError(404, "Campanha não encontrada");

    const mode = process.env.DISCOVERY_EXECUTION_MODE || "legacy";
    if (mode === "worker") {
      return stopDiscoveryRun(id);
    }

    return stopDiscoveryRun(id);
  });

  app.post("/api/discovery/review-candidates", async (request) => {
    const payload = reviewPayload.parse(request.body);
    
    const { organizationId } = requireAuthContext(request);
    const campaignRecord = await prisma.searchCampaign.findFirst({ 
      where: { id: payload.campaignId, organizationId } 
    });
    if (!campaignRecord) throw new HttpError(404, "Campanha não encontrada");
    
    const campaign = serializeCampaign(campaignRecord) as any;
    return reviewSearchCandidates(campaign, payload.candidates);
  });

  app.post("/api/ai/review-search-candidates", async (request) => {
    const payload = reviewPayload.parse(request.body);
    
    const { organizationId } = requireAuthContext(request);
    const campaignRecord = await prisma.searchCampaign.findFirst({ 
      where: { id: payload.campaignId, organizationId } 
    });
    if (!campaignRecord) throw new HttpError(404, "Campanha não encontrada");
    
    const campaign = serializeCampaign(campaignRecord) as any;
    return reviewSearchCandidates(campaign, payload.candidates);
  });

  app.get("/api/campaigns/:id/discovery-candidates", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    
    const { organizationId } = requireAuthContext(request);
    const campaignExists = await prisma.searchCampaign.findFirst({ where: { id, organizationId } });
    if (!campaignExists) throw new HttpError(404, "Campanha não encontrada");

    const candidates = await prisma.discoveryCandidate.findMany({
      where: { campaignId: id, organizationId }
    });

    return candidates.map(serializeDiscoveryCandidate);
  });

  app.get("/api/campaigns/:id/discovery-status", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    
    const { organizationId } = requireAuthContext(request);
    const campaignExists = await prisma.searchCampaign.findFirst({ where: { id, organizationId } });
    if (!campaignExists) throw new HttpError(404, "Campanha não encontrada");

    return getDiscoveryRunStatus(id);
  });
}

