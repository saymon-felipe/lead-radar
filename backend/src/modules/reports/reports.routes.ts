import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
import {
  commercialReport,
  latestScoreWeightVersions,
  scoreCalibrationSuggestion,
  validationReport
} from "./reports.service.js";

export async function reportRoutes(app: FastifyInstance) {
  app.get("/api/reports/commercial", async () => commercialReport());

  app.get("/api/campaigns/:id/report", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.has(id)) throw new HttpError(404, "Campanha não encontrada");
    return commercialReport(id);
  });

  app.get("/api/campaigns/:id/validation", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.has(id)) throw new HttpError(404, "Campanha não encontrada");
    return validationReport(id);
  });

  app.post("/api/reports/score-calibration", async () => scoreCalibrationSuggestion());

  app.get("/api/reports/score-calibration", async () => latestScoreWeightVersions());
}
