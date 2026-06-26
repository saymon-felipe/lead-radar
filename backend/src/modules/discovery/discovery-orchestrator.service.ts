import { randomBytes } from "node:crypto";
import { prisma } from "../../shared/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { getCampaignDiscoveryStatus, stopCampaignDiscovery } from "./discovery.service.js";
import { setCampaignDiscoveryLevel } from "../campaigns/discovery-level.store.js";

function defaultTargetForLevel(level: string): number {
  switch (level) {
    case "nano": return 5;
    case "medium": return 30;
    case "deep": return 60;
    case "quick":
    default: return 10;
  }
}

function normalizeTargetForLevel(level: string, limit?: number): number {
  switch (level) {
    case "nano":
      return 5;
    case "quick":
      return Math.min(limit ?? 10, 10);
    case "medium":
      return Math.min(limit ?? 30, 30);
    case "deep":
      return Math.min(limit ?? 60, 60);
    default:
      return Math.min(limit ?? defaultTargetForLevel(level), defaultTargetForLevel(level));
  }
}

export async function createDiscoveryRun(campaignId: number, level: string, limit?: number) {
  const campaign = await prisma.searchCampaign.findUnique({
    where: { id: campaignId }
  });

  if (!campaign) {
    throw new HttpError(404, "Campanha não encontrada");
  }

  if (campaign.status !== "running") {
    throw new HttpError(409, "Para iniciar o scraping, coloque a campanha em andamento primeiro.");
  }

  // Cancel any existing active runs for this campaign
  await prisma.discoveryRun.updateMany({
    where: {
      campaignId,
      status: { in: ["queued", "claimed", "running"] }
    },
    data: {
      status: "cancelled",
      finishedAt: new Date(),
      updatedAt: new Date()
    }
  });

  const targetFinalLeads = normalizeTargetForLevel(level, limit);

  await setCampaignDiscoveryLevel(campaignId, level);

  // Create the new run
  const commandToken = `cmd_${randomBytes(16).toString("hex")}`;
  const run = await prisma.discoveryRun.create({
    data: {
      campaignId,
      organizationId: campaign.organizationId,
      status: "queued",
      level,
      options: { limit: targetFinalLeads, commandToken }
    }
  });

  return {
    runId: run.id,
    commandToken,
    campaignId: run.campaignId,
    level: run.level,
    apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT ?? "3333"}`,
    options: { limit: targetFinalLeads }
  };
}

export async function stopDiscoveryRun(campaignId: number) {
  // 1. Try stopping legacy execution if running
  await stopCampaignDiscovery(campaignId);

  // 2. Stop database-backed runs
  const activeRuns = await prisma.discoveryRun.findMany({
    where: {
      campaignId,
      status: { in: ["queued", "claimed", "running"] }
    }
  });

  if (activeRuns.length > 0) {
    await prisma.discoveryRun.updateMany({
      where: {
        campaignId,
        status: { in: ["queued", "claimed", "running"] }
      },
      data: {
        status: "cancelled",
        finishedAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  return { stopped: true };
}

export async function getDiscoveryRunStatus(campaignId: number) {
  const mode = process.env.DISCOVERY_EXECUTION_MODE || "legacy";

  if (mode === "legacy") {
    return getCampaignDiscoveryStatus(campaignId);
  }

  // Find the latest discovery run for this campaign
  const run = await prisma.discoveryRun.findFirst({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    include: {
      events: {
        orderBy: { sequence: "asc" }
      }
    }
  });

  if (!run) {
    // Fall back to legacy if no runs exist
    return getCampaignDiscoveryStatus(campaignId);
  }

  const running = ["queued", "claimed", "running", "stopping"].includes(run.status);

  const events = run.events.map(e => ({
    sequence: e.sequence,
    kind: e.kind,
    title: e.title,
    leadName: e.leadName,
    url: e.url,
    payload: e.payload,
    createdAt: e.createdAt.toISOString()
  }));

  const payloadNumber = (payload: unknown, key: string): number | null => {
    const value = Number((payload as any)?.[key]);
    return Number.isFinite(value) ? value : null;
  };

  const latestTotalMatchingTitle = (patterns: RegExp[]): number | null => {
    for (const event of [...run.events].reverse()) {
      if (!patterns.some((pattern) => pattern.test(event.title))) continue;
      const total = payloadNumber(event.payload, "total");
      if (total !== null) return total;
      const match = event.title.match(/(\d+)/);
      if (match) return Number(match[1]);
    }
    return null;
  };

  const insertedLeadIds = new Set<number>();
  const updatedLeadIds = new Set<number>();
  let maxInsertedCount = 0;
  let maxUpdatedCount = 0;
  let maxAcceptedCount = 0;

  for (const event of run.events) {
    const payload = event.payload as any;
    const leadId = Number(payload?.leadId);
    const insertedCount = Number(payload?.insertedCount);
    const updatedCount = Number(payload?.updatedCount);
    const acceptedCount = Number(payload?.acceptedCount ?? payload?.inserted);

    if (Number.isFinite(insertedCount)) maxInsertedCount = Math.max(maxInsertedCount, insertedCount);
    if (Number.isFinite(updatedCount)) maxUpdatedCount = Math.max(maxUpdatedCount, updatedCount);
    if (Number.isFinite(acceptedCount)) maxAcceptedCount = Math.max(maxAcceptedCount, acceptedCount);

    if (!Number.isFinite(leadId)) continue;
    if (event.title === "Lead inserido pelo worker" || payload?.created === true || payload?.duplicate === false) {
      insertedLeadIds.add(leadId);
      updatedLeadIds.delete(leadId);
    } else if (event.title === "Lead duplicado atualizado pelo worker" || event.title === "Lead atualizado pelo worker" || payload?.duplicate === true) {
      updatedLeadIds.add(leadId);
    }
  }

  // "inserted" shown in the monitor must mean new leads created in this run.
  // Duplicate updates are tracked separately and must not close Nano/Quick targets.
  const inserted = Math.max(insertedLeadIds.size, maxInsertedCount);
  const updated = Math.max(updatedLeadIds.size, maxUpdatedCount);
  const accepted = Math.max(inserted + updated, maxAcceptedCount);
  const collected = latestTotalMatchingTitle([/resultados únicos coletados/i, /candidatos únicos extraídos/i])
    ?? await prisma.discoveryCandidate.count({ where: { campaignId } });
  const extractedProfessionals = latestTotalMatchingTitle([/profissionais extraídos/i, /profissionais extraidos/i]) ?? collected;
  const reviewed = run.events.filter((event) => /validando profissional/i.test(event.title)).length;

  const latestEvent = run.events[run.events.length - 1];

  return {
    campaignId: run.campaignId,
    running,
    startedAt: run.startedAt?.toISOString() || run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    searchLevel: run.level,
    targetFinalLeads: normalizeTargetForLevel(run.level, (run.options as any)?.limit),
    currentStep: latestEvent?.title ?? (run.status === "queued" ? "Aguardando worker iniciar..." : "Iniciando..."),
    currentProfessional: latestEvent?.leadName ?? null,
    stats: {
      collected,
      extractedProfessionals,
      reviewed,
      inserted,
      updated,
      accepted
    },
    events
  };
}
