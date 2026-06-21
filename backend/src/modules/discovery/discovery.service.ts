import * as cheerio from "cheerio";
import OpenAI from "openai";
import type { Browser, Page } from "playwright";
import { z } from "zod";
import { store } from "../../shared/store/memory-store.js";
import type { Campaign, DiscoveryCandidate, Lead } from "../../shared/types.js";
import { inputHash } from "../../shared/utils/hash.js";
import { StructuredRunLogger } from "../../shared/utils/structured-run-logger.js";
import { createOrUpdateObjectiveScore } from "../scoring/scoring.service.js";
import { analyzeSocial } from "../socialAnalysis/social-analysis.service.js";
import { analyzeWebsite } from "../websiteAnalysis/website-analysis.service.js";

const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const promptVersion = "professional-discovery-2026-06-21";

const DEFAULT_SEARCH_LIMIT = 12;
const MAX_AGGREGATOR_PAGES = Number(process.env.SCRAPER_MAX_AGGREGATORS ?? 4);
const MAX_NAMES_PER_AGGREGATOR = Number(process.env.SCRAPER_MAX_NAMES_PER_AGGREGATOR ?? 6);
const MAX_PROFESSIONALS_PER_CAMPAIGN = Number(process.env.SCRAPER_MAX_PROFESSIONALS ?? 12);
const MAX_SEARCH_RESULTS = Number(process.env.SCRAPER_MAX_SEARCH_RESULTS ?? 6);

let sharedBrowser: Browser | undefined;
interface DiscoveryTraceEvent {
  id: number;
  at: string;
  kind: "step" | "search_results" | "ai_request" | "ai_response" | "result";
  title: string;
  detail?: string;
  leadName?: string;
  url?: string;
  payload?: unknown;
  response?: unknown;
}

interface DiscoveryRunSnapshot {
  campaignId: number;
  running: boolean;
  startedAt: string;
  updatedAt: string;
  currentStep?: string;
  currentProfessional?: string;
  stats: {
    collected: number;
    extractedProfessionals: number;
    reviewed: number;
    inserted: number;
  };
  events: DiscoveryTraceEvent[];
}

interface ActiveDiscoveryRun {
  controller: AbortController;
  browser?: Browser;
  snapshot: DiscoveryRunSnapshot;
  sequence: number;
  logger?: StructuredRunLogger;
}

const activeDiscoveryRuns = new Map<number, ActiveDiscoveryRun>();
const recentDiscoverySnapshots = new Map<number, DiscoveryRunSnapshot>();

export interface RawSearchCandidate {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface CompactPage {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  links: Array<{ text: string; href: string }>;
}

interface ProfessionalSeed {
  name: string;
  sourceUrl: string;
  sourceTitle: string;
  evidence: string;
}

interface EnrichedProfessional {
  name: string;
  searchWebsiteUrl?: string;
  instagramUrl?: string;
  instagramExternalUrl?: string;
  finalWebsiteUrl?: string;
  emails: string[];
  phones: string[];
  whatsappNumbers: string[];
  hasOwnWebsite: boolean;
  reason: string;
  sourceUrl: string;
  sourceTitle: string;
}

const professionalsSchema = z.object({
  professionals: z.array(z.object({
    name: z.string(),
    evidence: z.string().optional(),
    confidence: z.number().min(0).max(1).optional()
  }))
});

const instagramLinkSchema = z.object({
  externalUrl: z.string().optional(),
  isOwnWebsite: z.boolean(),
  reason: z.string()
});

const professionalResultReviewSchema = z.object({
  isProfessionalMatch: z.boolean(),
  resultType: z.enum(["website", "instagram", "directory", "social", "other"]),
  websiteUrl: z.string().optional(),
  instagramUrl: z.string().optional(),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  whatsappNumbers: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function absoluteUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

function cleanDuckUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.href;
  } catch {
    return url;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isAggregatorUrl(url: string, text = ""): boolean {
  const haystack = normalize(`${hostOf(url)} ${url} ${text}`);
  return [
    "doctoralia",
    "psicologiaviva",
    "zenklub",
    "mundopsicologos",
    "mundo psicologos",
    "boaconsulta",
    "catalogo",
    "diretorio",
    "guia",
    "telelistas",
    "apontador",
    "econodata",
    "solutudo",
    "escavador",
    "linkedin",
    "facebook",
    "instagram",
    "youtube",
    "tiktok",
    "google.com/maps"
  ].some((term) => haystack.includes(term));
}

function isSocialUrl(url: string): boolean {
  const host = hostOf(url);
  return ["instagram.com", "facebook.com", "linkedin.com", "youtube.com", "tiktok.com"].some((domain) => host.endsWith(domain));
}

function isInstagramProfileUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host.endsWith("instagram.com")) return false;
  return !/\/(p|reel|reels|stories|explore|accounts|about|developer)\//i.test(url);
}

function isLinkHubOrContactUrl(url: string): boolean {
  const host = hostOf(url);
  const lower = url.toLowerCase();
  return [
    "linktr.ee",
    "linktree.com",
    "beacons.ai",
    "bio.site",
    "taplink.cc",
    "campsite.bio",
    "wa.me",
    "whatsapp.com",
    "api.whatsapp.com",
    "bit.ly",
    "tinyurl.com"
  ].some((domain) => host.endsWith(domain) || lower.includes(domain));
}

function looksLikeOwnWebsite(url: string, text = ""): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (isAggregatorUrl(url, text) || isSocialUrl(url) || isLinkHubOrContactUrl(url)) return false;
  return Boolean(hostOf(url));
}

function dedupeBy<T>(items: T[], keySelector: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(keySelector(item));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createDiscoverySnapshot(campaignId: number): DiscoveryRunSnapshot {
  const now = new Date().toISOString();
  return {
    campaignId,
    running: true,
    startedAt: now,
    updatedAt: now,
    stats: {
      collected: 0,
      extractedProfessionals: 0,
      reviewed: 0,
      inserted: 0
    },
    events: []
  };
}

function touchSnapshot(run: ActiveDiscoveryRun): void {
  run.snapshot.updatedAt = new Date().toISOString();
}

function pushEvent(
  run: ActiveDiscoveryRun,
  event: Omit<DiscoveryTraceEvent, "id" | "at">
): void {
  const storedEvent = {
    id: ++run.sequence,
    at: new Date().toISOString(),
    ...event
  };
  run.snapshot.events.push(storedEvent);
  if (run.snapshot.events.length > 120) {
    run.snapshot.events.splice(0, run.snapshot.events.length - 120);
  }
  touchSnapshot(run);
  run.logger?.append(storedEvent);
}

function setRunStep(run: ActiveDiscoveryRun, step: string, detail?: string, leadName?: string): void {
  run.snapshot.currentStep = step;
  if (leadName) {
    run.snapshot.currentProfessional = leadName;
  }
  pushEvent(run, {
    kind: "step",
    title: step,
    detail,
    leadName
  });
}

function updateRunStats(run: ActiveDiscoveryRun, updates: Partial<DiscoveryRunSnapshot["stats"]>): void {
  run.snapshot.stats = {
    ...run.snapshot.stats,
    ...updates
  };
  touchSnapshot(run);
}

export function getCampaignDiscoveryStatus(campaignId: number): DiscoveryRunSnapshot | null {
  return activeDiscoveryRuns.get(campaignId)?.snapshot ?? recentDiscoverySnapshots.get(campaignId) ?? null;
}

function persistHtmlArtifact(
  run: ActiveDiscoveryRun | undefined,
  label: string,
  html: string,
  meta?: Record<string, unknown>
): string | undefined {
  if (!run?.logger) return undefined;
  return run.logger.writeHtmlArtifact(label, html, meta);
}

function parseDuckDuckGoResults(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  return $(".result")
    .slice(0, limit)
    .map((_, element) => {
      const titleElement = $(element).find(".result__a").first();
      return {
        title: compactText(titleElement.text(), 180),
        url: cleanDuckUrl(titleElement.attr("href") ?? ""),
        snippet: compactText($(element).find(".result__snippet").text(), 280),
        source: "duckduckgo_html"
      };
    })
    .get()
    .filter((candidate) => candidate.title && candidate.url);
}

async function collectDuckDuckGoQuery(
  query: string,
  limit: number,
  signal?: AbortSignal,
  browser?: Browser,
  page?: Page,
  run?: ActiveDiscoveryRun
): Promise<SearchResult[]> {
  throwIfDiscoveryStopped(signal);
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const searchPage = page ?? await newPage(browser);
  const ownsPage = Boolean(searchPage) && !page;
  if (searchPage) {
    try {
      await searchPage.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      throwIfDiscoveryStopped(signal);
      await searchPage.waitForTimeout(Number(process.env.SCRAPER_STEP_DELAY_MS ?? 900));
      throwIfDiscoveryStopped(signal);
      const html = await searchPage.content();
      persistHtmlArtifact(run, "duckduckgo-search", html, {
        query,
        url,
        mode: "browser"
      });
      return parseDuckDuckGoResults(html, limit);
    } catch (error) {
      if (isDiscoveryStopped(error)) throw error;
    } finally {
      if (ownsPage) {
        await closePageWhenDone(searchPage);
      }
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const stopFetch = () => controller.abort();
  signal?.addEventListener("abort", stopFetch, { once: true });
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "LeadRadar/0.1 (+human-reviewed internal prospecting)" }
    });
    throwIfDiscoveryStopped(signal);
    const html = await response.text();
    persistHtmlArtifact(run, "duckduckgo-search", html, {
      query,
      url,
      mode: "fetch"
    });
    return parseDuckDuckGoResults(html, limit);
  } catch (error) {
    if (isDiscoveryStopped(error)) throw error;
    return [];
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", stopFetch);
  }
}

async function collectInitialCandidates(
  campaign: Campaign,
  limit: number,
  signal?: AbortSignal,
  browser?: Browser,
  page?: Page,
  run?: ActiveDiscoveryRun
): Promise<RawSearchCandidate[]> {
  const query = `${campaign.niche} ${campaign.city} ${campaign.state} psicólogos atendimento whatsapp instagram site`;
  return collectDuckDuckGoQuery(query, limit, signal, browser, page, run);
}

function isHeadlessMode(): boolean {
  return process.env.SCRAPER_HEADLESS === "true";
}

function shouldKeepBrowserOpen(): boolean {
  return !isHeadlessMode() && process.env.SCRAPER_KEEP_BROWSER_OPEN !== "false";
}

async function closePageWhenDone(page: Page): Promise<void> {
  if (!isHeadlessMode() && process.env.SCRAPER_KEEP_PAGES_OPEN !== "false") return;
  await page.close().catch(() => undefined);
}

function throwIfDiscoveryStopped(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("DISCOVERY_STOPPED");
  }
}

function isDiscoveryStopped(error: unknown): boolean {
  return error instanceof Error && error.message === "DISCOVERY_STOPPED";
}

async function launchBrowser(): Promise<Browser | undefined> {
  if (process.env.SCRAPER_USE_BROWSER === "false") return undefined;
  try {
    if (shouldKeepBrowserOpen() && sharedBrowser?.isConnected()) return sharedBrowser;

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: isHeadlessMode(),
      slowMo: Number(process.env.SCRAPER_SLOWMO_MS ?? (isHeadlessMode() ? 0 : 350))
    });
    if (shouldKeepBrowserOpen()) {
      sharedBrowser = browser;
      browser.on("disconnected", () => {
        if (sharedBrowser === browser) sharedBrowser = undefined;
      });
    }
    return browser;
  } catch (error) {
    console.error("[discovery] failed to launch browser", error);
    return undefined;
  }
}

async function newPage(browser?: Browser): Promise<Page | undefined> {
  if (!browser) return undefined;
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36 LeadRadar/0.1"
  });
  page.setDefaultTimeout(12000);
  return page;
}

async function searchDuckDuckGo(
  query: string,
  limit = MAX_SEARCH_RESULTS,
  signal?: AbortSignal,
  browser?: Browser,
  page?: Page,
  run?: ActiveDiscoveryRun
): Promise<SearchResult[]> {
  throwIfDiscoveryStopped(signal);
  return collectDuckDuckGoQuery(query, limit, signal, browser, page, run);
}

async function fetchHtml(
  url: string,
  browser?: Browser,
  signal?: AbortSignal,
  page?: Page,
  run?: ActiveDiscoveryRun,
  label = "page"
): Promise<string> {
  throwIfDiscoveryStopped(signal);
  const workPage = page ?? await newPage(browser);
  const ownsPage = Boolean(workPage) && !page;
  if (workPage) {
    try {
      await workPage.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      throwIfDiscoveryStopped(signal);
      await workPage.waitForTimeout(Number(process.env.SCRAPER_STEP_DELAY_MS ?? 700));
      throwIfDiscoveryStopped(signal);
      const html = await workPage.content();
      persistHtmlArtifact(run, label, html, {
        url,
        mode: "browser"
      });
      return html;
    } catch (error) {
      throwIfDiscoveryStopped(signal);
      if (isDiscoveryStopped(error)) throw error;
      // Fall back to regular fetch below.
    } finally {
      if (ownsPage) {
        await closePageWhenDone(workPage);
      }
    }
  }

  throwIfDiscoveryStopped(signal);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const stopFetch = () => controller.abort();
  signal?.addEventListener("abort", stopFetch, { once: true });
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "LeadRadar/0.1 (+human-reviewed internal prospecting)" }
    });
    const html = await response.text();
    persistHtmlArtifact(run, label, html, {
      url,
      mode: "fetch",
      httpStatus: response.status
    });
    return html;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", stopFetch);
  }
}

function compactPageFromHtml(url: string, html: string): CompactPage {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, canvas, iframe").remove();
  const links = $("a")
    .slice(0, 80)
    .map((_, element) => ({
      text: compactText($(element).text(), 90),
      href: absoluteUrl($(element).attr("href") ?? "", url)
    }))
    .get()
    .filter((link) => link.text || /^https?:\/\//i.test(link.href));
  return {
    url,
    title: compactText($("title").first().text(), 160),
    description: compactText($('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "", 260),
    headings: $("h1, h2, h3")
      .slice(0, 24)
      .map((_, element) => compactText($(element).text(), 120))
      .get()
      .filter(Boolean),
    text: compactText($("body").text(), 4200),
    links
  };
}

function fallbackExtractNames(page: CompactPage, campaign: Campaign): ProfessionalSeed[] {
  const text = `${page.title} ${page.headings.join(" ")} ${page.text}`;
  const matches = text.match(/\b(?:Dra?\.?|Psic[oó]loga?|Psic[oó]logo)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ']+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ']+){1,4}/g) ?? [];
  const seeds = matches.map((match) => ({
    name: compactText(match.replace(/\b(?:Dra?\.?|Psic[oó]loga?|Psic[oó]logo)\s+/i, ""), 90),
    sourceUrl: page.url,
    sourceTitle: page.title,
    evidence: "Extraído por heurística do texto da página agregadora"
  }));
  const city = normalize(campaign.city);
  return dedupeBy(seeds, (seed) => seed.name)
    .filter((seed) => seed.name.split(" ").length >= 2 && normalize(`${seed.evidence} ${page.text}`).includes(city))
    .slice(0, MAX_NAMES_PER_AGGREGATOR);
}

async function extractProfessionalsWithAi(
  page: CompactPage,
  campaign: Campaign,
  run?: ActiveDiscoveryRun
): Promise<ProfessionalSeed[] | undefined> {
  if (!process.env.OPENAI_API_KEY) return undefined;
  const input = {
    target: {
      niche: campaign.niche,
      city: campaign.city,
      state: campaign.state
    },
    page: {
      url: page.url,
      title: page.title,
      description: page.description,
      headings: page.headings.slice(0, 16),
      links: page.links.slice(0, 40),
      text: page.text
    }
  };
  if (run) {
    pushEvent(run, {
      kind: "ai_request",
      title: "IA extraindo profissionais do agregador",
      url: page.url,
      payload: input
    });
  }
  if (run) {
    pushEvent(run, {
      kind: "ai_request",
      title: "IA analisando perfil do Instagram",
      url: page.url,
      payload: input
    });
  }
  const hash = inputHash(input);
  const cacheKey = ["campaign", campaign.id, "aggregator_professional_extraction", model, promptVersion, hash].join(":");
  const cached = store.aiCache.get(cacheKey)?.outputJson;
  if (cached) {
    const parsed = professionalsSchema.parse(cached);
    if (run) {
      pushEvent(run, {
        kind: "ai_response",
        title: "Profissionais extraídos do cache",
        url: page.url,
        response: parsed
      });
    }
    return parsed.professionals.map((item) => ({
      name: compactText(item.name, 90),
      sourceUrl: page.url,
      sourceTitle: page.title,
      evidence: item.evidence ?? "Extraído por IA"
    }));
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você extrai nomes de profissionais reais de páginas agregadoras. Use somente o JSON recebido. Retorne JSON válido no formato {\"professionals\":[{\"name\":\"Nome completo\",\"evidence\":\"trecho curto\",\"confidence\":0.0}]}. Ignore clínicas, empresas, textos genéricos e cidades diferentes."
      },
      { role: "user", content: JSON.stringify(input) }
    ]
  });
  const content = response.choices[0]?.message.content;
  if (!content) return undefined;
  const parsed = professionalsSchema.parse(JSON.parse(content));
  if (run) {
    pushEvent(run, {
      kind: "ai_response",
      title: "Resposta da IA no agregador",
      url: page.url,
      response: parsed
    });
  }
  store.aiCache.set(cacheKey, {
    id: store.nextId("aiCache"),
    entityType: "campaign",
    entityId: String(campaign.id),
    analysisType: "aggregator_professional_extraction",
    model,
    promptVersion,
    inputHash: hash,
    inputJson: input,
    outputJson: parsed,
    createdAt: new Date().toISOString()
  });
  return parsed.professionals
    .filter((item) => (item.confidence ?? 0.6) >= 0.45)
    .map((item) => ({
      name: compactText(item.name, 90),
      sourceUrl: page.url,
      sourceTitle: page.title,
      evidence: item.evidence ?? "Extraído por IA"
    }));
}

async function analyzeInstagramLinkWithAi(
  page: CompactPage,
  run?: ActiveDiscoveryRun
): Promise<{ externalUrl?: string; isOwnWebsite: boolean; reason: string } | undefined> {
  if (!process.env.OPENAI_API_KEY) return undefined;
  const input = {
    profile: {
      url: page.url,
      title: page.title,
      description: page.description,
      headings: page.headings.slice(0, 8),
      links: page.links.slice(0, 30),
      text: compactText(page.text, 1800)
    },
    rule: "Identifique o link externo principal do perfil. Marque isOwnWebsite=true somente se parecer site próprio profissional, não linktree, whatsapp, agregador, marketplace ou rede social."
  };
  const hash = inputHash(input);
  const cacheKey = ["instagram_profile", page.url, "external_link_review", model, promptVersion, hash].join(":");
  const cached = store.aiCache.get(cacheKey)?.outputJson;
  if (cached) {
    const parsed = instagramLinkSchema.parse(cached);
    if (run) {
      pushEvent(run, {
        kind: "ai_response",
        title: "Resposta da IA reaproveitada para Instagram",
        url: page.url,
        response: parsed
      });
    }
    return parsed;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você analisa um perfil público de Instagram representado por JSON compacto. Retorne apenas JSON válido no formato {\"externalUrl\":\"https://...\",\"isOwnWebsite\":true,\"reason\":\"...\"}. Se não houver link útil, omita externalUrl e explique."
      },
      { role: "user", content: JSON.stringify(input) }
    ]
  });
  const content = response.choices[0]?.message.content;
  if (!content) return undefined;
  const parsed = instagramLinkSchema.parse(JSON.parse(content));
  if (run) {
    pushEvent(run, {
      kind: "ai_response",
      title: "Resposta da IA sobre o Instagram",
      url: page.url,
      response: parsed
    });
  }
  store.aiCache.set(cacheKey, {
    id: store.nextId("aiCache"),
    entityType: "instagram_profile",
    entityId: page.url,
    analysisType: "instagram_external_link_review",
    model,
    promptVersion,
    inputHash: hash,
    inputJson: input,
    outputJson: parsed,
    createdAt: new Date().toISOString()
  });
  return parsed;
}

function extractContacts(text: string): { emails: string[]; phones: string[]; whatsappNumbers: string[] } {
  const emails = Array.from(new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []));
  const phones = Array.from(
    new Set(
      (text.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})-?\d{4}/g) ?? [])
        .map((item) => item.replace(/[^\d+]/g, ""))
        .filter((item) => item.length >= 10)
    )
  );
  const whatsappNumbers = Array.from(
    new Set(
      (text.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{10,15})/gi) ?? [])
        .map((item) => item.replace(/[^\d]/g, ""))
        .filter(Boolean)
    )
  );
  return { emails, phones, whatsappNumbers };
}

async function reviewProfessionalResultPage(
  seed: ProfessionalSeed,
  result: SearchResult,
  page: CompactPage,
  campaign: Campaign,
  run?: ActiveDiscoveryRun
): Promise<z.infer<typeof professionalResultReviewSchema> | undefined> {
  const contacts = extractContacts(`${page.text} ${page.links.map((link) => `${link.text} ${link.href}`).join(" ")}`);
  const input = {
    professional: {
      name: seed.name,
      city: campaign.city,
      state: campaign.state,
      niche: campaign.niche
    },
    result: {
      title: result.title,
      url: result.url,
      snippet: result.snippet
    },
    page: {
      url: page.url,
      title: page.title,
      description: page.description,
      headings: page.headings.slice(0, 14),
      links: page.links.slice(0, 24),
      text: compactText(page.text, 2200)
    },
    contacts
  };
  if (run) {
    pushEvent(run, {
      kind: "ai_request",
      title: "IA revisando resultado do buscador",
      leadName: seed.name,
      url: result.url,
      payload: input
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    const fallback = {
      isProfessionalMatch: normalize(`${result.title} ${page.title} ${page.text}`).includes(normalize(seed.name)),
      resultType: isInstagramProfileUrl(result.url) ? "instagram" : looksLikeOwnWebsite(result.url, result.title) ? "website" : "other",
      websiteUrl: looksLikeOwnWebsite(result.url, result.title) ? result.url : undefined,
      instagramUrl: isInstagramProfileUrl(result.url) ? result.url : undefined,
      emails: contacts.emails,
      phones: contacts.phones,
      whatsappNumbers: contacts.whatsappNumbers,
      confidence: 0.45,
      reason: "Classificação heurística sem IA."
    } satisfies z.infer<typeof professionalResultReviewSchema>;
    if (run) {
      pushEvent(run, {
        kind: "ai_response",
        title: "Fallback heurístico do resultado",
        leadName: seed.name,
        url: result.url,
        response: fallback
      });
    }
    return fallback;
  }

  const hash = inputHash(input);
  const cacheKey = ["lead_search_result", seed.name, result.url, "search_candidate_review", model, promptVersion, hash].join(":");
  const cached = store.aiCache.get(cacheKey)?.outputJson;
  if (cached) {
    const parsed = professionalResultReviewSchema.parse(cached);
    if (run) {
      pushEvent(run, {
        kind: "ai_response",
        title: "Resposta da IA reutilizada do cache",
        leadName: seed.name,
        url: result.url,
        response: parsed
      });
    }
    return parsed;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você avalia se um resultado de busca pertence ao profissional pesquisado. Use apenas o JSON recebido. Retorne JSON válido no formato {\"isProfessionalMatch\":true,\"resultType\":\"website|instagram|directory|social|other\",\"websiteUrl\":\"https://...\",\"instagramUrl\":\"https://...\",\"emails\":[...],\"phones\":[...],\"whatsappNumbers\":[...],\"confidence\":0.0,\"reason\":\"...\"}. Só marque websiteUrl se parecer site próprio. Só marque instagramUrl se for perfil do profissional."
      },
      { role: "user", content: JSON.stringify(input) }
    ]
  });
  const content = response.choices[0]?.message.content;
  if (!content) return undefined;
  const parsed = professionalResultReviewSchema.parse(JSON.parse(content));
  store.aiCache.set(cacheKey, {
    id: store.nextId("aiCache"),
    entityType: "lead_search_result",
    entityId: `${seed.name}:${result.url}`,
    analysisType: "search_candidate_review",
    model,
    promptVersion,
    inputHash: hash,
    inputJson: input,
    outputJson: parsed,
    createdAt: new Date().toISOString()
  });
  if (run) {
    pushEvent(run, {
      kind: "ai_response",
      title: "Resposta da IA sobre o resultado",
      leadName: seed.name,
      url: result.url,
      response: parsed
    });
  }
  return parsed;
}

async function extractProfessionalsFromAggregator(
  candidate: RawSearchCandidate,
  campaign: Campaign,
  browser?: Browser,
  signal?: AbortSignal,
  page?: Page,
  run?: ActiveDiscoveryRun
): Promise<ProfessionalSeed[]> {
  try {
    throwIfDiscoveryStopped(signal);
    const html = await fetchHtml(candidate.url, browser, signal, page, run, "aggregator-page");
    throwIfDiscoveryStopped(signal);
    const compactedPage = compactPageFromHtml(candidate.url, html);
    const aiSeeds = await extractProfessionalsWithAi(compactedPage, campaign, run).catch(() => undefined);
    const seeds = aiSeeds?.length ? aiSeeds : fallbackExtractNames(compactedPage, campaign);
    return dedupeBy(seeds, (seed) => seed.name).slice(0, MAX_NAMES_PER_AGGREGATOR);
  } catch (error) {
    if (isDiscoveryStopped(error)) throw error;
    return [];
  }
}

function seedFromDirectCandidate(candidate: RawSearchCandidate): ProfessionalSeed {
  return {
    name: compactText(candidate.title.replace(/\s[-|].*$/, ""), 90),
    sourceUrl: candidate.url,
    sourceTitle: candidate.title,
    evidence: candidate.snippet || "Resultado direto de busca"
  };
}

function chooseOwnWebsite(results: SearchResult[]): string | undefined {
  return results.find((result) => looksLikeOwnWebsite(result.url, `${result.title} ${result.snippet}`))?.url;
}

function chooseInstagram(results: SearchResult[]): string | undefined {
  return results.find((result) => isInstagramProfileUrl(result.url))?.url;
}

async function discoverInstagramExternalLink(
  instagramUrl: string,
  browser?: Browser,
  signal?: AbortSignal,
  page?: Page,
  run?: ActiveDiscoveryRun
): Promise<string | undefined> {
  try {
    throwIfDiscoveryStopped(signal);
    const html = await fetchHtml(instagramUrl, browser, signal, page, run, "instagram-profile");
    throwIfDiscoveryStopped(signal);
    const compactedPage = compactPageFromHtml(instagramUrl, html);
    const aiReview = await analyzeInstagramLinkWithAi(compactedPage, run).catch(() => undefined);
    if (aiReview?.externalUrl) return aiReview.externalUrl;
    return compactedPage.links
      .map((link) => link.href)
      .find((href) => /^https?:\/\//i.test(href) && !isSocialUrl(href) && !hostOf(href).endsWith("instagram.com"));
  } catch (error) {
    if (isDiscoveryStopped(error)) throw error;
    return undefined;
  }
}

async function enrichProfessional(
  seed: ProfessionalSeed,
  campaign: Campaign,
  browser?: Browser,
  signal?: AbortSignal,
  page?: Page,
  run?: ActiveDiscoveryRun
): Promise<EnrichedProfessional> {
  throwIfDiscoveryStopped(signal);
  const searchQuery = `"${seed.name}"`;
  const results = await searchDuckDuckGo(searchQuery, Math.max(MAX_SEARCH_RESULTS, 8), signal, browser, page, run);
  if (run) {
    pushEvent(run, {
      kind: "search_results",
      title: "Resultados da busca pelo nome",
      leadName: seed.name,
      payload: {
        query: searchQuery,
        results: results.map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.snippet
        }))
      }
    });
  }

  let searchWebsiteUrl: string | undefined;
  let instagramUrl: string | undefined;
  const emails = new Set<string>();
  const phones = new Set<string>();
  const whatsappNumbers = new Set<string>();
  const reasons: string[] = [];

  for (const result of results.slice(0, Math.max(MAX_SEARCH_RESULTS, 6))) {
    throwIfDiscoveryStopped(signal);
    if (run) {
      setRunStep(run, "Inspecionando resultado do buscador", result.title, seed.name);
    }
    const html = await fetchHtml(result.url, browser, signal, page, run, "search-result-page").catch(() => undefined);
    if (!html) continue;
    const compactedPage = compactPageFromHtml(result.url, html);
    const reviewed = await reviewProfessionalResultPage(seed, result, compactedPage, campaign, run);
    if (!reviewed?.isProfessionalMatch) continue;

    reasons.push(reviewed.reason);
    for (const email of reviewed.emails) emails.add(email);
    for (const phone of reviewed.phones) phones.add(phone);
    for (const phone of reviewed.whatsappNumbers) whatsappNumbers.add(phone);

    const resultInstagramUrl = reviewed.instagramUrl
      ?? (isInstagramProfileUrl(result.url) ? result.url : compactedPage.links.find((link) => isInstagramProfileUrl(link.href))?.href);
    const resultWebsiteUrl = reviewed.websiteUrl
      ?? (looksLikeOwnWebsite(result.url, `${result.title} ${result.snippet}`) ? result.url : undefined);

    if (!instagramUrl && resultInstagramUrl) instagramUrl = resultInstagramUrl;
    if (!searchWebsiteUrl && resultWebsiteUrl) searchWebsiteUrl = resultWebsiteUrl;
    if (searchWebsiteUrl && instagramUrl) break;
  }

  const instagramExternalUrl = instagramUrl
    ? await discoverInstagramExternalLink(instagramUrl, browser, signal, page, run)
    : undefined;
  const instagramOwnSite = instagramExternalUrl && looksLikeOwnWebsite(instagramExternalUrl) ? instagramExternalUrl : undefined;
  const finalWebsiteUrl = searchWebsiteUrl ?? instagramOwnSite;

  return {
    name: seed.name,
    searchWebsiteUrl,
    instagramUrl,
    instagramExternalUrl,
    finalWebsiteUrl,
    emails: Array.from(emails),
    phones: Array.from(phones),
    whatsappNumbers: Array.from(whatsappNumbers),
    hasOwnWebsite: Boolean(finalWebsiteUrl),
    reason: finalWebsiteUrl
      ? reasons[0] ?? "Site proprio encontrado durante a navegacao pelos resultados organicos."
      : "A busca organica pelo nome nao encontrou site proprio relevante. Isso conta como sinal de SEO fraco ou ausencia de site.",
    sourceUrl: seed.sourceUrl,
    sourceTitle: seed.sourceTitle
  };
}

function candidateAlreadyExists(professional: EnrichedProfessional): boolean {
  const normalizedName = normalize(professional.name);
  const normalizedWebsite = normalize(professional.finalWebsiteUrl ?? "");
  const normalizedInstagram = normalize(professional.instagramUrl ?? "");
  return Array.from(store.leads.values()).some((lead) => {
    const raw = normalize(JSON.stringify(lead.rawDataJson ?? {}));
    return normalize(lead.businessName) === normalizedName
      || (normalizedWebsite && normalize(lead.websiteUrl ?? "") === normalizedWebsite)
      || (normalizedInstagram && normalize(lead.instagramUrl ?? "") === normalizedInstagram)
      || raw.includes(normalizedName);
  });
}

function leadFromProfessional(professional: EnrichedProfessional, campaign: Campaign): Lead {
  const now = new Date().toISOString();
  return {
    id: store.nextId("lead"),
    campaignId: campaign.id,
    businessName: professional.name,
    personName: professional.name,
    niche: campaign.niche,
    city: campaign.city,
    state: campaign.state,
    country: campaign.country,
    phone: professional.phones[0],
    whatsapp: professional.whatsappNumbers[0] ?? professional.phones[0],
    email: professional.emails[0],
    websiteUrl: professional.finalWebsiteUrl,
    instagramUrl: professional.instagramUrl,
    source: "professional_deep_discovery",
    rawDataJson: {
      discoveryMode: "aggregator_to_professional_deep_discovery",
      sourceTitle: professional.sourceTitle,
      sourceUrl: professional.sourceUrl,
      searchWebsiteUrl: professional.searchWebsiteUrl,
      searchEngine: "duckduckgo",
      instagramUrl: professional.instagramUrl,
      instagramExternalUrl: professional.instagramExternalUrl,
      contacts: {
        emails: professional.emails,
        phones: professional.phones,
        whatsappNumbers: professional.whatsappNumbers
      },
      hasOwnWebsite: professional.hasOwnWebsite,
      reason: professional.reason
    },
    createdAt: now,
    updatedAt: now
  };
}

function saveDiscoveryCandidate(
  campaign: Campaign,
  professional: EnrichedProfessional,
  status: DiscoveryCandidate["status"],
  lead?: Lead,
  reason = professional.reason
): DiscoveryCandidate {
  const candidate: DiscoveryCandidate = {
    id: store.nextId("discoveryCandidate"),
    campaignId: campaign.id,
    title: professional.name,
    url: professional.finalWebsiteUrl ?? professional.instagramUrl ?? professional.sourceUrl,
    snippet: reason,
    source: "professional_deep_discovery",
    priority: professional.hasOwnWebsite ? "medium" : "high",
    isPotentialLead: true,
    reason,
    status,
    leadId: lead?.id,
    createdAt: new Date().toISOString()
  };
  store.discoveryCandidates.set(candidate.id, candidate);
  return candidate;
}

export async function reviewSearchCandidates(campaign: Campaign, candidates: RawSearchCandidate[]) {
  const professionals = candidates
    .filter((candidate) => !isAggregatorUrl(candidate.url, `${candidate.title} ${candidate.snippet}`))
    .map((candidate) => seedFromDirectCandidate(candidate))
    .slice(0, MAX_PROFESSIONALS_PER_CAMPAIGN);
  return {
    candidates: professionals.map((seed, index) => ({
      index,
      isPotentialLead: true,
      priority: "medium" as const,
      reason: `Candidato direto identificado: ${seed.name}`
    }))
  };
}

export async function stopCampaignDiscovery(campaignId: number): Promise<{ stopped: boolean }> {
  const run = activeDiscoveryRuns.get(campaignId);
  if (!run) return { stopped: false };

  pushEvent(run, {
    kind: "result",
    title: "Automação interrompida",
    detail: "Parada solicitada manualmente."
  });
  run.snapshot.running = false;
  touchSnapshot(run);
  recentDiscoverySnapshots.set(campaignId, structuredClone(run.snapshot));
  run.controller.abort();
  if (run.browser) {
    await run.browser.close().catch(() => undefined);
    if (sharedBrowser === run.browser) sharedBrowser = undefined;
  }
  activeDiscoveryRuns.delete(campaignId);
  return { stopped: true };
}

export async function discoverCampaign(campaign: Campaign, limit = DEFAULT_SEARCH_LIMIT) {
  await stopCampaignDiscovery(campaign.id);

  const controller = new AbortController();
  const run: ActiveDiscoveryRun = {
    controller,
    browser: undefined,
    snapshot: createDiscoverySnapshot(campaign.id),
    sequence: 0,
    logger: new StructuredRunLogger("discovery", campaign.id)
  };
  activeDiscoveryRuns.set(campaign.id, run);
  recentDiscoverySnapshots.set(campaign.id, structuredClone(run.snapshot));

  const browser = await launchBrowser();
  run.browser = browser;
  const workflowPage = await newPage(browser);
  const savedCandidates: DiscoveryCandidate[] = [];
  const insertedLeads: Lead[] = [];

  try {
    setRunStep(run, "Iniciando descoberta", `Campanha ${campaign.name}`);
    pushEvent(run, {
      kind: "result",
      title: "Logger estruturado inicializado",
      detail: run.logger?.directory,
      response: {
        directory: run.logger?.directory,
        runId: run.logger?.runId
      }
    });
    throwIfDiscoveryStopped(controller.signal);
    const collected = dedupeBy(
      await collectInitialCandidates(campaign, limit, controller.signal, browser, workflowPage, run),
      (candidate) => candidate.url
    );
    updateRunStats(run, { collected: collected.length });
    pushEvent(run, {
      kind: "search_results",
      title: "Resultados iniciais",
      payload: collected.map((candidate) => ({
        title: candidate.title,
        url: candidate.url,
        snippet: candidate.snippet
      }))
    });
    throwIfDiscoveryStopped(controller.signal);
    const aggregatorCandidates = collected
      .filter((candidate) => isAggregatorUrl(candidate.url, `${candidate.title} ${candidate.snippet}`))
      .slice(0, MAX_AGGREGATOR_PAGES);
    const directSeeds = collected
      .filter((candidate) => !isAggregatorUrl(candidate.url, `${candidate.title} ${candidate.snippet}`))
      .map((candidate) => seedFromDirectCandidate(candidate));

    const aggregatorSeeds: ProfessionalSeed[] = [];
    for (const candidate of aggregatorCandidates) {
      throwIfDiscoveryStopped(controller.signal);
      setRunStep(run, "Abrindo agregador", candidate.title);
      aggregatorSeeds.push(
        ...(await extractProfessionalsFromAggregator(candidate, campaign, browser, controller.signal, workflowPage, run))
      );
    }

    const seeds = dedupeBy([...aggregatorSeeds, ...directSeeds], (seed) => seed.name)
      .filter((seed) => seed.name.split(" ").length >= 2)
      .slice(0, Math.min(limit, MAX_PROFESSIONALS_PER_CAMPAIGN));
    updateRunStats(run, { extractedProfessionals: seeds.length });
    pushEvent(run, {
      kind: "result",
      title: "Profissionais extraídos",
      payload: seeds.map((seed) => ({
        name: seed.name,
        sourceTitle: seed.sourceTitle,
        sourceUrl: seed.sourceUrl,
        evidence: seed.evidence
      }))
    });

    for (const seed of seeds) {
      throwIfDiscoveryStopped(controller.signal);
      setRunStep(run, "Pesquisando profissional", seed.name, seed.name);
      const professional = await enrichProfessional(seed, campaign, browser, controller.signal, workflowPage, run);
      updateRunStats(run, { reviewed: run.snapshot.stats.reviewed + 1 });
      throwIfDiscoveryStopped(controller.signal);
      const duplicate = candidateAlreadyExists(professional);
      const lead = duplicate ? undefined : leadFromProfessional(professional, campaign);
      if (lead) {
        store.leads.set(lead.id, lead);
        createOrUpdateObjectiveScore(lead);
        let enrichedLead = lead;
        if (enrichedLead.instagramUrl) {
          setRunStep(run, "Analisando Instagram", enrichedLead.instagramUrl, seed.name);
          throwIfDiscoveryStopped(controller.signal);
          const socialSnapshot = await analyzeSocial(enrichedLead, {
            browser,
            page: workflowPage,
            logger: run.logger,
            leadName: seed.name
          }).catch((error) => {
            if (isDiscoveryStopped(error)) throw error;
          });
          if (socialSnapshot) {
            pushEvent(run, {
              kind: "result",
              title: "Analise social concluida",
              leadName: seed.name,
              url: enrichedLead.instagramUrl,
              response: socialSnapshot
            });
          }
          enrichedLead = store.leads.get(lead.id) ?? enrichedLead;
        }
        if (enrichedLead.websiteUrl) {
          setRunStep(run, "Analisando site", enrichedLead.websiteUrl, seed.name);
          throwIfDiscoveryStopped(controller.signal);
          const websiteSnapshot = await analyzeWebsite(enrichedLead, {
            signal: controller.signal,
            browser,
            page: workflowPage,
            logger: run.logger,
            leadName: seed.name
          }).catch((error) => {
            if (isDiscoveryStopped(error)) throw error;
          });
          if (websiteSnapshot) {
            pushEvent(run, {
              kind: "result",
              title: "Analise do site concluida",
              leadName: seed.name,
              url: enrichedLead.websiteUrl,
              response: websiteSnapshot
            });
          }
          enrichedLead = store.leads.get(lead.id) ?? enrichedLead;
        }
        insertedLeads.push(enrichedLead);
        updateRunStats(run, { inserted: insertedLeads.length });
      }
      savedCandidates.push(saveDiscoveryCandidate(
        campaign,
        professional,
        duplicate ? "duplicate" : lead ? "inserted" : "discarded",
        lead,
        duplicate ? "Candidato duplicado." : professional.reason
      ));
      pushEvent(run, {
        kind: "result",
        title: duplicate ? "Profissional duplicado" : lead ? "Profissional catalogado" : "Profissional descartado",
        leadName: seed.name,
        url: professional.finalWebsiteUrl ?? professional.instagramUrl ?? professional.sourceUrl,
        response: {
          websiteUrl: professional.finalWebsiteUrl,
          instagramUrl: professional.instagramUrl,
          emails: professional.emails,
          phones: professional.phones,
          whatsappNumbers: professional.whatsappNumbers,
          reason: professional.reason
        }
      });
    }

    run.snapshot.running = false;
    setRunStep(run, "Descoberta concluída", `${insertedLeads.length} leads inseridos`);
    recentDiscoverySnapshots.set(campaign.id, structuredClone(run.snapshot));

    return {
      collected: collected.length,
      filtered: seeds.length,
      reviewed: seeds.length,
      inserted: insertedLeads.length,
      candidates: savedCandidates,
      leads: insertedLeads,
      meta: {
        browserMode: browser ? (isHeadlessMode() ? "headless" : "headed") : "fetch_fallback",
        aggregatorPages: aggregatorCandidates.length,
        extractedProfessionals: seeds.length,
        logDirectory: run.logger?.directory
      }
    };
  } catch (error) {
    if (!isDiscoveryStopped(error)) throw error;
    run.snapshot.running = false;
    pushEvent(run, {
      kind: "result",
      title: "Descoberta cancelada",
      detail: "Execução interrompida antes da conclusão."
    });
    recentDiscoverySnapshots.set(campaign.id, structuredClone(run.snapshot));
    return {
      collected: 0,
      filtered: savedCandidates.length,
      reviewed: savedCandidates.length,
      inserted: insertedLeads.length,
      candidates: savedCandidates,
      leads: insertedLeads,
      cancelled: true,
      meta: {
        browserMode: browser ? (isHeadlessMode() ? "headless" : "headed") : "fetch_fallback",
        aggregatorPages: 0,
        extractedProfessionals: savedCandidates.length,
        logDirectory: run.logger?.directory
      }
    };
  } finally {
    run.logger?.writeJsonArtifact("final-snapshot", run.snapshot, {
      campaignId: campaign.id
    });
    run.logger?.writeJsonArtifact("final-results", {
      campaignId: campaign.id,
      candidates: savedCandidates,
      leads: insertedLeads
    });
    if (activeDiscoveryRuns.get(campaign.id) === run) {
      activeDiscoveryRuns.delete(campaign.id);
    }
    recentDiscoverySnapshots.set(campaign.id, structuredClone(run.snapshot));
    if (workflowPage && !workflowPage.isClosed()) {
      await workflowPage.close().catch(() => undefined);
    }
    if (browser && !shouldKeepBrowserOpen()) {
      await browser.close().catch(() => undefined);
    }
    await run.logger?.flush();
  }
}
