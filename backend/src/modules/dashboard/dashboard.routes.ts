import type { FastifyInstance } from "fastify";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext } from "../../shared/auth/guard.js";
import { commercialReport } from "../reports/reports.service.js";

const RESPONSE_STATUSES = ["replied", "interested", "meeting_scheduled", "proposal_sent", "won"];
const CONTACTED_STATUSES = ["contacted", ...RESPONSE_STATUSES, "lost", "no_response", "invalid_contact"];

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const [
      totalCampaigns,
      activeCampaigns,
      totalLeads,
      hotLeads,
      warmLeads,
      contactedLeads,
      repliedLeads,
      wonDeals,
      report
    ] = await Promise.all([
      prisma.searchCampaign.count({ where: { organizationId } }),
      prisma.searchCampaign.count({ where: { organizationId, status: "running" } }),
      prisma.lead.count({ where: { organizationId } }),
      prisma.leadScore.count({ where: { organizationId, temperature: "hot" } }),
      prisma.leadScore.count({ where: { organizationId, temperature: "warm" } }),
      prisma.commercialInteraction.count({ where: { organizationId, status: { in: CONTACTED_STATUSES as any } } }),
      prisma.commercialInteraction.count({ where: { organizationId, status: { in: RESPONSE_STATUSES as any } } }),
      prisma.commercialInteraction.count({ where: { organizationId, status: "won" } }),
      commercialReport(organizationId)
    ]);

    return {
      totalCampaigns,
      activeCampaigns,
      totalLeads,
      hotLeads,
      warmLeads,
      contactedLeads,
      repliedLeads,
      wonDeals,
      potentialRevenue: hotLeads * 597,
      responseRate: contactedLeads > 0 ? Math.round((repliedLeads / contactedLeads) * 100) : 0,
      conversionRate: contactedLeads > 0 ? Math.round((wonDeals / contactedLeads) * 100) : 0,
      bestNiche: report.bestNiche,
      bestCity: report.bestCity,
      bestScoreBand: report.bestScoreBand,
      bestOffer: report.bestOffer,
      aiCostPerQualifiedLead: report.summary.aiCostPerQualifiedLead,
      byTemperature: report.byTemperature,
      byOffer: report.byOffer,
      nextCampaignSuggestions: report.nextCampaignSuggestions,
      lossReasons: report.lossReasons
    };
  });
}
