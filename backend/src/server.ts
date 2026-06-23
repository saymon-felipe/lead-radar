import { exec } from "child_process";
import { promisify } from "util";
import { createRequire } from "module";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerAppRoutes } from "./routes/index.js";
import { HttpError } from "./shared/errors/http-error.js";

const execAsync = promisify(exec);

const app = Fastify({
  logger: true
});

// Localiza o script CLI do Prisma de forma dinâmica
const require = createRequire(import.meta.url);
const prismaCliPath = require.resolve("prisma/package.json");
const prismaCliScript = prismaCliPath.replace("package.json", "build/index.js");

// Executa as migrações do banco de dados na inicialização em todos os ambientes
try {
  app.log.info("Executando migrações pendentes do banco de dados...");
  const { stdout, stderr } = await execAsync(`"${process.execPath}" "${prismaCliScript}" migrate deploy`);
  if (stdout) app.log.info(stdout.trim());
  if (stderr) app.log.warn(stderr.trim());
  app.log.info("Migrações de banco de dados verificadas/aplicadas com sucesso!");
} catch (error: any) {
  app.log.error("Erro crítico: Falha ao aplicar as migrações do banco de dados.");
  if (error.stdout) app.log.error(error.stdout.trim());
  if (error.stderr) app.log.error(error.stderr.trim());
  process.exit(1);
}

await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? true
});

await app.register(registerAppRoutes);

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
    await app.close();
    process.exit(0);
  });
}
