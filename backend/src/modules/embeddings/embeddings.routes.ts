import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
import { rebuildCampaignEmbeddings, rebuildLeadEmbeddings, similarLeads } from "./embeddings.service.js";

export async function embeddingRoutes(app: FastifyInstance) {
  app.post("/api/leads/:id/embeddings", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = store.leads.get(id);
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    const embeddings = await rebuildLeadEmbeddings(lead);
    return { created: embeddings.length, embeddings };
  });

  app.post("/api/campaigns/:id/embeddings/rebuild", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.has(id)) throw new HttpError(404, "Campanha não encontrada");
    const embeddings = await rebuildCampaignEmbeddings(id);
    return { created: embeddings.length, embeddings };
  });

  app.get("/api/leads/:id/similar", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }).parse(request.query);
    const lead = store.leads.get(id);
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    return similarLeads(lead, query.limit);
  });
}
