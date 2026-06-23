import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuthContext, requireRole } from "../../shared/auth/guard.js";
import {
  createOrganization,
  inviteOrganizationMember,
  listOrganizationInvitations,
  listOrganizationMembers,
  listUserOrganizations,
  switchOrganization
} from "./organizations.service.js";

const createOrganizationPayload = z.object({
  name: z.string().min(2)
});

const invitePayload = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "operator", "viewer"]).default("operator")
});

export async function organizationRoutes(app: FastifyInstance) {
  app.get("/api/organizations", async (request) => {
    const context = requireAuthContext(request);
    return listUserOrganizations(context.userId);
  });

  app.post("/api/organizations/:id/switch", async (request) => {
    const context = requireAuthContext(request);
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    return switchOrganization(context.userId, id);
  });

  app.post("/api/organizations", async (request, reply) => {
    const context = requireAuthContext(request);
    const payload = createOrganizationPayload.parse(request.body);
    const session = await createOrganization(context, payload);
    reply.code(201);
    return session;
  });

  app.get("/api/organizations/current/members", async (request) => {
    const context = requireAuthContext(request);
    return listOrganizationMembers(context);
  });

  app.get("/api/organizations/current/invitations", async (request) => {
    const context = requireRole(request, "manager");
    return listOrganizationInvitations(context);
  });

  app.post("/api/organizations/current/invitations", async (request, reply) => {
    const context = requireRole(request, "manager");
    const payload = invitePayload.parse(request.body);
    const invitation = await inviteOrganizationMember(context, payload);
    reply.code(201);
    return invitation;
  });
}
