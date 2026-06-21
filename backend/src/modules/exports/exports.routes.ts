import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
import { latestScoreForLead } from "../scoring/scoring.service.js";

function csvEscape(value: unknown): string {
  const raw = value === undefined || value === null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export async function exportRoutes(app: FastifyInstance) {
  app.get("/api/campaigns/:id/export/csv", async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.campaigns.has(id)) throw new HttpError(404, "Campanha não encontrada");

    const headers = [
      "businessName",
      "personName",
      "niche",
      "city",
      "state",
      "whatsapp",
      "email",
      "websiteUrl",
      "instagramUrl",
      "score",
      "temperature",
      "recommendedOffer"
    ];

    const rows = Array.from(store.leads.values())
      .filter((lead) => lead.campaignId === id)
      .map((lead) => {
        const score = latestScoreForLead(lead.id);
        return [
          lead.businessName,
          lead.personName,
          lead.niche,
          lead.city,
          lead.state,
          lead.whatsapp,
          lead.email,
          lead.websiteUrl,
          lead.instagramUrl,
          score?.finalScore,
          score?.temperature,
          score?.recommendedOffer
        ];
      });

    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="campaign-${id}-leads.csv"`);
    return csv;
  });
}
