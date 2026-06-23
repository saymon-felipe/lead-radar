import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext, requireRole } from "../../shared/auth/guard.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  commercialReport,
  latestScoreWeightVersions,
  scoreCalibrationSuggestion,
  validationReport
} from "./reports.service.js";

async function assertCampaign(organizationId: number, campaignId: number) {
  const campaign = await prisma.searchCampaign.findFirst({ where: { id: campaignId, organizationId } });
  if (!campaign) throw new HttpError(404, "Campanha não encontrada");
}

export async function reportRoutes(app: FastifyInstance) {
  app.get("/api/reports/commercial", async (request) => {
    const { organizationId } = requireAuthContext(request);
    return commercialReport(organizationId);
  });

  app.get("/api/campaigns/:id/report", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await assertCampaign(organizationId, id);
    return commercialReport(organizationId, id);
  });

  app.get("/api/campaigns/:id/validation", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await assertCampaign(organizationId, id);
    return validationReport(organizationId, id);
  });

  app.post("/api/reports/score-calibration", async (request) => {
    const { organizationId } = requireRole(request, "manager");
    return scoreCalibrationSuggestion(organizationId);
  });

  app.get("/api/reports/score-calibration", async (request) => {
    const { organizationId } = requireAuthContext(request);
    return latestScoreWeightVersions(organizationId);
  });
}
