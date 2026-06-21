import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateRequest, requireAuthUser } from "../../shared/auth/guard.js";
import { getUserById, loginUser, registerUser } from "./auth.service.js";

const registerPayload = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6)
});

const loginPayload = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    const payload = registerPayload.parse(request.body);
    const session = registerUser(payload);
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
}
