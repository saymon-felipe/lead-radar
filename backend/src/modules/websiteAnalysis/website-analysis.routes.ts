import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext, requireRole } from "../../shared/auth/guard.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { serializeLead, serializeWebsiteSnapshot } from "../../shared/http/serializers.js";
import { analyzeWebsite } from "./website-analysis.service.js";

async function findLead(organizationId: number, id: number) {
  const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
  if (!lead) throw new HttpError(404, "Lead não encontrado");
  return serializeLead(lead);
}

async function persistWebsiteSnapshot(organizationId: number, snapshot: any) {
  const created = await prisma.leadWebsiteSnapshot.create({
    data: {
      organizationId,
      leadId: snapshot.leadId,
      url: snapshot.url,
      httpStatus: snapshot.httpStatus,
      title: snapshot.title,
      metaDescription: snapshot.metaDescription,
      h1: snapshot.h1,
      headingsJson: snapshot.headingsJson as any,
      textSummary: snapshot.textSummary,
      textSample: snapshot.textSample,
      platform: snapshot.platform,
      hasSsl: snapshot.hasSsl,
      loadTimeMs: snapshot.loadTimeMs,
      hasWhatsapp: snapshot.hasWhatsapp,
      hasContactForm: snapshot.hasContactForm,
      hasCta: snapshot.hasCta,
      hasLocation: snapshot.hasLocation,
      hasServices: snapshot.hasServices,
      hasTestimonials: snapshot.hasTestimonials,
      detectedIssuesJson: snapshot.detectedIssuesJson as any,
      rawMetricsJson: snapshot.rawMetricsJson as any,
      snapshotHash: snapshot.snapshotHash,
      aiReviewJson: snapshot.aiReview as any,
      createdAt: snapshot.createdAt ? new Date(snapshot.createdAt) : undefined
    }
  });
  return serializeWebsiteSnapshot(created);
}

export async function websiteAnalysisRoutes(app: FastifyInstance) {
  app.post("/api/leads/:id/analyze-website", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = await findLead(organizationId, id);
    if (!lead.websiteUrl) throw new HttpError(400, "O lead não possui URL de site");
    const snapshot = await analyzeWebsite(lead);
    return persistWebsiteSnapshot(organizationId, snapshot);
  });

  app.get("/api/leads/:id/website-snapshots", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await findLead(organizationId, id);
    const snapshots = await prisma.leadWebsiteSnapshot.findMany({
      where: { organizationId, leadId: id },
      orderBy: { createdAt: "desc" }
    });
    return snapshots.map(serializeWebsiteSnapshot);
  });

  app.post("/api/campaigns/:id/analyze-websites", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const campaign = await prisma.searchCampaign.findFirst({ where: { id, organizationId } });
    if (!campaign) throw new HttpError(404, "Campanha não encontrada");
    const leads = await prisma.lead.findMany({
      where: { organizationId, campaignId: id, websiteUrl: { not: null } }
    });
    const snapshots = [];
    for (const leadRecord of leads) {
      snapshots.push(await persistWebsiteSnapshot(organizationId, await analyzeWebsite(serializeLead(leadRecord))));
    }
    return { analyzed: snapshots.length, snapshots };
  });
}
