import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
import type { CommercialInteraction } from "../../shared/types.js";
import { registerCommercialMemory } from "../embeddings/embeddings.service.js";

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

export async function interactionRoutes(app: FastifyInstance) {
  app.get("/api/leads/:id/interactions", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.leads.has(id)) throw new HttpError(404, "Lead não encontrado");
    return Array.from(store.interactions.values()).filter((interaction) => interaction.leadId === id);
  });

  app.post("/api/leads/:id/interactions", async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!store.leads.has(id)) throw new HttpError(404, "Lead não encontrado");
    const payload = interactionPayload.parse(request.body);
    const now = new Date().toISOString();
    const interaction: CommercialInteraction = {
      id: store.nextId("interaction"),
      leadId: id,
      ...payload,
      createdAt: now,
      updatedAt: now
    };
    store.interactions.set(interaction.id, interaction);
    const lead = store.leads.get(id);
    if (lead && (interaction.status === "won" || interaction.status === "lost")) {
      await registerCommercialMemory(lead, interaction.status);
    }
    reply.code(201);
    return interaction;
  });

  app.put("/api/interactions/:id", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const current = store.interactions.get(id);
    if (!current) throw new HttpError(404, "Interação não encontrada");
    const payload = interactionPayload.partial().parse(request.body);
    const updated: CommercialInteraction = {
      ...current,
      ...payload,
      updatedAt: new Date().toISOString()
    };
    store.interactions.set(id, updated);
    const lead = store.leads.get(updated.leadId);
    if (lead && (updated.status === "won" || updated.status === "lost")) {
      await registerCommercialMemory(lead, updated.status);
    }
    return updated;
  });
}
