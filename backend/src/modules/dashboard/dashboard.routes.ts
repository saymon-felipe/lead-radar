import type { FastifyInstance } from "fastify";
import { store } from "../../shared/store/memory-store.js";
import { latestScoreForLead } from "../scoring/scoring.service.js";
import { commercialReport } from "../reports/reports.service.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard", async () => {
    const campaigns = Array.from(store.campaigns.values());
    const leads = Array.from(store.leads.values());
    const scores = leads.map((lead) => latestScoreForLead(lead.id)).filter(Boolean);
    const interactions = Array.from(store.interactions.values());

    const contacted = interactions.filter((interaction) => interaction.status !== "not_contacted").length;
    const replied = interactions.filter((interaction) =>
      ["replied", "interested", "meeting_scheduled", "proposal_sent", "won"].includes(interaction.status)
    ).length;
    const won = interactions.filter((interaction) => interaction.status === "won").length;

    const report = commercialReport();

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter((campaign) => campaign.status === "running").length,
      totalLeads: leads.length,
      hotLeads: scores.filter((score) => score?.temperature === "hot").length,
      warmLeads: scores.filter((score) => score?.temperature === "warm").length,
      contactedLeads: contacted,
      repliedLeads: replied,
      wonDeals: won,
      potentialRevenue: scores.filter((score) => score?.temperature === "hot").length * 597,
      responseRate: contacted > 0 ? Math.round((replied / contacted) * 100) : 0,
      conversionRate: contacted > 0 ? Math.round((won / contacted) * 100) : 0,
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
