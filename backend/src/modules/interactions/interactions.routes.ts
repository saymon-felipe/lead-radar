import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuthContext, requireRole } from "../../shared/auth/guard.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { serializeInteraction } from "../../shared/http/serializers.js";

const interactionPayload = z.object({
  status: z.enum([
    "not_contacted",
    "contacted",
    "replied",
    "interested",
    "meeting_scheduled",
    "proposal_sent",
    "won",
    "lost",
    "no_response",
    "invalid_contact"
  ]),
  contactChannel: z.string().optional(),
  contactedAt: z.string().datetime().optional(),
  responseAt: z.string().datetime().optional(),
  notes: z.string().optional(),
  nextActionAt: z.string().datetime().optional()
});

async function assertLead(organizationId: number, leadId: number) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new HttpError(404, "Lead não encontrado");
}

export async function interactionRoutes(app: FastifyInstance) {
  app.get("/api/leads/:id/interactions", async (request) => {
    const { organizationId } = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await assertLead(organizationId, id);
    const interactions = await prisma.commercialInteraction.findMany({
      where: { organizationId, leadId: id },
      orderBy: { updatedAt: "desc" }
    });
    return interactions.map(serializeInteraction);
  });

  app.post("/api/leads/:id/interactions", async (request, reply) => {
    const context = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    await assertLead(context.organizationId, id);
    const payload = interactionPayload.parse(request.body);
    const interaction = await prisma.commercialInteraction.create({
      data: {
        organizationId: context.organizationId,
        leadId: id,
        createdBy: context.userId,
        status: payload.status,
        contactChannel: payload.contactChannel,
        contactedAt: payload.contactedAt ? new Date(payload.contactedAt) : undefined,
        responseAt: payload.responseAt ? new Date(payload.responseAt) : undefined,
        notes: payload.notes,
        nextActionAt: payload.nextActionAt ? new Date(payload.nextActionAt) : undefined
      }
    });
    reply.code(201);
    return serializeInteraction(interaction);
  });

  app.put("/api/interactions/:id", async (request) => {
    const { organizationId } = requireRole(request, "operator");
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const current = await prisma.commercialInteraction.findFirst({ where: { id, organizationId } });
    if (!current) throw new HttpError(404, "Interação não encontrada");
    const payload = interactionPayload.partial().parse(request.body);
    const updated = await prisma.commercialInteraction.update({
      where: { id },
      data: {
        status: payload.status,
        contactChannel: payload.contactChannel,
        contactedAt: payload.contactedAt ? new Date(payload.contactedAt) : undefined,
        responseAt: payload.responseAt ? new Date(payload.responseAt) : undefined,
        notes: payload.notes,
        nextActionAt: payload.nextActionAt ? new Date(payload.nextActionAt) : undefined
      }
    });
    return serializeInteraction(updated);
  });
}
