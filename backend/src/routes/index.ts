import type { FastifyInstance } from "fastify";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { aiRoutes } from "../modules/ai/ai.routes.js";
import { campaignRoutes } from "../modules/campaigns/campaigns.routes.js";
import { dashboardRoutes } from "../modules/dashboard/dashboard.routes.js";
import { discoveryRoutes } from "../modules/discovery/discovery.routes.js";
import { embeddingRoutes } from "../modules/embeddings/embeddings.routes.js";
import { exportRoutes } from "../modules/exports/exports.routes.js";
import { interactionRoutes } from "../modules/interactions/interactions.routes.js";
import { leadRoutes } from "../modules/leads/leads.routes.js";
import { organizationRoutes } from "../modules/organizations/organizations.routes.js";
import { reportRoutes } from "../modules/reports/reports.routes.js";
import { socialAnalysisRoutes } from "../modules/socialAnalysis/social-analysis.routes.js";
import { websiteAnalysisRoutes } from "../modules/websiteAnalysis/website-analysis.routes.js";
import { authenticateRequest, getAuthContext } from "../shared/auth/guard.js";
import { HttpError } from "../shared/errors/http-error.js";

export async function registerAppRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok",
    service: "lead-radar-backend"
  }));

  await app.register(authRoutes, { prefix: "/api/auth" });

  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/api/") && !request.url.startsWith("/api/auth/")) {
      await authenticateRequest(request);
      
      const context = getAuthContext(request);
      if (context && !context.organizationId) {
        const urlPath = request.url.split("?")[0];
        const isOrgAllowed =
          urlPath === "/api/organizations" ||
          /^\/api\/organizations\/\d+\/switch$/.test(urlPath);

        if (!isOrgAllowed) {
          throw new HttpError(403, "Selecione ou crie uma empresa para continuar");
        }
      }
    }
  });

  await app.register(dashboardRoutes);
  await app.register(campaignRoutes);
  await app.register(organizationRoutes);
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
