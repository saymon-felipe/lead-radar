import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext, requireRole } from "../../shared/auth/guard.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { serializeLead, serializeMessage } from "../../shared/http/serializers.js";
import { generateMessage, reviewLead } from "./ai.service.js";

async function findLead(organizationId: number, leadId: number) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new HttpError(404, "Lead não encontrado");
  return serializeLead(lead);
}

export async function aiRoutes(app: FastifyInstance) {
  app.post("/api/ai/review-lead", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { leadId } = z.object({ leadId: z.number().int() }).parse(request.body);
    return reviewLead(await findLead(organizationId, leadId));
  });

  app.post("/api/ai/generate-message", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { leadId } = z.object({ leadId: z.number().int() }).parse(request.body);
    return generateMessage(await findLead(organizationId, leadId));
  });

  app.post("/api/leads/:id/generate-message", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    return generateMessage(await findLead(organizationId, id));
  });

  app.get("/api/leads/:id/messages", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await findLead(organizationId, id);
    const messages = await prisma.generatedMessage.findMany({
      where: { organizationId, leadId: id },
      orderBy: { createdAt: "desc" }
    });
    return messages.map(serializeMessage);
  });
}
