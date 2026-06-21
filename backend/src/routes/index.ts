import type { FastifyInstance } from "fastify";
import { aiRoutes } from "../modules/ai/ai.routes.js";
import { campaignRoutes } from "../modules/campaigns/campaigns.routes.js";
import { dashboardRoutes } from "../modules/dashboard/dashboard.routes.js";
import { discoveryRoutes } from "../modules/discovery/discovery.routes.js";
import { embeddingRoutes } from "../modules/embeddings/embeddings.routes.js";
import { exportRoutes } from "../modules/exports/exports.routes.js";
import { interactionRoutes } from "../modules/interactions/interactions.routes.js";
import { leadRoutes } from "../modules/leads/leads.routes.js";
import { reportRoutes } from "../modules/reports/reports.routes.js";
import { socialAnalysisRoutes } from "../modules/socialAnalysis/social-analysis.routes.js";
import { websiteAnalysisRoutes } from "../modules/websiteAnalysis/website-analysis.routes.js";

export async function registerAppRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok",
    service: "lead-radar-backend"
  }));

  await app.register(dashboardRoutes);
  await app.register(campaignRoutes);
  await app.register(leadRoutes);
  await app.register(aiRoutes);
  await app.register(websiteAnalysisRoutes);
  await app.register(socialAnalysisRoutes);
  await app.register(embeddingRoutes);
  await app.register(discoveryRoutes);
  await app.register(interactionRoutes);
  await app.register(exportRoutes);
  await app.register(reportRoutes);
}
