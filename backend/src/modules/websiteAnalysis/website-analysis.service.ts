import * as cheerio from "cheerio";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import OpenAI from "openai";
import type { Browser, Page } from "playwright";
import { z } from "zod";
import { store } from "../../shared/store/memory-store.js";
import type { DigitalPresence, Lead, WebsiteAiReview, WebsiteSnapshot } from "../../shared/types.js";
import { inputHash } from "../../shared/utils/hash.js";
import { extractContacts as extractContactDetails } from "../../shared/utils/contact-extraction.js";
import { StructuredRunLogger } from "../../shared/utils/structured-run-logger.js";
import { createOrUpdateObjectiveScore } from "../scoring/scoring.service.js";

const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const promptVersion = "website-review-2026-06-22-html-first-visual-guard";

const websiteReviewSchema = z.object({
  websiteQualityScore: z.number().int().min(0).max(100),
  commercialOpportunity: z.enum(["none", "landing_page", "redesign", "seo_local", "maintenance"]),
  problems: z.array(z.string()),
  strengths: z.array(z.string()),
  salesAngle: z.string(),
  confidence: z.number().min(0).max(1)
});

interface WebsiteAnalysisOptions {
  signal?: AbortSignal;
  browser?: Browser;
  page?: Page;
  logger?: StructuredRunLogger;
  leadName?: string;
}

function appendTrace(
  logger: StructuredRunLogger | undefined,
  event: Record<string, unknown>
): void {
  logger?.append({
    at: new Date().toISOString(),
    module: "website_analysis",
    ...event
  });
}

function compactText(value: string, maxLength = 600): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function detectPlatform(html: string): string | undefined {
  const lower = html.toLowerCase();
  if (lower.includes("wp-content") || lower.includes("wordpress")) return "wordpress";
  if (lower.includes("wixstatic") || lower.includes("wix.com")) return "wix";
  if (lower.includes("squarespace")) return "squarespace";
  if (lower.includes("shopify")) return "shopify";
  if (lower.includes("webflow")) return "webflow";
  return undefined;
}

function hasAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

const NON_OWN_WEBSITE_HOSTS = [
  "about.meta.com",
  "meta.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "doctoralia.com.br",
  "mundopsicologos.com.br",
  "psicologiaviva.com.br",
  "zenklub.com.br",
  "boaconsulta.com",
  "agenda.app.br",
  "melhores.com",
  "mapadatcs.com.br",
  "qualotelefone.com",
  "atosoficiais.com.br",
  "medicosbrasil.com",
  "catalogo.med.br",
  "consultasmedicas.com.br",
  "getninjas.com.br",
  "google.com",
  "google.com.br",
  "maps.app.goo.gl",
  "listamais.com.br",
  "empresafone.com.br",
  "guiatelefone.com",
  "guiatelefone.com.br",
  "guia-telefone.com",
  "acheioprofissional.com.br",
  "brfirmas.org",
  "brfirmas.com.br",
  "cnpj.biz",
  "consultarcnpj.com.br",
  "empresascnpj.com",
  "telepesquisa.com",
  "telepesquisa.com.br",
  "yelp.com",
  "todosnegocios.com",
  "br.todosnegocios.com",
  "guiafacil.com",
  "guiafacil.com.br",
  "cylex.com.br",
  "guialocal.com.br",
  "hotfrog.com.br",
  "orcid.org",
  "lattes.cnpq.br",
  "cnpq.br",
  "escavador.com",
  "jusbrasil.com.br",
  "globo.com",
  "g1.globo.com",
  "ge.globo.com",
  "uol.com.br",
  "terra.com.br",
  "metropoles.com",
  "folha.uol.com.br",
  "estadao.com.br"
];

function isNonOwnWebsiteUrl(url: string): boolean {
  const host = hostOf(url);
  return NON_OWN_WEBSITE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isIntermediateOrBlockedPage(url: string, title: string, bodyText: string): boolean {
  const haystack = `${hostOf(url)} ${url} ${title} ${bodyText}`.toLowerCase();
  return isNonOwnWebsiteUrl(url)
    || /cloudflare|executando verifica[cç][aã]o de seguran[cç]a|checking your browser|just a moment|captcha|verificando/.test(haystack)
    || /cadastro m[eé]dico|consultas m[eé]dicas|qual o telefone|localizar um telefone|atos oficiais|telefone e endere[cç]o|empresas similares|cadastre sua empresa|como chegar|ver no mapa|guia de empresas|lista telef[oô]nica/.test(haystack)
    || /yelp|todosnegocios|todos negocios|orcid|lattes|g1\.globo|ge\.globo|not[ií]cia|reportagem|jornal|business listing|\/biz\/|\/empresa\/|\/local\//.test(haystack)
    || /qual [ée] endere[cç]o da web|n[aã]o h[aá] site listado|voc[eê] pode contatar|p[aá]ginas que apenas mencionam|perfil em diret[oó]rio/.test(haystack);
}

function clearInvalidWebsiteFromLead(lead: Lead, reason: string): Lead {
  const updatedLead: Lead = {
    ...lead,
    websiteUrl: undefined,
    updatedAt: new Date().toISOString(),
    rawDataJson: {
      ...(lead.rawDataJson ?? {}),
      rejectedWebsiteCandidateUrl: lead.websiteUrl,
      websiteStatus: "aggregator_only",
      websiteInvalidReason: reason
    }
  };
  store.leads.set(updatedLead.id, updatedLead);
  return updatedLead;
}

async function launchScreenshotBrowser(): Promise<Browser | undefined> {
  if (process.env.SCRAPER_CAPTURE_SCREENSHOT === "false") return undefined;
  try {
    const { chromium } = await import("playwright");
    return chromium.launch({
      headless: process.env.SCRAPER_HEADLESS !== "false",
      slowMo: Number(process.env.SCRAPER_SLOWMO_MS ?? 150)
    });
  } catch {
    return undefined;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("DISCOVERY_STOPPED");
}

function normalizeAnalyzeWebsiteOptions(
  signalOrOptions?: AbortSignal | WebsiteAnalysisOptions
): WebsiteAnalysisOptions {
  if (!signalOrOptions) return {};
  if ("aborted" in signalOrOptions) {
    return { signal: signalOrOptions };
  }
  return signalOrOptions;
}

async function ensurePage(browser?: Browser): Promise<Page | undefined> {
  if (!browser) return undefined;
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36 LeadRadar/0.1"
  });
  page.setDefaultTimeout(18000);
  return page;
}

async function captureWebsiteScreenshot(
  url: string,
  leadId: number,
  signal?: AbortSignal
): Promise<{ path?: string; base64?: string; error?: string }> {
  throwIfAborted(signal);
  const browser = await launchScreenshotBrowser();
  if (!browser) return {};
  const stopBrowser = () => {
    void browser.close().catch(() => undefined);
  };
  signal?.addEventListener("abort", stopBrowser, { once: true });

  try {
    throwIfAborted(signal);
    const page = await browser.newPage({
      viewport: { width: 1366, height: 900 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36 LeadRadar/0.1"
    });
    page.setDefaultTimeout(15000);
    throwIfAborted(signal);
    await page.goto(url, { waitUntil: "networkidle", timeout: 18000 }).catch(async () => {
      throwIfAborted(signal);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });
    });
    throwIfAborted(signal);
    await page.waitForTimeout(Number(process.env.SCRAPER_STEP_DELAY_MS ?? 700));
    throwIfAborted(signal);

    const directory = join(process.cwd(), "storage", "screenshots");
    await mkdir(directory, { recursive: true });
    const filePath = join(directory, `lead-${leadId}-${Date.now()}.jpg`);
    await page.screenshot({
      path: filePath,
      type: "jpeg",
      quality: Number(process.env.SCRAPER_SCREENSHOT_QUALITY ?? 58),
      fullPage: false
    });
    await page.close().catch(() => undefined);

    const shouldSendToAi = process.env.SCRAPER_SEND_SCREENSHOT_TO_AI === "true";
    return {
      path: filePath,
      base64: shouldSendToAi ? (await readFile(filePath)).toString("base64") : undefined
    };
  } catch (error) {
    throwIfAborted(signal);
    return { error: error instanceof Error ? error.message : "Falha ao capturar screenshot" };
  } finally {
    signal?.removeEventListener("abort", stopBrowser);
    await browser.close().catch(() => undefined);
  }
}

async function captureScreenshotFromPage(
  page: Page,
  leadId: number
): Promise<{ path?: string; base64?: string; error?: string }> {
  try {
    const directory = join(process.cwd(), "storage", "screenshots");
    await mkdir(directory, { recursive: true });
    const filePath = join(directory, `lead-${leadId}-${Date.now()}.jpg`);
    await page.screenshot({
      path: filePath,
      type: "jpeg",
      quality: Number(process.env.SCRAPER_SCREENSHOT_QUALITY ?? 58),
      fullPage: false
    });
    const shouldSendToAi = process.env.SCRAPER_SEND_SCREENSHOT_TO_AI === "true";
    return {
      path: filePath,
      base64: shouldSendToAi ? (await readFile(filePath)).toString("base64") : undefined
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao capturar screenshot" };
  }
}

async function collectVisualMetrics(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const rgbParts = (value: string) => {
      const match = value.match(/\d+(\.\d+)?/g) ?? [];
      return match.slice(0, 3).map(Number);
    };
    const luminance = ([r, g, b]: number[]) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const [rr, gg, bb] = [channel(r), channel(g), channel(b)];
      return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
    };
    const contrast = (fg: number[], bg: number[]) => {
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
      return Number((((lighter + 0.05) / (darker + 0.05)) || 1).toFixed(2));
    };
    const elements = Array.from(document.querySelectorAll("h1, h2, h3, p, a, button, label, li"))
      .filter((node) => (node.textContent ?? "").trim().length > 0)
      .slice(0, 120);
    const contrastSamples = elements.map((element) => {
      const style = window.getComputedStyle(element);
      const fg = rgbParts(style.color);
      let current: HTMLElement | null = element as HTMLElement;
      let background = rgbParts(style.backgroundColor);
      while (current && background.length < 3) {
        current = current.parentElement;
        if (!current) break;
        const currentBg = rgbParts(window.getComputedStyle(current).backgroundColor);
        if (currentBg.length === 3) background = currentBg;
      }
      if (fg.length !== 3 || background.length !== 3) return null;
      return contrast(fg, background);
    }).filter((sample): sample is number => typeof sample === "number");
    const headings = document.querySelectorAll("h1, h2, h3").length;
    const sections = document.querySelectorAll("section, article, main").length;
    const buttons = document.querySelectorAll("button, a").length;
    const paragraphs = document.querySelectorAll("p, li").length;
    return {
      headingCountRendered: headings,
      semanticSections: sections,
      interactiveElements: buttons,
      textBlocks: paragraphs,
      contrastAverage: contrastSamples.length
        ? Number((contrastSamples.reduce((sum, sample) => sum + sample, 0) / contrastSamples.length).toFixed(2))
        : undefined,
      contrastMin: contrastSamples.length ? Math.min(...contrastSamples) : undefined,
      contrastBelow45Count: contrastSamples.filter((sample) => sample < 4.5).length,
      pageHeight: document.documentElement.scrollHeight,
      pageWidth: document.documentElement.scrollWidth
    };
  });
}

function buildDetectedIssues(snapshot: Omit<WebsiteSnapshot, "id" | "leadId" | "snapshotHash" | "createdAt">): string[] {
  const issues: string[] = [];
  if (!snapshot.hasSsl) issues.push("Site sem SSL");
  if ((snapshot.loadTimeMs ?? 0) > 3000) issues.push("Tempo de resposta acima de 3s");
  if (!snapshot.title) issues.push("Title ausente");
  if (!snapshot.metaDescription) issues.push("Meta description ausente");
  if (!snapshot.hasCta) issues.push("CTA claro não detectado");
  if (!snapshot.hasWhatsapp) issues.push("WhatsApp não detectado no site");
  if (!snapshot.hasServices) issues.push("Serviços não detectados com clareza");
  if (!snapshot.hasContactForm) issues.push("Formulário de contato não detectado");
  return issues;
}

function fallbackWebsiteReview(snapshot: WebsiteSnapshot): WebsiteAiReview {
  const problems = snapshot.detectedIssuesJson;
  const strengths: string[] = [];
  if (snapshot.hasSsl) strengths.push("Possui SSL");
  if (snapshot.hasCta) strengths.push("Possui chamada de ação");
  if (snapshot.hasContactForm) strengths.push("Possui formulário de contato");
  if (snapshot.hasServices) strengths.push("Apresenta serviços");
  if (snapshot.rawMetricsJson.screenshotPath) strengths.push("Screenshot capturado para revisão visual");

  const penalty = problems.length * 8 + ((snapshot.loadTimeMs ?? 0) > 3000 ? 10 : 0);
  const score = Math.max(10, Math.min(95, 82 - penalty + strengths.length * 4));

  return {
    websiteQualityScore: score,
    commercialOpportunity: score < 55 ? "redesign" : snapshot.hasCta && snapshot.hasWhatsapp ? "maintenance" : "seo_local",
    problems,
    strengths,
    salesAngle: problems.length
      ? "Mostrar melhorias objetivas de clareza, conversão, presença local e apresentação visual a partir dos problemas detectados."
      : "Apresentar manutenção e otimização local como forma de aproveitar uma base digital já existente.",
    confidence: 0.72
  };
}

async function callOpenAi(input: Record<string, unknown>, screenshotBase64?: string): Promise<WebsiteAiReview | undefined> {
  if (!process.env.OPENAI_API_KEY || process.env.SCRAPER_AI_ANALYZE_WEBSITE === "false") return undefined;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const userContent = screenshotBase64
    ? [
        { type: "text", text: JSON.stringify(input) },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${screenshotBase64}`,
            detail: "low"
          }
        }
      ]
    : JSON.stringify(input);

  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Analise presença digital local apenas de site institucional/pessoal próprio do lead. Priorize HTML/métricas; imagem é só conferência visual quando enviada. Se a página parecer agregador, diretório, Yelp, ORCID/Lattes, notícia, perfil de terceiros ou listagem de telefone/endereço, trate como sem valor comercial de site próprio. Retorne apenas JSON válido, curto e objetivo."
      },
      { role: "user", content: userContent as any }
    ] as any
  });
  const content = response.choices[0]?.message.content;
  if (!content) return undefined;
  return websiteReviewSchema.parse(JSON.parse(content));
}

function updateDigitalPresenceFromWebsite(lead: Lead, snapshot: WebsiteSnapshot, review: WebsiteAiReview): DigitalPresence {
  const current = Array.from(store.digitalPresence.values()).find((presence) => presence.leadId === lead.id);
  const now = new Date().toISOString();
  const presence: DigitalPresence = {
    id: current?.id ?? store.nextId("digitalPresence"),
    leadId: lead.id,
    hasWebsite: Boolean(lead.websiteUrl),
    websiteUrl: lead.websiteUrl,
    websitePlatform: snapshot.platform,
    hasInstagram: Boolean(lead.instagramUrl),
    hasFacebook: Boolean(lead.facebookUrl),
    hasLinkedin: Boolean(lead.linkedinUrl),
    hasGoogleMaps: Boolean(lead.googleMapsUrl),
    hasWhatsapp: Boolean(lead.whatsapp || snapshot.hasWhatsapp),
    hasLinktree: JSON.stringify(lead.rawDataJson ?? {}).toLowerCase().includes("linktree"),
    hasOnlySocialMedia: !lead.websiteUrl && Boolean(lead.instagramUrl || lead.facebookUrl || lead.linkedinUrl),
    websiteHttpStatus: snapshot.httpStatus,
    websiteLoadTimeMs: snapshot.loadTimeMs,
    websiteHasSsl: snapshot.hasSsl,
    websiteIsMobileFriendly: Boolean(snapshot.rawMetricsJson.hasViewport),
    websiteHasCta: snapshot.hasCta,
    websiteHasWhatsappCta: snapshot.hasWhatsapp,
    websiteHasContactForm: snapshot.hasContactForm,
    websiteHasSeoTitle: Boolean(snapshot.title),
    websiteHasMetaDescription: Boolean(snapshot.metaDescription),
    websiteDetectedIssuesJson: snapshot.detectedIssuesJson,
    websiteQualityScore: review.websiteQualityScore,
    socialPresenceScore: current?.socialPresenceScore,
    createdAt: current?.createdAt ?? now,
    updatedAt: now
  };
  store.digitalPresence.set(presence.id, presence);
  return presence;
}

function updateLeadContactsFromWebsite(
  lead: Lead,
  contacts: { emails: string[]; phones: string[]; whatsappNumbers: string[] }
): Lead {
  const updatedLead: Lead = {
    ...lead,
    email: lead.email ?? contacts.emails[0],
    phone: lead.phone ?? contacts.phones[0],
    whatsapp: lead.whatsapp ?? contacts.whatsappNumbers[0] ?? contacts.phones[0],
    updatedAt: new Date().toISOString(),
    rawDataJson: {
      ...(lead.rawDataJson ?? {}),
      websiteContacts: contacts
    }
  };
  store.leads.set(updatedLead.id, updatedLead);
  return updatedLead;
}

export async function analyzeWebsite(
  lead: Lead,
  signalOrOptions?: AbortSignal | WebsiteAnalysisOptions
): Promise<WebsiteSnapshot> {
  const options = normalizeAnalyzeWebsiteOptions(signalOrOptions);
  const { signal, browser, page } = options;
  throwIfAborted(signal);
  if (!lead.websiteUrl) {
    throw new Error("O lead não possui URL de site");
  }

  let html = "";
  let status: number | undefined;
  let screenshot: { path?: string; base64?: string; error?: string } = {};
  let renderedMetrics: Record<string, unknown> = {};

  const startedAt = Date.now();
  const renderedPage = page ?? await ensurePage(browser);
  const ownsPage = Boolean(renderedPage) && !page;

  if (renderedPage) {
    try {
      throwIfAborted(signal);
      const response = await renderedPage.goto(lead.websiteUrl, { waitUntil: "networkidle", timeout: 18000 }).catch(async () => {
        throwIfAborted(signal);
        return renderedPage.goto(lead.websiteUrl!, { waitUntil: "domcontentloaded", timeout: 15000 });
      });
      throwIfAborted(signal);
      await renderedPage.waitForTimeout(Number(process.env.SCRAPER_STEP_DELAY_MS ?? 900));
      throwIfAborted(signal);
      status = response?.status();
      html = await renderedPage.content();
      options.logger?.writeHtmlArtifact("website-analysis-page", html, {
        url: lead.websiteUrl,
        mode: "browser",
        leadId: lead.id,
        leadName: options.leadName
      });
      renderedMetrics = await collectVisualMetrics(renderedPage).catch(() => ({}));
    } finally {
      if (ownsPage) {
        await renderedPage.close().catch(() => undefined);
      }
    }
  }

  if (!html) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const stopFetch = () => controller.abort();
    signal?.addEventListener("abort", stopFetch, { once: true });
    try {
      throwIfAborted(signal);
      const response = await fetch(lead.websiteUrl, {
        signal: controller.signal,
        headers: {
          "user-agent": "LeadRadar/0.1 (+human-reviewed internal prospecting)"
        }
      });
      throwIfAborted(signal);
      status = response.status;
      html = await response.text();
      options.logger?.writeHtmlArtifact("website-analysis-page", html, {
        url: lead.websiteUrl,
        mode: "fetch",
        httpStatus: response.status,
        leadId: lead.id,
        leadName: options.leadName
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", stopFetch);
    }
    // Screenshot is captured later only after validating that this is not an aggregator/intermediate page.
  }

  throwIfAborted(signal);
  const loadTimeMs = Date.now() - startedAt;
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const bodyText = compactText($("body").text(), 1600);
  const title = compactText($("title").first().text(), 180);
  const metaDescription = compactText($('meta[name="description"]').attr("content") ?? "", 260);
  const h1 = compactText($("h1").first().text(), 180);
  const headingsJson = $("h1, h2, h3")
    .slice(0, 12)
    .map((_, element) => compactText($(element).text(), 100))
    .get()
    .filter(Boolean);
  const links = $("a")
    .slice(0, 40)
    .map((_, element) => ({
      text: compactText($(element).text(), 80),
      href: $(element).attr("href") ?? ""
    }))
    .get();
  throwIfAborted(signal);
  const combined = `${bodyText} ${links.map((link) => `${link.text} ${link.href}`).join(" ")}`;
  const contacts = extractContactDetails(combined);
  const hasWhatsapp = /wa\.me|api\.whatsapp|whatsapp/i.test(combined);
  const hasContactForm = $("form").length > 0 || hasAny(combined, ["formulario", "formulário", "envie sua mensagem"]);
  const hasCta = hasAny(combined, ["agende", "fale conosco", "entre em contato", "chamar no whatsapp", "solicite", "marque"]);
  const hasLocation = hasAny(combined, ["endereco", "endereço", "londrina", "cambe", "maringa", "presencial"]);
  const hasServices = hasAny(combined, ["servicos", "serviços", "atendimento", "terapia", "consulta", "especialidades"]);
  const hasTestimonials = hasAny(combined, ["depoimento", "avaliacao", "avaliação", "testemunho"]);
  const invalidVisualTarget = isIntermediateOrBlockedPage(lead.websiteUrl, `${title} ${h1}`, bodyText);

  if (!invalidVisualTarget && process.env.SCRAPER_CAPTURE_SCREENSHOT !== "false") {
    screenshot = renderedPage && !renderedPage.isClosed()
      ? await captureScreenshotFromPage(renderedPage, lead.id)
      : await captureWebsiteScreenshot(lead.websiteUrl, lead.id, signal);
  }

  const baseSnapshot = {
    url: lead.websiteUrl,
    httpStatus: status,
    title,
    metaDescription,
    h1,
    headingsJson,
    textSummary: compactText(bodyText, 500),
    textSample: compactText(bodyText, 900),
    platform: detectPlatform(html),
    hasSsl: lead.websiteUrl.startsWith("https://"),
    loadTimeMs,
    hasWhatsapp,
    hasContactForm,
    hasCta,
    hasLocation,
    hasServices,
    hasTestimonials,
    detectedIssuesJson: [] as string[],
    rawMetricsJson: {
      linkCount: links.length,
      headingCount: headingsJson.length,
      hasViewport: Boolean($('meta[name="viewport"]').attr("content")),
      htmlBytes: html.length,
      screenshotPath: screenshot.path,
      screenshotError: screenshot.error,
      screenshotSentToAi: Boolean(screenshot.base64),
      contacts,
      invalidVisualTarget,
      analysisMode: invalidVisualTarget ? "html_only_skipped_visual" : "html_primary_visual_optional",
      ...renderedMetrics
    }
  };
  baseSnapshot.detectedIssuesJson = buildDetectedIssues(baseSnapshot);

  const hash = inputHash(baseSnapshot);
  const now = new Date().toISOString();
  const snapshot: WebsiteSnapshot = {
    id: store.nextId("websiteSnapshot"),
    leadId: lead.id,
    ...baseSnapshot,
    snapshotHash: hash,
    createdAt: now
  };

  const aiInput = {
    lead: {
      businessName: lead.businessName,
      niche: lead.niche,
      city: lead.city,
      state: lead.state
    },
    website: {
      url: snapshot.url,
      httpStatus: snapshot.httpStatus,
      hasSsl: snapshot.hasSsl,
      loadTimeMs: snapshot.loadTimeMs,
      title: snapshot.title,
      metaDescription: snapshot.metaDescription,
      h1: snapshot.h1,
      headings: snapshot.headingsJson.slice(0, 8),
      detectedPlatform: snapshot.platform,
      hasWhatsappCta: snapshot.hasWhatsapp,
      hasContactForm: snapshot.hasContactForm,
      hasClearServices: snapshot.hasServices,
      hasLocation: snapshot.hasLocation,
      hasTestimonials: snapshot.hasTestimonials,
      textSample: compactText(snapshot.textSample ?? "", 450),
      screenshotCaptured: Boolean(snapshot.rawMetricsJson.screenshotPath),
      visualMetrics: invalidVisualTarget ? undefined : renderedMetrics,
      invalidVisualTarget
    }
  };
  const aiHash = inputHash(aiInput);
  const cacheKey = ["lead", lead.id, "website_review", model, promptVersion, aiHash].join(":");
  const cached = store.aiCache.get(cacheKey)?.outputJson;
  appendTrace(options.logger, {
    kind: "ai_request",
    title: "IA analisando site",
    leadName: options.leadName ?? lead.businessName,
    url: lead.websiteUrl,
    payload: {
      ...aiInput,
      website: {
        ...aiInput.website,
        screenshotBase64Included: Boolean(screenshot.base64)
      }
    }
  });
  throwIfAborted(signal);
  const generatedReview = invalidVisualTarget ? undefined : cached ?? (await callOpenAi(aiInput, screenshot.base64));
  const reviewSource = invalidVisualTarget ? "skipped_invalid_or_aggregator_page" : cached ? "cache" : generatedReview ? "openai" : "fallback";
  const review = websiteReviewSchema.parse(generatedReview ?? fallbackWebsiteReview(snapshot));
  throwIfAborted(signal);
  appendTrace(options.logger, {
    kind: "ai_response",
    title: "Resposta da IA sobre o site",
    leadName: options.leadName ?? lead.businessName,
    url: lead.websiteUrl,
    detail: reviewSource,
    response: review
  });
  snapshot.aiReview = review;

  store.websiteSnapshots.set(snapshot.id, snapshot);
  store.aiCache.set(cacheKey, {
    id: store.nextId("aiCache"),
    entityType: "lead",
    entityId: String(lead.id),
    analysisType: "website_review",
    model,
    promptVersion,
    inputHash: aiHash,
    inputJson: aiInput,
    outputJson: review,
    createdAt: now
  });
  const reviewId = store.nextId("aiReview");
  store.aiReviews.set(reviewId, {
    id: reviewId,
    leadId: lead.id,
    analysisType: "website_review",
    model,
    promptVersion,
    inputHash: aiHash,
    inputJson: aiInput,
    outputJson: review,
    summary: review.salesAngle,
    createdAt: now
  });

  const updatedLead = invalidVisualTarget
    ? clearInvalidWebsiteFromLead(lead, "website_analysis_invalid_or_aggregator_page")
    : updateLeadContactsFromWebsite(lead, contacts);
  updateDigitalPresenceFromWebsite(updatedLead, snapshot, review);
  createOrUpdateObjectiveScore(updatedLead);
  options.logger?.writeJsonArtifact(`website-snapshot-lead-${lead.id}`, snapshot, {
    leadId: lead.id,
    leadName: options.leadName ?? lead.businessName
  });

  return snapshot;
}
