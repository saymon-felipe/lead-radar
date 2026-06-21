import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { store } from "../../shared/store/memory-store.js";
import { generateMessage, reviewLead } from "./ai.service.js";

export async function aiRoutes(app: FastifyInstance) {
  app.post("/api/ai/review-lead", async (request) => {
    const { leadId } = z.object({ leadId: z.number().int() }).parse(request.body);
    const lead = store.leads.get(leadId);
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    return reviewLead(lead);
  });

  app.post("/api/ai/generate-message", async (request) => {
    const { leadId } = z.object({ leadId: z.number().int() }).parse(request.body);
    const lead = store.leads.get(leadId);
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    return generateMessage(lead);
  });

  app.post("/api/leads/:id/generate-message", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const lead = store.leads.get(id);
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    return generateMessage(lead);
  });

  app.get("/api/leads/:id/messages", async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    return Array.from(store.messages.values()).filter((message) => message.leadId === id);
  });
}
