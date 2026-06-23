import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext, requireRole } from "../../shared/auth/guard.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { serializeLead, serializeSocialSnapshot } from "../../shared/http/serializers.js";
import { analyzeSocial } from "./social-analysis.service.js";

async function findLead(organizationId: number, id: number) {
  const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
  if (!lead) throw new HttpError(404, "Lead não encontrado");
  return serializeLead(lead);
}

async function persistSocialSnapshot(organizationId: number, snapshot: any) {
  const created = await prisma.leadSocialSnapshot.create({
    data: {
      organizationId,
      leadId: snapshot.leadId,
      platform: snapshot.platform,
      profileUrl: snapshot.profileUrl,
      bioText: snapshot.bioText,
      externalLink: snapshot.externalLink,
      hasWhatsapp: snapshot.hasWhatsapp,
      hasWebsiteLink: snapshot.hasWebsiteLink,
      estimatedPostCount: snapshot.estimatedPostCount,
      lastActivitySignal: snapshot.lastActivitySignal,
      contentSignalsJson: snapshot.contentSignalsJson as any,
      rawMetricsJson: snapshot.rawMetricsJson as any,
      snapshotHash: snapshot.snapshotHash,
      aiReviewJson: snapshot.aiReview as any,
      createdAt: snapshot.createdAt ? new Date(snapshot.createdAt) : undefined
    }
  });
  return serializeSocialSnapshot(created);
}

export async function socialAnalysisRoutes(app: FastifyInstance) {
  app.post("/api/leads/:id/analyze-social", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = await findLead(organizationId, id);
    if (!lead.instagramUrl && !lead.facebookUrl && !lead.linkedinUrl && !lead.googleMapsUrl) {
      throw new HttpError(400, "O lead não possui URL de perfil social");
    }
    return persistSocialSnapshot(organizationId, await analyzeSocial(lead));
  });

  app.get("/api/leads/:id/social-snapshots", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await findLead(organizationId, id);
    const snapshots = await prisma.leadSocialSnapshot.findMany({
      where: { organizationId, leadId: id },
      orderBy: { createdAt: "desc" }
    });
    return snapshots.map(serializeSocialSnapshot);
  });

  app.post("/api/campaigns/:id/analyze-socials", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const campaign = await prisma.searchCampaign.findFirst({ where: { id, organizationId } });
    if (!campaign) throw new HttpError(404, "Campanha não encontrada");
    const leads = await prisma.lead.findMany({
      where: {
        organizationId,
        campaignId: id,
        OR: [
          { instagramUrl: { not: null } },
          { facebookUrl: { not: null } },
          { linkedinUrl: { not: null } },
          { googleMapsUrl: { not: null } }
        ]
      }
    });
    const snapshots = [];
    for (const leadRecord of leads) {
      snapshots.push(await persistSocialSnapshot(organizationId, await analyzeSocial(serializeLead(leadRecord))));
    }
    return { analyzed: snapshots.length, snapshots };
  });
}
