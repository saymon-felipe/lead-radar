import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error.js";
import { getAuthContext } from "../../shared/auth/guard.js";
import { bearerTokenFromAuthorizationHeader } from "../../shared/auth/jwt.js";
import {
  registerWorkerDevice,
  createWorkerSession,
  refreshWorkerSession,
  authenticateWorkerToken,
  recordHeartbeat,
  claimDiscoveryRun,
  postRunEvent,
  postRunCandidate,
  postWebsiteSnapshot,
  postSocialSnapshot,
  postRunLead,
  completeDiscoveryRun,
  failDiscoveryRun
} from "./worker.service.js";

function workerApiBaseUrl(): string {
  return process.env.API_BASE_URL || `http://localhost:${process.env.PORT ?? "3333"}`;
}

async function requireWorkerDevice(request: any) {
  const token = bearerTokenFromAuthorizationHeader(request.headers.authorization);
  if (!token) {
    throw new HttpError(401, "Token de acesso do worker ausente");
  }
  const device = await authenticateWorkerToken(token);
  if (!device) {
    throw new HttpError(401, "Token de acesso do worker inválido ou expirado");
  }
  return device;
}

export async function workerRoutes(app: FastifyInstance) {
  // 1. Register worker (Called by authenticated user in front-end/browser)
  app.post("/api/workers/register", async (request) => {
    const context = getAuthContext(request);
    if (!context) {
      throw new HttpError(401, "Autenticação de usuário necessária para registrar worker");
    }

    const payload = z.object({
      deviceId: z.string(),
      environment: z.string().default("development"),
      appVersion: z.string().default("0.1.0"),
      hostname: z.string().optional()
    }).parse(request.body);

    const device = await registerWorkerDevice({
      deviceId: payload.deviceId,
      userId: context.userId,
      organizationId: context.organizationId,
      environment: payload.environment,
      appVersion: payload.appVersion,
      hostname: payload.hostname
    });

    const session = await createWorkerSession(device.id);

    return {
      success: true,
      deviceId: device.deviceId,
      environment: device.environment,
      workerToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      apiBaseUrl: workerApiBaseUrl()
    };
  });

  // 2. Get current worker info (Called by worker)
  app.get("/api/workers/me", async (request) => {
    const device = await requireWorkerDevice(request);
    return {
      deviceId: device.deviceId,
      userId: device.userId,
      organizationId: device.organizationId,
      environment: device.environment,
      appVersion: device.appVersion,
      hostname: device.hostname,
      status: device.status,
      user: {
        id: device.user.id,
        name: device.user.name,
        email: device.user.email
      },
      organization: {
        id: device.organization.id,
        name: device.organization.name
      }
    };
  });

  // 3. Refresh worker token (Called by worker)
  app.post("/api/workers/refresh", async (request) => {
    const payload = z.object({ refreshToken: z.string().min(1) }).parse(request.body);
    const session = await refreshWorkerSession(payload.refreshToken);
    return {
      success: true,
      workerToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      apiBaseUrl: workerApiBaseUrl()
    };
  });

  // 4. Heartbeat (Called by worker)
  app.post("/api/workers/heartbeat", async (request) => {
    const device = await requireWorkerDevice(request);
    const payload = z.object({
      status: z.string(),
      cpuUsage: z.number().optional(),
      ramUsage: z.number().optional()
    }).parse(request.body);

    await recordHeartbeat({
      workerDeviceId: device.id,
      status: payload.status,
      cpuUsage: payload.cpuUsage,
      ramUsage: payload.ramUsage
    });

    return { success: true };
  });

  // 4. Claim Discovery Run (Called by worker when starting a run)
  app.post("/api/workers/runs/:runId/claim", async (request) => {
    const device = await requireWorkerDevice(request);
    const { runId } = z.object({ runId: z.coerce.number().int() }).parse(request.params);

    const run = await claimDiscoveryRun(runId, device.id);
    return {
      success: true,
      runId: run.id,
      status: run.status,
      level: run.level,
      campaign: {
        id: run.campaign.id,
        name: run.campaign.name,
        niche: run.campaign.niche,
        city: run.campaign.city,
        state: run.campaign.state,
        country: run.campaign.country
      }
    };
  });


  // 5. Ingest run events (Called by worker)
  app.post("/api/workers/runs/:runId/events", async (request) => {
    await requireWorkerDevice(request);
    const { runId } = z.object({ runId: z.coerce.number().int() }).parse(request.params);
    const payload = z.object({
      sequence: z.number().int(),
      kind: z.string(),
      title: z.string(),
      leadName: z.string().optional(),
      url: z.string().optional(),
      payload: z.any()
    }).parse(request.body);

    const event = await postRunEvent(runId, payload);
    return { success: true, eventId: event.id };
  });

  // 6. Ingest candidates (Called by worker)
  app.post("/api/workers/runs/:runId/candidates", async (request) => {
    await requireWorkerDevice(request);
    const { runId } = z.object({ runId: z.coerce.number().int() }).parse(request.params);
    const payload = z.object({
      externalId: z.string(),
      title: z.string(),
      url: z.string(),
      snippet: z.string().default(""),
      source: z.string().default("duckduckgo"),
      evidence: z.any().optional(),
      localSignals: z.object({
        hasPhone: z.boolean().default(false),
        hasWhatsapp: z.boolean().default(false),
        hasEmail: z.boolean().default(false),
        looksLikeDirectory: z.boolean().default(false),
        looksLikeMarketplace: z.boolean().default(false),
        looksLikeJobPost: z.boolean().default(false)
      })
    }).parse(request.body);

    const candidate = await postRunCandidate(runId, payload);
    return { success: true, candidateId: candidate.id };
  });

  // 7. Ingest website snapshot (Called by worker)
  app.post("/api/workers/runs/:runId/snapshots/website", async (request) => {
    await requireWorkerDevice(request);
    const { runId } = z.object({ runId: z.coerce.number().int() }).parse(request.params);
    const payload = z.object({
      leadExternalId: z.string(),
      url: z.string(),
      httpStatus: z.number().int(),
      title: z.string().default(""),
      metaDescription: z.string().default(""),
      h1: z.string().default(""),
      headings: z.array(z.string()).default([]),
      textSample: z.string().default(""),
      contacts: z.object({
        emails: z.array(z.string()).optional(),
        phones: z.array(z.string()).optional(),
        whatsappNumbers: z.array(z.string()).optional()
      }).default({}),
      visualMetrics: z.any().optional()
    }).parse(request.body);

    const snapshot = await postWebsiteSnapshot(runId, payload);
    return { success: true, snapshotId: snapshot.id };
  });

  // 8. Ingest social snapshot (Called by worker)
  app.post("/api/workers/runs/:runId/snapshots/social", async (request) => {
    await requireWorkerDevice(request);
    const { runId } = z.object({ runId: z.coerce.number().int() }).parse(request.params);
    const payload = z.object({
      leadExternalId: z.string(),
      url: z.string(),
      platform: z.string(),
      profileUrl: z.string(),
      bioText: z.string().default(""),
      externalLink: z.string().optional(),
      hasWhatsapp: z.boolean().default(false),
      hasWebsiteLink: z.boolean().default(false),
      estimatedPostCount: z.number().int().optional(),
      lastActivitySignal: z.string().optional(),
      contentSignals: z.array(z.string()).default([]),
      rawMetrics: z.any().optional()
    }).parse(request.body);

    const snapshot = await postSocialSnapshot(runId, payload);
    return { success: true, snapshotId: snapshot.id };
  });

  // 9. Ingest validated lead (Called by worker after local enrichment)
  app.post("/api/workers/runs/:runId/leads", async (request) => {
    await requireWorkerDevice(request);
    const { runId } = z.object({ runId: z.coerce.number().int() }).parse(request.params);
    const payload = z.object({
      externalId: z.string(),
      name: z.string().min(2),
      personName: z.string().optional(),
      niche: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      websiteUrl: z.string().optional(),
      instagramUrl: z.string().optional(),
      sourceUrl: z.string().optional(),
      source: z.string().optional(),
      professionalRegistry: z.string().optional(),
      address: z.string().optional(),
      rawData: z.any().optional()
    }).parse(request.body);

    const result = await postRunLead(runId, payload);
    return {
      success: true,
      leadId: result.lead.id,
      created: result.created,
      duplicate: result.duplicate,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      acceptedCount: result.acceptedCount,
      target: result.target,
      score: {
        finalScore: result.score.finalScore,
        temperature: result.score.temperature,
        recommendedOffer: result.score.recommendedOffer
      }
    };
  });

  // 10. Complete Discovery Run (Called by worker)
  app.post("/api/workers/runs/:runId/complete", async (request) => {
    await requireWorkerDevice(request);
    const { runId } = z.object({ runId: z.coerce.number().int() }).parse(request.params);
    await completeDiscoveryRun(runId);
    return { success: true };
  });

  // 11. Fail Discovery Run (Called by worker)
  app.post("/api/workers/runs/:runId/fail", async (request) => {
    await requireWorkerDevice(request);
    const { runId } = z.object({ runId: z.coerce.number().int() }).parse(request.params);
    const payload = z.object({
      error: z.string()
    }).parse(request.body);

    await failDiscoveryRun(runId, payload.error);
    return { success: true };
  });
}
