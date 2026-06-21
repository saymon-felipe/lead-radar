import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerAppRoutes } from "./routes/index.js";
import { HttpError } from "./shared/errors/http-error.js";
import { store } from "./shared/store/memory-store.js";

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? true
});

await store.initialize();
await app.register(registerAppRoutes);

app.addHook("onSend", async (_request, _reply, payload) => {
  await store.waitForIdle();
  return payload;
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: "ValidationError",
      message: "Payload da requisição inválido",
      details: error.flatten()
    });
    return;
  }

  if (error instanceof HttpError) {
    reply.status(error.statusCode).send({
      error: "HttpError",
      message: error.message,
      details: error.details
    });
    return;
  }

  app.log.error(error);
  reply.status(500).send({
    error: "InternalServerError",
    message: "Erro interno inesperado no servidor"
  });
});

const port = Number(process.env.PORT ?? 3333);
await app.listen({ port, host: "0.0.0.0" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await store.waitForIdle();
    await app.close();
    process.exit(0);
  });
}
