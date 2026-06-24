import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../../shared/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { createOrUpdateObjectiveScore } from "../scoring/scoring.service.js";

// Hash utility
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return digits;
  return null;
}

function normalizeUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const WORKER_WEBSITE_BLOCKED_HOST_PARTS = [
  "doctoralia", "mundopsicologos", "guiamais", "guiafacil", "listamais", "empresafone",
  "todosnegocios", "yelp", "telelistas", "acheioprofissional", "brfirmas", "cnpj",
  "instagram", "facebook", "linkedin", "youtube", "tiktok", "x.com", "twitter"
];

function isBlockedWorkerWebsite(url?: string | null): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return true;
  const parsed = new URL(normalized);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  return WORKER_WEBSITE_BLOCKED_HOST_PARTS.some((part) => host.includes(part));
}

function sanitizeWorkerWebsite(url?: string | null, professionalName = "", evidence = ""): string | null {
  const normalized = normalizeUrl(url);
  if (!normalized || isBlockedWorkerWebsite(normalized)) return null;
  if (professionalName && ownWebsiteScore(normalized, professionalName, evidence) < 70) return null;
  try {
    const parsed = new URL(normalized);
    return `${parsed.protocol}//${parsed.hostname}/`;
  } catch {
    return normalized;
  }
}

function sanitizeWorkerEmail(raw?: string | null, professionalName = "", websiteUrl?: string | null, sourceUrl?: string | null): string | null {
  if (!raw) return null;
  const email = raw.trim().replace(/^mailto:/i, "").replace(/[),.;:]+$/g, "").toLowerCase();
  const match = email.match(/^([a-z0-9._%+-]{1,64})@([a-z0-9.-]{1,190}\.[a-z]{2,12})$/i);
  if (!match) return null;
  const local = match[1].toLowerCase();
  const domain = match[2].toLowerCase();
  if (WORKER_EMAIL_BLOCKED_LOCAL_PARTS.has(local)) return null;
  if (WORKER_EMAIL_PLATFORM_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) return null;
  const siteHost = websiteUrl ? new URL(websiteUrl).hostname.replace(/^www\./, "").toLowerCase() : "";
  const sourceHost = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase() : "";
  const domainLooksOwn = Boolean(siteHost && (domain === siteHost || domain.endsWith(`.${siteHost}`)));
  const tokenMatch = professionalNameTokens(professionalName).some((token) => domain.replace(/[^a-z0-9]/g, "").includes(token));
  const psiDomain = /(psi|psico|psicolog|terapia)/i.test(domain);
  const sourceIsDirectory = WORKER_WEBSITE_BLOCKED_HOST_PARTS.some((part) => sourceHost.includes(part));
  if (sourceIsDirectory && !domainLooksOwn && !tokenMatch && !psiDomain) return null;
  if (!domainLooksOwn && !tokenMatch && !psiDomain && ["contato", "atendimento", "comercial"].includes(local)) return null;
  return email;
}

const WORKER_EMAIL_BLOCKED_LOCAL_PARTS = new Set([
  "noreply", "no-reply", "donotreply", "naoresponda", "privacy", "privacidade", "lgpd", "suporte", "support", "abuse"
]);

const WORKER_EMAIL_PLATFORM_DOMAINS = [
  "listamais.com.br", "doctoralia.com.br", "mundopsicologos.com", "mundopsicologos.com.br",
  "empresafone.com.br", "guiafacil.com", "guiamais.com.br", "todosnegocios.com",
  "acheioprofissional.com.br", "brfirmas.org", "yelp.com", "instagram.com", "facebook.com",
  "meta.com", "google.com", "cloudflare.com", "sentry.io", "schema.org"
];

const WORKER_NEWS_OR_ACADEMIC_HOST_PARTS = [
  "orcid", "lattes", "cnpq", "escavador", "jusbrasil", "globo.com", "g1.globo.com",
  "ge.globo.com", "uol.com.br", "terra.com.br", "folha.uol", "estadao", "metropoles"
];

function normalizeForCompare(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function professionalNameTokens(name: string): string[] {
  return normalizeForCompare(name)
    .split(" ")
    .filter((token) => token.length >= 3 && !["dra", "dr", "psicologa", "psicologo", "psicologia", "de", "da", "do", "das", "dos", "e"].includes(token));
}

function evidenceMatchesName(evidence: string, name: string): boolean {
  const normalizedEvidence = normalizeForCompare(evidence);
  const tokens = professionalNameTokens(name);
  if (tokens.length < 2) return false;
  const matches = tokens.filter((token) => normalizedEvidence.includes(token)).length;
  return matches >= Math.min(2, tokens.length);
}

function isProfessionalInstagramUrl(raw?: string | null): boolean {
  const normalized = normalizeUrl(raw);
  if (!normalized) return false;
  const parsed = new URL(normalized);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (!host.endsWith("instagram.com")) return false;
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return false;
  return !["p", "reel", "reels", "stories", "explore", "accounts", "about", "developer"].includes(parts[0].toLowerCase());
}

const WORKER_WRONG_INSTAGRAM_TERMS = [
  "wedding", "fotografia", "photography", "makeup", "maquiagem", "moda", "loja",
  "store", "food", "viagem", "travel", "arquitetura", "advocacia", "imoveis", "imóveis"
];

function workerInstagramEvidenceScore(url: string, professionalName: string, evidence = ""): number {
  if (!isProfessionalInstagramUrl(url)) return -1000;
  const normalized = normalizeForCompare(`${url} ${evidence}`);
  const tokens = professionalNameTokens(professionalName);
  let score = 0;
  for (const token of tokens) {
    if (normalized.includes(token)) score += 20;
  }
  if (/\b(psi|psico|psicologa|psicologo|psicologia|terapia|terapeuta|crp|atendimento|consulta)\b/i.test(normalized)) score += 45;
  if (evidenceMatchesName(evidence, professionalName) && /psic[oó]log|psicologia|terapia|crp/i.test(evidence)) score += 35;
  if (WORKER_WRONG_INSTAGRAM_TERMS.some((term) => normalized.includes(term))) score -= 90;
  return score;
}

function isWorkerProfessionalInstagram(url: string, professionalName: string, evidence = ""): boolean {
  return workerInstagramEvidenceScore(url, professionalName, evidence) >= 50;
}

function ownWebsiteScore(url: string, professionalName: string, evidence = ""): number {
  const normalized = normalizeUrl(url);
  if (!normalized) return -1000;
  const parsed = new URL(normalized);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const compactHost = host.replace(/[^a-z0-9]/g, "");
  const normalizedEvidence = normalizeForCompare(`${url} ${evidence}`);
  if (WORKER_WEBSITE_BLOCKED_HOST_PARTS.some((part) => host.includes(part))) return -1000;
  if (WORKER_NEWS_OR_ACADEMIC_HOST_PARTS.some((part) => host.includes(part))) return -1000;
  if (/\/(biz|empresa|local|perfil|profissional|catalogo|guia|telefone)\b/i.test(path)) return -250;

  const tokens = professionalNameTokens(professionalName);
  const hostMatches = tokens.filter((token) => compactHost.includes(token)).length;
  const hasPsiDomain = /(psi|psico|psicolog|terapia)/i.test(compactHost);
  let score = 0;
  if (hasPsiDomain) score += 30;
  if (hostMatches >= 2) score += 55;
  else if (hostMatches === 1 && hasPsiDomain) score += 45;
  else if (hostMatches === 1) score += 25;
  if (evidenceMatchesName(evidence, professionalName)) score += 35;
  if (/psic[oó]log|psicologia|psicoterapia|terapia|terapeuta|crp/i.test(evidence)) score += 25;
  if (/whats|telefone|contato|agendar|atendimento|consulta|crp/i.test(evidence)) score += 20;
  if (/site oficial|site pr[oó]prio|consult[oó]rio|agenda|servi[cç]os/i.test(evidence)) score += 10;
  if (/lista|guia|diret[oó]rio|empresas similares|como chegar|telefone e endere[cç]o|avalia[cç][oõ]es/i.test(evidence)) score -= 60;
  return score;
}


export async function registerWorkerDevice(input: {
  deviceId: string;
  userId: number;
  organizationId: number;
  environment: string;
  appVersion: string;
  hostname?: string;
}) {
  const device = await prisma.workerDevice.upsert({
    where: { deviceId: input.deviceId },
    create: {
      deviceId: input.deviceId,
      userId: input.userId,
      organizationId: input.organizationId,
      environment: input.environment,
      appVersion: input.appVersion,
      hostname: input.hostname ?? null,
      status: "active"
    },
    update: {
      userId: input.userId,
      organizationId: input.organizationId,
      environment: input.environment,
      appVersion: input.appVersion,
      hostname: input.hostname ?? null,
      status: "active",
      updatedAt: new Date()
    }
  });

  return device;
}

export async function createWorkerSession(workerDeviceId: number) {
  // Generate token strings
  const accessToken = `wk_access_${randomBytes(24).toString("hex")}`;
  const refreshToken = `wk_refresh_${randomBytes(32).toString("hex")}`;

  const accessTokenHash = hashToken(accessToken);
  const refreshTokenHash = hashToken(refreshToken);

  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours: discovery runs may be long

  // Clean old sessions for device
  await prisma.workerSession.deleteMany({
    where: { workerDeviceId }
  });

  // Create new session
  await prisma.workerSession.create({
    data: {
      workerDeviceId,
      accessTokenHash,
      refreshTokenHash,
      expiresAt
    }
  });

  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAt.toISOString()
  };
}

export async function refreshWorkerSession(refreshToken: string) {
  const refreshTokenHash = hashToken(refreshToken);
  const session = await prisma.workerSession.findUnique({
    where: { refreshTokenHash },
    include: { device: true }
  });

  if (!session) {
    throw new HttpError(401, "Sessão ou token de refresh inválido");
  }

  // Create new session
  return createWorkerSession(session.workerDeviceId);
}

export async function authenticateWorkerToken(token: string) {
  const accessTokenHash = hashToken(token);
  const session = await prisma.workerSession.findUnique({
    where: { accessTokenHash },
    include: {
      device: {
        include: {
          user: true,
          organization: true
        }
      }
    }
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session.device;
}

export async function recordHeartbeat(input: {
  workerDeviceId: number;
  status: string;
  cpuUsage?: number;
  ramUsage?: number;
}) {
  await prisma.workerHeartbeat.create({
    data: {
      workerDeviceId: input.workerDeviceId,
      status: input.status,
      cpuUsage: input.cpuUsage ?? null,
      ramUsage: input.ramUsage ?? null
    }
  });

  // Update device's updatedAt field
  await prisma.workerDevice.update({
    where: { id: input.workerDeviceId },
    data: { updatedAt: new Date() }
  });
}

export async function getWorkerDeviceById(id: number) {
  return prisma.workerDevice.findUnique({
    where: { id },
    include: { user: true, organization: true }
  });
}

// Discovery Run orchestration endpoints
export async function claimDiscoveryRun(runId: number, workerDeviceId: number) {
  const run = await prisma.discoveryRun.findUnique({
    where: { id: runId },
    include: { campaign: true }
  });

  if (!run) {
    throw new HttpError(404, "Corrida de descoberta não encontrada");
  }

  // Idempotent: if already claimed or running by this worker device, return it
  if ((run.status === "claimed" || run.status === "running") && run.workerDeviceId === workerDeviceId) {
    return run;
  }

  if (run.status !== "queued") {
    throw new HttpError(400, "Corrida de descoberta já foi iniciada ou concluída");
  }

  const updatedRun = await prisma.discoveryRun.update({
    where: { id: runId },
    data: {
      workerDeviceId,
      status: "claimed",
      startedAt: new Date(),
      updatedAt: new Date()
    },
    include: { campaign: true }
  });

  return updatedRun;
}


async function nextRunEventSequence(runId: number): Promise<number> {
  const latest = await prisma.discoveryRunEvent.findFirst({
    where: { runId },
    orderBy: [{ sequence: "desc" }, { id: "desc" }],
    select: { sequence: true }
  });

  const next = (latest?.sequence ?? 0) + 1;
  return Number.isSafeInteger(next) && next > 0 && next < 2_000_000_000 ? next : 1;
}

export async function postRunEvent(
  runId: number,
  event: {
    sequence?: number;
    kind: string;
    title: string;
    leadName?: string;
    url?: string;
    payload?: any;
  }
) {
  // If the run is in "claimed" state, transition it to "running"
  const run = await prisma.discoveryRun.findUnique({ where: { id: runId } });
  if (run && run.status === "claimed") {
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: { status: "running" }
    });
  }

  const dbEvent = await prisma.discoveryRunEvent.create({
    data: {
      runId,
      // Never trust external timestamps here. The DB column is Int, while Date.now()
      // overflows it. Use a compact per-run sequence for worker and backend events.
      sequence: await nextRunEventSequence(runId),
      kind: event.kind,
      title: event.title,
      leadName: event.leadName ?? null,
      url: event.url ?? null,
      payload: JSON.parse(JSON.stringify(event.payload ?? {}))
    }
  });

  return dbEvent;
}

export async function postRunCandidate(
  runId: number,
  candidate: {
    externalId: string;
    title: string;
    url: string;
    snippet: string;
    source: string;
    evidence?: any;
    localSignals: {
      hasPhone: boolean;
      hasWhatsapp: boolean;
      hasEmail: boolean;
      looksLikeDirectory: boolean;
      looksLikeMarketplace: boolean;
      looksLikeJobPost: boolean;
    };
  }
) {
  const run = await prisma.discoveryRun.findUnique({
    where: { id: runId },
    include: { campaign: true }
  });

  if (!run) {
    throw new HttpError(404, "Corrida de descoberta não encontrada");
  }

  // Deduplicate candidate in this campaign
  let existingCandidate = await prisma.discoveryCandidate.findFirst({
    where: {
      campaignId: run.campaignId,
      url: candidate.url
    }
  });

  if (existingCandidate) {
    existingCandidate = await prisma.discoveryCandidate.update({
      where: { id: existingCandidate.id },
      data: {
        title: candidate.title,
        snippet: candidate.snippet,
        source: candidate.source,
        reason: candidate.snippet
      }
    });
    return existingCandidate;
  }

  // Create new candidate
  const dbCandidate = await prisma.discoveryCandidate.create({
    data: {
      organizationId: run.organizationId,
      campaignId: run.campaignId,
      title: candidate.title,
      url: candidate.url,
      snippet: candidate.snippet,
      source: candidate.source,
      priority: "medium",
      isPotentialLead: !candidate.localSignals.looksLikeDirectory && !candidate.localSignals.looksLikeMarketplace,
      reason: candidate.snippet,
      status: "pending"
    }
  });

  return dbCandidate;
}

export async function postWebsiteSnapshot(
  runId: number,
  snapshot: {
    leadExternalId: string;
    url: string;
    httpStatus: number;
    title: string;
    metaDescription: string;
    h1: string;
    headings: string[];
    textSample: string;
    contacts: {
      emails?: string[];
      phones?: string[];
      whatsappNumbers?: string[];
    };
    visualMetrics?: any;
    screenshot?: {
      storedLocally: boolean;
      uploadId?: string;
    };
  }
) {
  const run = await prisma.discoveryRun.findUnique({ where: { id: runId } });
  if (!run) throw new HttpError(404, "Corrida não encontrada");

  // Find or create lead by URL/Domain name or similar. Let's check existing lead first
  let lead = await prisma.lead.findFirst({
    where: {
      organizationId: run.organizationId,
      websiteUrl: snapshot.url
    }
  });

  if (!lead) {
    await postRunEvent(runId, {
      sequence: Date.now(),
      kind: "debug",
      title: "Snapshot de site ignorado: lead validado ainda não existe",
      url: snapshot.url,
      payload: { leadExternalId: snapshot.leadExternalId, reason: "snapshot_without_validated_lead" }
    });
    return { skipped: true, id: null } as any;
  }

  // Create digital presence
  await prisma.leadDigitalPresence.upsert({
    where: { leadId: lead.id },
    create: {
      organizationId: run.organizationId,
      leadId: lead.id,
      hasWebsite: true,
      websiteUrl: snapshot.url,
      websiteHttpStatus: snapshot.httpStatus,
      websiteHasSeoTitle: Boolean(snapshot.title),
      websiteHasMetaDescription: Boolean(snapshot.metaDescription),
      websiteDetectedIssuesJson: JSON.parse(JSON.stringify({})),
      websiteQualityScore: 50
    },
    update: {
      websiteHttpStatus: snapshot.httpStatus,
      websiteHasSeoTitle: Boolean(snapshot.title),
      websiteHasMetaDescription: Boolean(snapshot.metaDescription)
    }
  });

  // Create website snapshot record
  const dbSnapshot = await prisma.leadWebsiteSnapshot.create({
    data: {
      organizationId: run.organizationId,
      leadId: lead.id,
      url: snapshot.url,
      httpStatus: snapshot.httpStatus,
      title: snapshot.title,
      metaDescription: snapshot.metaDescription,
      h1: snapshot.h1,
      headingsJson: JSON.parse(JSON.stringify(snapshot.headings || [])),
      textSample: snapshot.textSample,
      textSummary: snapshot.textSample ? snapshot.textSample.slice(0, 500) : null,
      detectedIssuesJson: JSON.parse(JSON.stringify([])),
      rawMetricsJson: JSON.parse(JSON.stringify(snapshot.visualMetrics || {})),
      snapshotHash: createHash("sha256").update(snapshot.textSample || "").digest("hex")
    }
  });

  return dbSnapshot;
}

export async function postSocialSnapshot(
  runId: number,
  snapshot: {
    leadExternalId: string;
    url: string;
    platform: string;
    profileUrl: string;
    bioText: string;
    externalLink?: string;
    hasWhatsapp: boolean;
    hasWebsiteLink: boolean;
    estimatedPostCount?: number;
    lastActivitySignal?: string;
    contentSignals: string[];
    rawMetrics?: any;
  }
) {
  const run = await prisma.discoveryRun.findUnique({ where: { id: runId } });
  if (!run) throw new HttpError(404, "Corrida não encontrada");

  let lead = await prisma.lead.findFirst({
    where: {
      organizationId: run.organizationId,
      OR: [
        { instagramUrl: snapshot.profileUrl },
        { linkedinUrl: snapshot.profileUrl },
        { facebookUrl: snapshot.profileUrl }
      ]
    }
  });

  if (!lead) {
    await postRunEvent(runId, {
      sequence: Date.now(),
      kind: "debug",
      title: "Snapshot social ignorado: lead validado ainda não existe",
      url: snapshot.profileUrl,
      payload: { leadExternalId: snapshot.leadExternalId, platform: snapshot.platform, reason: "snapshot_without_validated_lead" }
    });
    return { skipped: true, id: null } as any;
  }

  const dbSnapshot = await prisma.leadSocialSnapshot.create({
    data: {
      organizationId: run.organizationId,
      leadId: lead.id,
      platform: snapshot.platform,
      profileUrl: snapshot.profileUrl,
      bioText: snapshot.bioText,
      externalLink: snapshot.externalLink ?? null,
      hasWhatsapp: snapshot.hasWhatsapp,
      hasWebsiteLink: snapshot.hasWebsiteLink,
      estimatedPostCount: snapshot.estimatedPostCount ?? null,
      lastActivitySignal: snapshot.lastActivitySignal ?? null,
      contentSignalsJson: JSON.parse(JSON.stringify(snapshot.contentSignals || [])),
      rawMetricsJson: JSON.parse(JSON.stringify(snapshot.rawMetrics || {})),
      snapshotHash: createHash("sha256").update(snapshot.bioText || "").digest("hex")
    }
  });

  return dbSnapshot;
}


function targetForRunLevel(level: string, options?: unknown): number {
  const configured = typeof (options as any)?.limit === "number" ? Number((options as any).limit) : undefined;
  switch (level) {
    case "nano":
      return 5;
    case "quick":
      return Math.min(configured ?? 10, 10);
    case "medium":
      return Math.min(configured ?? 30, 30);
    case "deep":
      return Math.min(configured ?? 60, 60);
    default:
      return Math.min(configured ?? 10, 10);
  }
}

async function countRunLeadOutcomes(runId: number): Promise<{ inserted: number; updated: number; accepted: number }> {
  const events = await prisma.discoveryRunEvent.findMany({
    where: {
      runId,
      kind: "result",
      title: { in: ["Lead inserido pelo worker", "Lead duplicado atualizado pelo worker", "Lead atualizado pelo worker"] }
    },
    select: { title: true, payload: true }
  });

  const insertedIds = new Set<number>();
  const updatedIds = new Set<number>();

  for (const event of events) {
    const payload = event.payload as any;
    const leadId = Number(payload?.leadId);
    if (!Number.isFinite(leadId)) continue;

    const created = payload?.created === true || payload?.duplicate === false || event.title === "Lead inserido pelo worker";
    if (created) {
      insertedIds.add(leadId);
      updatedIds.delete(leadId);
    } else if (!insertedIds.has(leadId)) {
      updatedIds.add(leadId);
    }
  }

  return {
    inserted: insertedIds.size,
    updated: updatedIds.size,
    accepted: insertedIds.size + updatedIds.size
  };
}


export async function postRunLead(
  runId: number,
  payload: {
    externalId: string;
    name: string;
    personName?: string;
    niche?: string;
    city?: string;
    state?: string;
    country?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    websiteUrl?: string;
    instagramUrl?: string;
    sourceUrl?: string;
    source?: string;
    professionalRegistry?: string;
    address?: string;
    rawData?: any;
  }
) {
  const run = await prisma.discoveryRun.findUnique({
    where: { id: runId },
    include: { campaign: true }
  });
  if (!run) throw new HttpError(404, "Corrida não encontrada");

  const target = targetForRunLevel(run.level, run.options);
  const leadCountsBefore = await countRunLeadOutcomes(runId);
  if (leadCountsBefore.inserted >= target) {
    await postRunEvent(runId, {
      kind: "debug",
      title: "Lead recusado: limite de novos leads da campanha já atingido",
      leadName: payload.personName || payload.name,
      url: payload.instagramUrl,
      payload: { target, insertedCount: leadCountsBefore.inserted, updatedCount: leadCountsBefore.updated, acceptedCount: leadCountsBefore.accepted, level: run.level, externalId: payload.externalId }
    });
    throw new HttpError(409, `Limite de ${target} novos leads finais atingido para o modo ${run.level}`);
  }

  const phone = normalizePhone(payload.phone);
  const whatsapp = normalizePhone(payload.whatsapp) ?? phone;
  const instagramUrl = normalizeUrl(payload.instagramUrl);
  const personName = (payload.personName || payload.name).trim();
  const businessName = payload.name.trim() || personName;
  const evidence = JSON.stringify(payload.rawData || {}).slice(0, 6000);
  if (!instagramUrl || !isWorkerProfessionalInstagram(instagramUrl, personName, evidence) || (!phone && !whatsapp)) {
    throw new HttpError(400, "Lead do worker precisa ter Instagram profissional/contextual e telefone/WhatsApp válido");
  }
  const websiteUrl = sanitizeWorkerWebsite(payload.websiteUrl, personName, evidence);
  const email = sanitizeWorkerEmail(payload.email, personName, websiteUrl, payload.sourceUrl);
  const rawData = JSON.parse(JSON.stringify({
    ...(payload.rawData || {}),
    workerRunId: runId,
    workerExternalId: payload.externalId,
    sourceUrl: payload.sourceUrl ?? null,
    rejectedWebsiteUrl: payload.websiteUrl && !websiteUrl ? payload.websiteUrl : undefined,
    rejectedEmail: payload.email && !email ? payload.email : undefined,
    websiteStatus: websiteUrl ? "found" : "not_found"
  }));

  const duplicate = await prisma.lead.findFirst({
    where: {
      organizationId: run.organizationId,
      OR: [
        { instagramUrl },
        ...(whatsapp ? [{ whatsapp }] : []),
        ...(phone ? [{ phone }] : [])
      ]
    }
  });

  const data = {
    campaignId: run.campaignId,
    businessName,
    personName,
    niche: payload.niche || run.campaign.niche,
    city: payload.city || run.campaign.city,
    state: payload.state || run.campaign.state,
    country: payload.country || run.campaign.country || "BR",
    address: payload.address ?? null,
    phone,
    whatsapp,
    email,
    websiteUrl,
    instagramUrl,
    professionalRegistry: payload.professionalRegistry ?? null,
    source: payload.source || "worker",
    rawDataJson: rawData
  };

  const lead = duplicate
    ? await prisma.lead.update({ where: { id: duplicate.id }, data })
    : await prisma.lead.create({ data: { organizationId: run.organizationId, ...data } });

  await prisma.leadDigitalPresence.upsert({
    where: { leadId: lead.id },
    create: {
      organizationId: run.organizationId,
      leadId: lead.id,
      hasWebsite: Boolean(websiteUrl),
      websiteUrl,
      hasInstagram: true,
      hasWhatsapp: Boolean(whatsapp),
      hasOnlySocialMedia: !websiteUrl,
      websiteDetectedIssuesJson: JSON.parse(JSON.stringify([])),
      websiteQualityScore: websiteUrl ? 55 : null,
      socialPresenceScore: 70
    },
    update: {
      hasWebsite: Boolean(websiteUrl),
      websiteUrl,
      hasInstagram: true,
      hasWhatsapp: Boolean(whatsapp),
      hasOnlySocialMedia: !websiteUrl,
      websiteQualityScore: websiteUrl ? 55 : null,
      socialPresenceScore: 70
    }
  });

  const score = await createOrUpdateObjectiveScore(lead as any);

  const created = !duplicate;
  const leadCountsAfter = {
    inserted: leadCountsBefore.inserted + (created ? 1 : 0),
    updated: leadCountsBefore.updated + (created ? 0 : 1)
  };
  const acceptedCount = leadCountsAfter.inserted + leadCountsAfter.updated;

  await postRunEvent(runId, {
    kind: "result",
    title: created ? "Lead inserido pelo worker" : "Lead duplicado atualizado pelo worker",
    leadName: personName,
    url: instagramUrl,
    payload: {
      leadId: lead.id,
      created,
      duplicate: !created,
      websiteUrl,
      rejectedWebsiteUrl: payload.websiteUrl && !websiteUrl ? payload.websiteUrl : undefined,
      email,
      rejectedEmail: payload.email && !email ? payload.email : undefined,
      score: {
        finalScore: score.finalScore,
        temperature: score.temperature,
        recommendedOffer: score.recommendedOffer
      },
      insertedCount: leadCountsAfter.inserted,
      updatedCount: leadCountsAfter.updated,
      acceptedCount,
      target
    }
  });

  return { lead, score, created, duplicate: !created, insertedCount: leadCountsAfter.inserted, updatedCount: leadCountsAfter.updated, acceptedCount, target };
}

export async function completeDiscoveryRun(runId: number) {
  const run = await prisma.discoveryRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      finishedAt: new Date(),
      updatedAt: new Date()
    }
  });
  return run;
}

export async function failDiscoveryRun(runId: number, error: string) {
  const run = await prisma.discoveryRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      error,
      finishedAt: new Date(),
      updatedAt: new Date()
    }
  });
  return run;
}
