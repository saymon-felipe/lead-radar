import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
import { analyzeSocial } from "./social-analysis.service.js";

export async function socialAnalysisRoutes(app: FastifyInstance) {
  app.post("/api/leads/:id/analyze-social", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = store.leads.get(id);
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    if (!lead.instagramUrl && !lead.facebookUrl && !lead.linkedinUrl && !lead.googleMapsUrl) {
      throw new HttpError(400, "O lead não possui URL de perfil social");
    }
    return analyzeSocial(lead);
  });

  app.get("/api/leads/:id/social-snapshots", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.leads.has(id)) throw new HttpError(404, "Lead não encontrado");
    return Array.from(store.socialSnapshots.values()).filter((snapshot) => snapshot.leadId === id);
  });

  app.post("/api/campaigns/:id/analyze-socials", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.has(id)) throw new HttpError(404, "Campanha não encontrada");
    const leads = Array.from(store.leads.values()).filter(
      (lead) => lead.campaignId === id && (lead.instagramUrl || lead.facebookUrl || lead.linkedinUrl || lead.googleMapsUrl)
    );
    const results = [];
    for (const lead of leads) {
      results.push(await analyzeSocial(lead));
    }
    return { analyzed: results.length, snapshots: results };
  });
}
