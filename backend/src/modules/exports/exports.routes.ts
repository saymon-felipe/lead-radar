import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext } from "../../shared/auth/guard.js";
import { HttpError } from "../../shared/errors/http-error.js";

function csvEscape(value: unknown): string {
  const raw = value === undefined || value === null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export async function exportRoutes(app: FastifyInstance) {
  app.get("/api/campaigns/:id/export/csv", async (request, reply) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const campaign = await prisma.searchCampaign.findFirst({ where: { id, organizationId } });
    if (!campaign) throw new HttpError(404, "Campanha não encontrada");

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

    const leads = await prisma.lead.findMany({
      where: { organizationId, campaignId: id },
      include: { scores: { orderBy: { updatedAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" }
    });

    const rows = leads.map((lead) => {
      const score = lead.scores[0];
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
