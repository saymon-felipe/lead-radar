import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext, requireRole } from "../../shared/auth/guard.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { serializeCampaign } from "../../shared/http/serializers.js";
import type { CampaignStatus } from "../../shared/types.js";
import { attachCampaignDiscoveryLevels, setCampaignDiscoveryLevel } from "./discovery-level.store.js";

const discoveryLevelSchema = z.enum(["nano", "quick", "medium", "deep"]);

const campaignPayload = z.object({
  name: z.string().min(1),
  niche: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().default("BR"),
  status: z.enum(["draft", "running", "paused", "completed", "failed"]).default("draft"),
  targetQuantity: z.number().int().positive().optional(),
  discoveryLevel: discoveryLevelSchema.default("quick")
});

const campaignUpdatePayload = z.object({
  name: z.string().min(1).optional(),
  niche: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  country: z.string().optional(),
  status: z.enum(["draft", "running", "paused", "completed", "failed"]).optional(),
  targetQuantity: z.number().int().positive().optional(),
  discoveryLevel: discoveryLevelSchema.optional()
});

async function campaignMetrics(organizationId: number, campaignId: number) {
  const [leadsFound, hotLeads, warmLeads] = await Promise.all([
    prisma.lead.count({ where: { organizationId, campaignId } }),
    prisma.leadScore.count({
      where: { organizationId, temperature: "hot", lead: { campaignId, organizationId } }
    }),
    prisma.leadScore.count({
      where: { organizationId, temperature: "warm", lead: { campaignId, organizationId } }
    })
  ]);

  return { leadsFound, hotLeads, warmLeads };
}

async function findCampaign(organizationId: number, id: number) {
  const campaign = await prisma.searchCampaign.findFirst({ where: { id, organizationId } });
  if (!campaign) throw new HttpError(404, "Campanha não encontrada");
  return campaign;
}

export async function campaignRoutes(app: FastifyInstance) {
  app.get("/api/campaigns", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const campaigns = await prisma.searchCampaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" }
    });

    const campaignsWithLevels = await attachCampaignDiscoveryLevels(campaigns);

    return Promise.all(
      campaignsWithLevels.map(async (campaign) => ({
        ...serializeCampaign(campaign),
        metrics: await campaignMetrics(organizationId, campaign.id)
      }))
    );
  });

  app.post("/api/campaigns", async (request, reply) => {
    const context = requireRole(request, "operator");
    const payload = campaignPayload.parse(request.body);
    const { discoveryLevel, ...campaignData } = payload;
    const campaign = await prisma.searchCampaign.create({
      data: {
        organizationId: context.organizationId,
        createdBy: context.userId,
        ...campaignData
      }
    });
    const savedLevel = await setCampaignDiscoveryLevel(campaign.id, discoveryLevel);
    reply.code(201);
    return serializeCampaign({ ...campaign, discoveryLevel: savedLevel });
  });

  app.get("/api/campaigns/:id", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const campaign = await findCampaign(organizationId, id);
    const [campaignWithLevel] = await attachCampaignDiscoveryLevels([campaign]);
    return { ...serializeCampaign(campaignWithLevel), metrics: await campaignMetrics(organizationId, campaign.id) };
  });

  app.put("/api/campaigns/:id", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await findCampaign(organizationId, id);
    const payload = campaignUpdatePayload.parse(request.body);
    const { discoveryLevel, ...campaignData } = payload;

    const hasCampaignData = Object.keys(campaignData).length > 0;
    const updated = hasCampaignData
      ? await prisma.searchCampaign.update({
          where: { id },
          data: campaignData
        })
      : await findCampaign(organizationId, id);

    const savedLevel = discoveryLevel !== undefined
      ? await setCampaignDiscoveryLevel(id, discoveryLevel)
      : (await attachCampaignDiscoveryLevels([updated]))[0].discoveryLevel;

    return serializeCampaign({ ...updated, discoveryLevel: savedLevel });
  });

  app.delete("/api/campaigns/:id", async (request, reply) => {
    const { organizationId } = requireRole(request, "manager");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await findCampaign(organizationId, id);
    await prisma.searchCampaign.delete({ where: { id } });
    reply.code(204);
  });

  for (const [path, status] of [
    ["/api/campaigns/:id/start", "running"],
    ["/api/campaigns/:id/pause", "paused"],
    ["/api/campaigns/:id/complete", "completed"]
  ] as Array<[string, CampaignStatus]>) {
    app.post(path, async (request) => {
      const { organizationId } = requireRole(request, "operator");
      const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
      const current = await findCampaign(organizationId, id);
      const updated = await prisma.searchCampaign.update({
        where: { id: current.id },
        data: {
          status,
          startedAt: status === "running" ? new Date() : current.startedAt,
          finishedAt: status === "completed" ? new Date() : current.finishedAt
        }
      });
      const [updatedWithLevel] = await attachCampaignDiscoveryLevels([updated]);
      return serializeCampaign(updatedWithLevel);
    });
  }
}
