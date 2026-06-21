import * as cheerio from "cheerio";
import OpenAI from "openai";
import type { Browser, Page } from "playwright";
import { z } from "zod";
import { store } from "../../shared/store/memory-store.js";
import type { DigitalPresence, Lead, SocialAiReview, SocialSnapshot } from "../../shared/types.js";
import { inputHash } from "../../shared/utils/hash.js";
import { StructuredRunLogger } from "../../shared/utils/structured-run-logger.js";
import { createOrUpdateObjectiveScore } from "../scoring/scoring.service.js";

const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const promptVersion = "social-review-2026-06-20";

const socialReviewSchema = z.object({
  socialPresenceScore: z.number().int().min(0).max(100),
  dependsOnlyOnSocialMedia: z.boolean(),
  opportunity: z.enum(["none", "landing_page", "institutional_site", "seo_local", "digital_presence_organization"]),
  problems: z.array(z.string()),
  strengths: z.array(z.string()),
  salesAngle: z.string(),
  confidence: z.number().min(0).max(1)
});

interface SocialAnalysisOptions {
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
    module: "social_analysis",
    ...event
  });
}

function compactText(value: string, maxLength = 500): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function detectPlatform(url: string): SocialSnapshot["platform"] {
  const lower = url.toLowerCase();
  if (lower.includes("instagram.com")) return "instagram";
  if (lower.includes("facebook.com") || lower.includes("fb.com")) return "facebook";
  if (lower.includes("linkedin.com")) return "linkedin";
  if (lower.includes("google.com/maps") || lower.includes("maps.app.goo.gl")) return "google_maps";
  return "unknown";
}

function socialUrlForLead(lead: Lead): string | undefined {
  return lead.instagramUrl ?? lead.facebookUrl ?? lead.linkedinUrl ?? lead.googleMapsUrl;
}

async function ensurePage(browser?: Browser): Promise<Page | undefined> {
  if (!browser) return undefined;
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36 LeadRadar/0.1"
  });
  page.setDefaultTimeout(15000);
  return page;
}

function fallbackSocialReview(lead: Lead, snapshot: SocialSnapshot): SocialAiReview {
  const problems: string[] = [];
  const strengths: string[] = [];

  if (!lead.websiteUrl && snapshot.platform !== "unknown") problems.push("Presença própria fora da rede social não detectada");
  if (!snapshot.externalLink) problems.push("Link externo não detectado no perfil");
  if (!snapshot.hasWhatsapp && !lead.whatsapp) problems.push("WhatsApp público não detectado no perfil social");
  if (snapshot.bioText) strengths.push("Bio pública detectada");
  if (snapshot.hasWhatsapp || lead.whatsapp) strengths.push("Possui canal direto de contato");
  if (snapshot.platform !== "unknown") strengths.push(`Perfil público em ${snapshot.platform}`);

  const score = Math.max(20, Math.min(90, 48 + strengths.length * 12 - problems.length * 8));

  return {
    socialPresenceScore: score,
    dependsOnlyOnSocialMedia: !lead.websiteUrl && snapshot.platform !== "unknown",
    opportunity: !lead.websiteUrl ? "landing_page" : "digital_presence_organization",
    problems,
    strengths,
    salesAngle: !lead.websiteUrl
      ? "Transformar a presença social em uma página profissional centralizada com serviços, autoridade e contato."
      : "Organizar a presença digital para conectar melhor rede social, site e canal de contato.",
    confidence: 0.7
  };
}

async function callOpenAi(input: Record<string, unknown>): Promise<SocialAiReview | undefined> {
  if (!process.env.OPENAI_API_KEY) return undefined;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você é um analista comercial de presença digital local. Use apenas o JSON recebido. Retorne apenas JSON válido."
      },
      { role: "user", content: JSON.stringify(input) }
    ]
  });
  const content = response.choices[0]?.message.content;
  if (!content) return undefined;
  return socialReviewSchema.parse(JSON.parse(content));
}

async function fetchPublicProfileSummary(
  url: string,
  options?: SocialAnalysisOptions
): Promise<{ bioText?: string; externalLink?: string; raw: Record<string, unknown> }> {
  const renderedPage = options?.page ?? await ensurePage(options?.browser);
  const ownsPage = Boolean(renderedPage) && !options?.page;
  if (renderedPage) {
    try {
      const response = await renderedPage.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await renderedPage.waitForTimeout(Number(process.env.SCRAPER_STEP_DELAY_MS ?? 900));
      const html = await renderedPage.content();
      const $ = cheerio.load(html);
      const description = compactText(
        $('meta[name="description"]').attr("content") ??
          $('meta[property="og:description"]').attr("content") ??
          $("title").first().text(),
        500
      );
      const externalLink = $("a")
        .map((_, element) => $(element).attr("href") ?? "")
        .get()
        .find((href) => href.startsWith("http") && !href.includes(new URL(url).hostname));
      options?.logger?.writeHtmlArtifact("social-profile-page", html, {
        url,
        mode: "browser",
        leadName: options?.leadName
      });

      return {
        bioText: description,
        externalLink,
        raw: {
          httpStatus: response?.status(),
          accessibleWithoutLogin: true,
          htmlBytes: html.length,
          title: $("title").first().text()
        }
      };
    } catch (error) {
      return {
        raw: {
          fetchError: error instanceof Error ? error.message : "Erro desconhecido ao buscar perfil"
        }
      };
    } finally {
      if (ownsPage) {
        await renderedPage.close().catch(() => undefined);
      }
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "LeadRadar/0.1 (+human-reviewed internal prospecting)"
      }
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const description = compactText(
      $('meta[name="description"]').attr("content") ??
        $('meta[property="og:description"]').attr("content") ??
        $("title").first().text(),
      500
    );
    const externalLink = $("a")
      .map((_, element) => $(element).attr("href") ?? "")
      .get()
      .find((href) => href.startsWith("http") && !href.includes(new URL(url).hostname));
    options?.logger?.writeHtmlArtifact("social-profile-page", html, {
      url,
      mode: "fetch",
      httpStatus: response.status,
      leadName: options?.leadName
    });

    return {
      bioText: description,
      externalLink,
      raw: {
        httpStatus: response.status,
        accessibleWithoutLogin: response.ok,
        htmlBytes: html.length
      }
    };
  } catch (error) {
    return {
      raw: {
        fetchError: error instanceof Error ? error.message : "Erro desconhecido ao buscar perfil"
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function updateDigitalPresenceFromSocial(lead: Lead, snapshot: SocialSnapshot, review: SocialAiReview): DigitalPresence {
  const current = Array.from(store.digitalPresence.values()).find((presence) => presence.leadId === lead.id);
  const now = new Date().toISOString();
  const presence: DigitalPresence = {
    id: current?.id ?? store.nextId("digitalPresence"),
    leadId: lead.id,
    hasWebsite: Boolean(lead.websiteUrl),
    websiteUrl: lead.websiteUrl,
    websitePlatform: current?.websitePlatform,
    hasInstagram: Boolean(lead.instagramUrl) || snapshot.platform === "instagram",
    hasFacebook: Boolean(lead.facebookUrl) || snapshot.platform === "facebook",
    hasLinkedin: Boolean(lead.linkedinUrl) || snapshot.platform === "linkedin",
    hasGoogleMaps: Boolean(lead.googleMapsUrl) || snapshot.platform === "google_maps",
    hasWhatsapp: Boolean(lead.whatsapp || snapshot.hasWhatsapp),
    hasLinktree: Boolean(snapshot.externalLink?.toLowerCase().includes("linktree")),
    hasOnlySocialMedia: !lead.websiteUrl && snapshot.platform !== "unknown",
    websiteHttpStatus: current?.websiteHttpStatus,
    websiteLoadTimeMs: current?.websiteLoadTimeMs,
    websiteHasSsl: current?.websiteHasSsl,
    websiteIsMobileFriendly: current?.websiteIsMobileFriendly,
    websiteHasCta: current?.websiteHasCta,
    websiteHasWhatsappCta: current?.websiteHasWhatsappCta,
    websiteHasContactForm: current?.websiteHasContactForm,
    websiteHasSeoTitle: current?.websiteHasSeoTitle,
    websiteHasMetaDescription: current?.websiteHasMetaDescription,
    websiteDetectedIssuesJson: current?.websiteDetectedIssuesJson ?? [],
    websiteQualityScore: current?.websiteQualityScore,
    socialPresenceScore: review.socialPresenceScore,
    createdAt: current?.createdAt ?? now,
    updatedAt: now
  };
  store.digitalPresence.set(presence.id, presence);
  return presence;
}

function updateLeadFromSocial(lead: Lead, snapshot: SocialSnapshot): Lead {
  const updatedLead: Lead = {
    ...lead,
    websiteUrl: lead.websiteUrl ?? (snapshot.hasWebsiteLink ? snapshot.externalLink : undefined),
    updatedAt: new Date().toISOString(),
    rawDataJson: {
      ...(lead.rawDataJson ?? {}),
      socialProfile: {
        platform: snapshot.platform,
        profileUrl: snapshot.profileUrl,
        externalLink: snapshot.externalLink
      }
    }
  };
  store.leads.set(updatedLead.id, updatedLead);
  return updatedLead;
}

export async function analyzeSocial(lead: Lead, options?: SocialAnalysisOptions): Promise<SocialSnapshot> {
  const profileUrl = socialUrlForLead(lead);
  if (!profileUrl) {
    throw new Error("O lead não possui URL de perfil social");
  }

  const platform = detectPlatform(profileUrl);
  const fetched = await fetchPublicProfileSummary(profileUrl, options);
  appendTrace(options?.logger, {
    kind: "result",
    title: "Perfil social carregado",
    leadName: options?.leadName ?? lead.businessName,
    url: profileUrl,
    response: fetched.raw
  });
  const text = `${fetched.bioText ?? ""} ${fetched.externalLink ?? ""} ${lead.whatsapp ?? ""}`;
  const hasWhatsapp = /wa\.me|api\.whatsapp|whatsapp|\+55|\d{10,}/i.test(text);
  const hasWebsiteLink = Boolean(fetched.externalLink && !fetched.externalLink.toLowerCase().includes("linktree"));
  const contentSignalsJson = [
    fetched.bioText ? "bio_publica_detectada" : undefined,
    hasWhatsapp ? "whatsapp_detectado" : undefined,
    hasWebsiteLink ? "link_externo_detectado" : undefined,
    !lead.websiteUrl ? "sem_site_proprio" : undefined
  ].filter((value): value is string => Boolean(value));

  const baseSnapshot = {
    platform,
    profileUrl,
    bioText: fetched.bioText,
    externalLink: fetched.externalLink,
    hasWhatsapp,
    hasWebsiteLink,
    estimatedPostCount: undefined,
    lastActivitySignal: "unknown" as const,
    contentSignalsJson,
    rawMetricsJson: fetched.raw
  };
  const hash = inputHash(baseSnapshot);
  const now = new Date().toISOString();
  const snapshot: SocialSnapshot = {
    id: store.nextId("socialSnapshot"),
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
      hasWebsite: Boolean(lead.websiteUrl)
    },
    socialPresence: {
      platform: snapshot.platform,
      profileUrl: snapshot.profileUrl,
      bioText: snapshot.bioText,
      externalLink: snapshot.externalLink,
      hasWhatsapp: snapshot.hasWhatsapp,
      hasWebsiteLink: snapshot.hasWebsiteLink,
      estimatedPostCount: snapshot.estimatedPostCount,
      lastActivitySignal: snapshot.lastActivitySignal,
      contentSignals: snapshot.contentSignalsJson
    }
  };
  const aiHash = inputHash(aiInput);
  const cacheKey = ["lead", lead.id, "social_review", model, promptVersion, aiHash].join(":");
  const cached = store.aiCache.get(cacheKey)?.outputJson;
  appendTrace(options?.logger, {
    kind: "ai_request",
    title: "IA analisando presenca social",
    leadName: options?.leadName ?? lead.businessName,
    url: profileUrl,
    payload: aiInput
  });
  const generatedReview = cached ?? (await callOpenAi(aiInput));
  const reviewSource = cached ? "cache" : generatedReview ? "openai" : "fallback";
  const review = socialReviewSchema.parse(generatedReview ?? fallbackSocialReview(lead, snapshot));
  appendTrace(options?.logger, {
    kind: "ai_response",
    title: "Resposta da IA sobre presenca social",
    leadName: options?.leadName ?? lead.businessName,
    url: profileUrl,
    detail: reviewSource,
    response: review
  });
  snapshot.aiReview = review;

  store.socialSnapshots.set(snapshot.id, snapshot);
  store.aiCache.set(cacheKey, {
    id: store.nextId("aiCache"),
    entityType: "lead",
    entityId: String(lead.id),
    analysisType: "social_review",
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
    analysisType: "social_review",
    model,
    promptVersion,
    inputHash: aiHash,
    inputJson: aiInput,
    outputJson: review,
    summary: review.salesAngle,
    createdAt: now
  });

  const updatedLead = updateLeadFromSocial(lead, snapshot);
  updateDigitalPresenceFromSocial(updatedLead, snapshot, review);
  createOrUpdateObjectiveScore(updatedLead);
  options?.logger?.writeJsonArtifact(`social-snapshot-lead-${lead.id}`, snapshot, {
    leadId: lead.id,
    leadName: options?.leadName ?? lead.businessName
  });

  return snapshot;
}
