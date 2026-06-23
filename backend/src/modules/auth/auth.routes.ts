import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateRequest, requireAuthUser } from "../../shared/auth/guard.js";
import { acceptInvitation, invitationDetails } from "../organizations/organizations.service.js";
import { getUserById, loginUser, registerUser } from "./auth.service.js";

const registerPayload = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  organizationName: z.string().min(2).optional()
});

const loginPayload = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const inviteAcceptPayload = z.object({
  name: z.string().min(2).optional(),
  password: z.string().min(6)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    const { name, email, password } = registerPayload.parse(request.body);
    const session = await registerUser({ name, email, password });
    reply.code(201);
    return session;
  });

  app.post("/login", async (request) => {
    const payload = loginPayload.parse(request.body);
    return loginUser(payload);
  });

  app.get("/me", { preHandler: authenticateRequest }, async (request) => {
    const session = requireAuthUser(request);
    return getUserById(Number(session.sub));
  });

  app.get("/invitations/:token", async (request) => {
    const { token } = z.object({ token: z.string().min(16) }).parse(request.params);
    return invitationDetails(token);
  });

  app.post("/invitations/:token/accept", async (request) => {
    const { token } = z.object({ token: z.string().min(16) }).parse(request.params);
    const payload = inviteAcceptPayload.parse(request.body);
    return acceptInvitation(token, payload);
  });
}
