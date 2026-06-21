import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
import { analyzeWebsite } from "./website-analysis.service.js";

export async function websiteAnalysisRoutes(app: FastifyInstance) {
  app.post("/api/leads/:id/analyze-website", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = store.leads.get(id);
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    if (!lead.websiteUrl) throw new HttpError(400, "O lead não possui URL de site");
    return analyzeWebsite(lead);
  });

  app.get("/api/leads/:id/website-snapshots", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.leads.has(id)) throw new HttpError(404, "Lead não encontrado");
    return Array.from(store.websiteSnapshots.values()).filter((snapshot) => snapshot.leadId === id);
  });

  app.post("/api/campaigns/:id/analyze-websites", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.has(id)) throw new HttpError(404, "Campanha não encontrada");
    const leads = Array.from(store.leads.values()).filter((lead) => lead.campaignId === id && lead.websiteUrl);
    const results = [];
    for (const lead of leads) {
      results.push(await analyzeWebsite(lead));
    }
    return { analyzed: results.length, snapshots: results };
  });
}
