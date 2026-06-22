import * as cheerio from "cheerio";
import OpenAI from "openai";
import type { Browser, Page } from "playwright";
import { z } from "zod";
import { store } from "../../shared/store/memory-store.js";
import type { Campaign, DiscoveryCandidate, Lead } from "../../shared/types.js";
import { inputHash } from "../../shared/utils/hash.js";
import { extractContacts as extractStructuredContacts } from "../../shared/utils/contact-extraction.js";
import { StructuredRunLogger } from "../../shared/utils/structured-run-logger.js";
import { createOrUpdateObjectiveScore } from "../scoring/scoring.service.js";
import { analyzeSocial } from "../socialAnalysis/social-analysis.service.js";
import { analyzeWebsite } from "../websiteAnalysis/website-analysis.service.js";

const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const promptVersion = "professional-discovery-2026-06-22-nano-site-instagram-search-v2";

const DEFAULT_SEARCH_LIMIT = 12;
const MAX_AGGREGATOR_PAGES = Number(process.env.SCRAPER_MAX_AGGREGATORS ?? 4);
const MAX_NAMES_PER_AGGREGATOR = Number(process.env.SCRAPER_MAX_NAMES_PER_AGGREGATOR ?? 6);
const MAX_PROFESSIONALS_PER_CAMPAIGN = Number(process.env.SCRAPER_MAX_PROFESSIONALS ?? 12);
const MAX_SEARCH_RESULTS = Number(process.env.SCRAPER_MAX_SEARCH_RESULTS ?? 4);
const MAX_INSPECTED_RESULTS_PER_PROFESSIONAL = Number(process.env.SCRAPER_MAX_INSPECTED_RESULTS ?? 5);

type DiscoverySearchLevel = "nano" | "quick" | "medium" | "deep";

interface DiscoveryProfile {
  level: DiscoverySearchLevel;
  targetFinalLeads: number;
  initialResultsPerQuery: number;
  initialSearchQueryLimit: number;
  maxAggregatorPages: number;
  maxNamesPerAggregator: number;
  maxProfessionalsToReview: number;
  searchResultsPerProfessional: number;
  inspectedResultsPerProfessional: number;
  maxQueriesPerProfessional: number;
  maxRuntimeMs: number;
  maxReviewedWithoutLead: number;
  noLeadStallMs: number;
}

const SHARED_MEDIUM_FEATURES = {
  initialResultsPerQuery: 24,
  initialSearchQueryLimit: 6,
  maxAggregatorPages: 8,
  maxNamesPerAggregator: 12,
  searchResultsPerProfessional: 4,
  inspectedResultsPerProfessional: 3,
  maxQueriesPerProfessional: 4
};

const DISCOVERY_PROFILES: Record<DiscoverySearchLevel, DiscoveryProfile> = {
  nano: {
    level: "nano",
    targetFinalLeads: 5,
    ...SHARED_MEDIUM_FEATURES,
    maxProfessionalsToReview: 22,
    maxRuntimeMs: 12 * 60 * 1000,
    maxReviewedWithoutLead: 14,
    noLeadStallMs: 7 * 60 * 1000
  },
  quick: {
    level: "quick",
    targetFinalLeads: 10,
    ...SHARED_MEDIUM_FEATURES,
    maxProfessionalsToReview: 45,
    maxRuntimeMs: 20 * 60 * 1000,
    maxReviewedWithoutLead: 30,
    noLeadStallMs: 12 * 60 * 1000
  },
  medium: {
    level: "medium",
    targetFinalLeads: 30,
    ...SHARED_MEDIUM_FEATURES,
    maxProfessionalsToReview: 140,
    maxRuntimeMs: 60 * 60 * 1000,
    maxReviewedWithoutLead: 70,
    noLeadStallMs: 25 * 60 * 1000
  },
  deep: {
    level: "deep",
    targetFinalLeads: 60,
    ...SHARED_MEDIUM_FEATURES,
    maxProfessionalsToReview: 300,
    maxRuntimeMs: 150 * 60 * 1000,
    maxReviewedWithoutLead: 140,
    noLeadStallMs: 45 * 60 * 1000
  }
};

function resolveDiscoveryProfile(level: DiscoverySearchLevel = "quick", targetFinalLeads?: number): DiscoveryProfile {
  const base = DISCOVERY_PROFILES[level] ?? DISCOVERY_PROFILES.quick;
  const target = targetFinalLeads && targetFinalLeads > 0 ? targetFinalLeads : base.targetFinalLeads;
  return {
    ...base,
    targetFinalLeads: Math.min(Math.max(target, 1), 60)
  };
}

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
  searchLevel?: DiscoverySearchLevel;
  targetFinalLeads?: number;
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

type SourceClassificationType = "aggregator" | "direct_professional" | "social" | "noise";

interface SourceClassification {
  type: SourceClassificationType;
  confidence: number;
  reason?: string;
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
  profileUrl?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  googleMapsUrl?: string;
  address?: string;
  professionalRegistry?: string;
  emails?: string[];
  phones?: string[];
  whatsappNumbers?: string[];
  confidence?: number;
  extractionMethod?: "ai" | "card" | "heuristic" | "direct";
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
  hasDirectContact: boolean;
  isReadyForLead: boolean;
  leadQuality: "ready_for_outreach" | "enrich_more" | "weak_candidate";
  reason: string;
  sourceUrl: string;
  sourceTitle: string;
  profileUrl?: string;
  address?: string;
  professionalRegistry?: string;
  googleMapsUrl?: string;
}

const professionalsSchema = z.object({
  professionals: z.array(z.object({
    name: z.string(),
    evidence: z.string().optional(),
    profileUrl: z.string().optional(),
    websiteUrl: z.string().optional(),
    instagramUrl: z.string().optional(),
    googleMapsUrl: z.string().optional(),
    address: z.string().optional(),
    professionalRegistry: z.string().optional(),
    emails: z.array(z.string()).default([]),
    phones: z.array(z.string()).default([]),
    whatsappNumbers: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).optional()
  }))
});

const instagramLinkSchema = z.object({
  externalUrl: z.string().optional(),
  isOwnWebsite: z.boolean(),
  reason: z.string().optional().default("")
});

const professionalResultReviewSchema = z.object({
  isProfessionalMatch: z.boolean(),
  resultType: z.enum(["website", "instagram", "directory", "social", "other"]),
  websiteUrl: z.string().optional(),
  instagramUrl: z.string().optional(),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  whatsappNumbers: z.array(z.string()).default([]),
  address: z.string().optional(),
  professionalRegistry: z.string().optional(),
  googleMapsUrl: z.string().optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional().default("")
});

const sourceClassificationSchema = z.object({
  items: z.array(z.object({
    index: z.number().int().min(0),
    type: z.enum(["aggregator", "direct_professional", "social", "noise"]),
    confidence: z.number().min(0).max(1),
    reason: z.string().optional()
  }))
});

const finalLeadDecisionSchema = z.object({
  accept: z.boolean(),
  instagramIsPersonal: z.boolean(),
  hasValidPhone: z.boolean(),
  identityConfidence: z.number().min(0).max(1),
  contactConfidence: z.number().min(0).max(1),
  reason: z.string().optional().default("")
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

const DIRECTORY_AGGREGATOR_TERMS = [
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
  "eguias",
  "e-guias",
  "guiamais",
  "agenda.app",
  "melhores.com",
  "mapadatcs",
  "medicosbrasil",
  "consultas medicas",
  "cadastro medico",
  "google.com/maps",
  "listamais",
  "empresafone",
  "guia telefone",
  "guiatelefone",
  "achei o profissional",
  "acheioprofissional",
  "brfirmas",
  "consultarcnpj",
  "cnpj.biz",
  "empresascnpj",
  "cadastroempresa",
  "telepesquisa",
  "yelp",
  "todosnegocios",
  "todos negocios",
  "guiafacil",
  "guia facil",
  "cylex",
  "guias locais",
  "guialocal",
  "hotfrog",
  "brownbook",
  "telefone comercial",
  "lista telefonica",
  "lista telefônica"
];

const HARD_SKIP_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "youtube.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "pinterest.com",
  "about.meta.com",
  "meta.com",
  "atosoficiais.com.br",
  "qualotelefone.com",
  "escavador.com",
  "jusbrasil.com.br",
  "orcid.org",
  "lattes.cnpq.br",
  "cnpq.br",
  "globo.com",
  "g1.globo.com",
  "ge.globo.com",
  "uol.com.br",
  "terra.com.br",
  "metropoles.com",
  "folha.uol.com.br",
  "estadao.com.br"
];

function isAggregatorUrl(url: string, text = ""): boolean {
  const haystack = normalize(`${hostOf(url)} ${url} ${text}`);
  if (isSocialUrl(url) || isHardSkipUrl(url)) return false;
  return DIRECTORY_AGGREGATOR_TERMS.some((term) => haystack.includes(term));
}

function isSocialUrl(url: string): boolean {
  const host = hostOf(url);
  return ["instagram.com", "facebook.com", "linkedin.com", "youtube.com", "tiktok.com", "x.com", "twitter.com"].some((domain) => host.endsWith(domain));
}

function isHardSkipUrl(url: string): boolean {
  const host = hostOf(url);
  if (host.endsWith("instagram.com")) return !isInstagramProfileUrl(url);
  return HARD_SKIP_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function shouldHardSkipSearchResult(result: SearchResult | RawSearchCandidate): boolean {
  const evidence = normalize(`${result.title} ${result.snippet} ${result.url}`);
  if (isHardSkipUrl(result.url)) return true;
  if (/pol[ií]tica de privacidade|termos de uso|login|entrar|cadastro|an[uú]ncio|vaga de emprego|curr[ií]culo/.test(evidence)) return true;
  return false;
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
    "tinyurl.com",
    "about.meta.com",
    "meta.com",
    "l.instagram.com"
  ].some((domain) => host.endsWith(domain) || lower.includes(domain));
}

const BLOCKED_OWN_WEBSITE_HOSTS = [
  "about.meta.com",
  "meta.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "hotmart.com",
  "kiwify.com.br",
  "eduzz.com",
  "monetizze.com.br",
  "doctoralia.com.br",
  "mundopsicologos.com",
  "mundopsicologos.com.br",
  "centralpsicologia.com.br",
  "psicologiaviva.com.br",
  "zenklub.com.br",
  "boaconsulta.com",
  "solutudo.com.br",
  "eguias.net",
  "agenda.app.br",
  "agenda.app",
  "saude.melhores.com",
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

function isBlockedOwnWebsiteHost(url: string): boolean {
  const host = hostOf(url);
  return BLOCKED_OWN_WEBSITE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

type WebsiteCandidateKind =
  | "own_professional_site"
  | "directory_profile"
  | "social_profile"
  | "academic_profile"
  | "news_article"
  | "business_listing"
  | "clinic_or_company"
  | "linkhub"
  | "unrelated"
  | "unknown";

interface OwnWebsiteCandidateDecision {
  ok: boolean;
  kind: WebsiteCandidateKind;
  score: number;
  reason: string;
}

const ACADEMIC_PROFILE_HOSTS = ["orcid.org", "lattes.cnpq.br", "cnpq.br", "researchgate.net", "scholar.google.com"];
const NEWS_ARTICLE_HOSTS = [
  "globo.com", "g1.globo.com", "ge.globo.com", "uol.com.br", "terra.com.br", "metropoles.com",
  "folha.uol.com.br", "estadao.com.br", "gazetadopovo.com.br", "cnnbrasil.com.br", "r7.com"
];

function hostMatchesAny(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function compactAlphaNumeric(value: string): string {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function classifyWebsiteCandidateUrl(url: string | undefined, text = ""): WebsiteCandidateKind {
  if (!url || !/^https?:\/\//i.test(url)) return "unrelated";
  const host = hostOf(url);
  const haystack = normalize(`${host} ${url} ${text}`);
  if (!host) return "unrelated";
  if (isLinkHubOrContactUrl(url)) return "linkhub";
  if (isSocialUrl(url)) return "social_profile";
  if (hostMatchesAny(host, ACADEMIC_PROFILE_HOSTS) || /orcid|lattes|curriculo lattes|currículo lattes|researchgate|google scholar/.test(haystack)) {
    return "academic_profile";
  }
  if (hostMatchesAny(host, NEWS_ARTICLE_HOSTS) || /noticia|notícia|jornal|reportagem|g1 |ge\.globo|morre |ex-jogador|campeonato|partida|placar/.test(haystack)) {
    return "news_article";
  }
  if (isBlockedOwnWebsiteHost(url) || isAggregatorUrl(url, text)) {
    if (/\/biz\/|\/empresa\/|\/local\/|\/pt\/[^/]*(?:psicologo|psicologa)|telefone e endereco|telefone e endereço|qual é endereço da web|qual e endereco da web|empresas similares|cadastre sua empresa|como chegar|ver no mapa|lista telefonica|lista telefônica|business listing|yelp/.test(haystack)) {
      return "business_listing";
    }
    return "directory_profile";
  }
  if (/\/biz\/|\/empresa\/|\/local\/|\/guia\/|\/catalogo\/|\/diretorio\/|\/profissionais?\/|\/psicologos?\/[^/]+/.test(haystack)) {
    return "directory_profile";
  }
  if (/clinica|clínica|instituto|centro de saude|centro de saúde|hospital|empresa|associacao|associação|grupo de psicologia/.test(haystack)) {
    return "clinic_or_company";
  }
  return "unknown";
}


function ownWebsiteEvidenceScore(url: string, name: string, evidence = ""): { score: number; hostMatches: number; evidenceMatches: number } {
  const parsed = new URL(url);
  const host = compactAlphaNumeric(parsed.hostname.replace(/^www\./, ""));
  const path = compactAlphaNumeric(parsed.pathname);
  const evidenceCompact = compactAlphaNumeric(evidence);
  const tokens = professionalNameTokens(name).filter((token) => token.length >= 4);
  const compactName = tokens.join("");
  const hostMatches = tokens.filter((token) => host.includes(token)).length;
  const pathMatches = tokens.filter((token) => path.includes(token)).length;
  const evidenceMatches = tokens.filter((token) => evidenceCompact.includes(token)).length;
  let score = 0;
  if (compactName && host.includes(compactName)) score += 64;
  if (hostMatches >= 2) score += 54;
  else if (hostMatches === 1 && /psi|psico|psicolog|terapia/.test(host)) score += 48;
  else if (hostMatches === 1) score += 28;
  if (/psi|psico|psicolog|psicologia|terapia|terapeuta/.test(host)) score += 22;
  if (pathMatches >= 2) score += 22;
  if (compactName && evidenceCompact.includes(compactName)) score += 38;
  else if (evidenceMatches >= 2) score += 34;
  else if (evidenceMatches === 1 && /psi|psico|psicolog|terapia/.test(host)) score += 18;
  if (/psic[oó]log|psicoterapia|terapia|atendimento|consulta|consult[oó]rio|agendamento/i.test(evidence)) score += 22;
  if (/\bcrp\b|registro profissional/i.test(evidence)) score += 22;
  if (/whatsapp|telefone|celular|fale conosco|contato|agendar/i.test(evidence)) score += 14;
  if (/site oficial|site próprio|site proprio|p[aá]gina oficial|consult[oó]rio online/i.test(evidence)) score += 12;
  return { score, hostMatches, evidenceMatches };
}

function isHardInvalidWebsiteKind(kind: WebsiteCandidateKind): boolean {
  return ["directory_profile", "business_listing", "academic_profile", "news_article", "social_profile", "linkhub", "unrelated"].includes(kind);
}

function hasDirectoryNegativeEvidence(url: string, evidence = ""): boolean {
  return /nao ha site listado|não há site listado|qual e endereco da web|qual é endereço da web|voce pode contatar|você pode contatar|telefone e endereco|telefone e endereço|empresas similares|cadastre sua empresa|como chegar|ver no mapa|avalia[cç][oõ]es de empresas|\/biz\/|\/empresa\/|\/local\//i.test(`${url} ${evidence}`);
}

function ownWebsiteCandidateDecision(url: string | undefined, name: string, evidence = ""): OwnWebsiteCandidateDecision {
  const kind = classifyWebsiteCandidateUrl(url, evidence);
  if (!url || kind === "unrelated") return { ok: false, kind, score: 0, reason: "URL ausente ou inválida." };
  if (isHardInvalidWebsiteKind(kind)) {
    return { ok: false, kind, score: 0, reason: `URL classificada como ${kind}, não site próprio.` };
  }

  const tokens = professionalNameTokens(name).filter((token) => token.length >= 4);
  if (tokens.length < 2) {
    return { ok: false, kind: "unknown", score: 0, reason: "Nome curto demais para validar site próprio com segurança." };
  }

  let decision;
  try {
    decision = ownWebsiteEvidenceScore(url, name, evidence);
  } catch {
    return { ok: false, kind: "unrelated", score: 0, reason: "URL inválida." };
  }
  let score = decision.score;

  // Conteúdo de clínica/empresa só bloqueia quando não há sinais fortes de marca pessoal.
  if (kind === "clinic_or_company" && decision.hostMatches === 0 && decision.evidenceMatches < 2) {
    score -= 55;
  }
  if (hasDirectoryNegativeEvidence(url, evidence)) score -= 95;

  const ok = score >= 70;
  return {
    ok,
    kind: ok ? "own_professional_site" : kind === "clinic_or_company" ? "clinic_or_company" : "unknown",
    score: Math.max(0, Math.min(100, score)),
    reason: ok
      ? "Domínio/conteúdo tem congruência forte com site pessoal/institucional do profissional."
      : "Sem congruência suficiente para site próprio do profissional."
  };
}

function isDirectoryProfileUrl(url: string, text = ""): boolean {
  const kind = classifyWebsiteCandidateUrl(url, text);
  return kind === "directory_profile" || kind === "business_listing";
}

function ownWebsiteStatus(url: string | undefined, name?: string, evidence = ""): "found" | "not_found" | "aggregator_only" {
  if (!url) return "not_found";
  if (name) return ownWebsiteCandidateDecision(url, name, evidence).ok ? "found" : "aggregator_only";
  return looksLikeOwnWebsite(url, evidence) ? "found" : "aggregator_only";
}

function looksLikeOwnWebsite(url: string, text = ""): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const kind = classifyWebsiteCandidateUrl(url, text);
  return kind === "unknown" || kind === "own_professional_site";
}

const GENERIC_SOCIAL_HANDLE_TERMS = [
  "getninjas",
  "locaisbrasil",
  "medicosbrasil",
  "clinicaintegrar",
  "clinica",
  "consultorio",
  "agenda",
  "doctoralia",
  "melhores",
  "mapadatcs",
  "qualotelefone",
  "guia",
  "portal",
  "saude",
  "psicologia",
  "terapia",
  "terapeuta",
  "consultas",
  "psicologosbrasil",
  "centralpsicologia"
];



const NON_PROFESSIONAL_INSTAGRAM_TERMS = [
  "wedding",
  "fotografia",
  "fotografa",
  "fotografo",
  "photo",
  "makeup",
  "moda",
  "loja",
  "store",
  "studio",
  "viagens",
  "travel",
  "food",
  "beleza",
  "decor",
  "arquitetura",
  "imoveis",
  "imóveis",
  "advocacia"
];

function instagramEvidenceHasProfessionalContext(evidence: string): boolean {
  return /psic[oó]log|psico\b|psi[._-]|terap|atendimento|consulta|crp|sa[uú]de mental|consult[oó]rio|psicoterapia/i.test(evidence);
}

function instagramLooksNonProfessional(url: string, evidence = ""): boolean {
  const handle = instagramHandle(url)?.replace(/[^a-z0-9]/g, "") ?? "";
  const haystack = normalize(`${handle} ${evidence}`);
  return NON_PROFESSIONAL_INSTAGRAM_TERMS.some((term) => haystack.includes(normalize(term).replace(/[^a-z0-9]/g, "")) || haystack.includes(normalize(term)));
}

function instagramCandidateScore(url: string, name: string, evidence = ""): number {
  if (!url || !isInstagramProfileUrl(url) || isGenericSocialHandle(url)) return -1000;
  const handle = instagramHandle(url)?.replace(/[^a-z0-9]/g, "") ?? "";
  const professionalContext = instagramEvidenceHasProfessionalContext(evidence);
  const nameEvidence = evidenceMatchesProfessionalName(evidence, name);
  const handleName = handleMatchesProfessionalName(url, name);
  const handleProfessional = /psi|psico|psicolog|terap|crp/.test(handle);
  let score = 0;
  if (handleName) score += 36;
  if (nameEvidence) score += 28;
  if (professionalContext) score += 34;
  if (handleProfessional) score += 32;
  if (instagramLooksNonProfessional(url, evidence) && !handleProfessional) score -= 140;
  else if (instagramLooksNonProfessional(url, evidence) && !professionalContext) score -= 60;
  return score;
}

function professionalNameTokens(name: string): string[] {
  return normalize(stripProfessionalPrefix(name))
    .split(" ")
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 3 && !["dra", "dr", "de", "da", "do", "das", "dos", "psicologo", "psicologa"].includes(token));
}

function instagramHandle(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.replace(/^www\./, "").toLowerCase().endsWith("instagram.com")) return undefined;
    const handle = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (!handle || ["p", "reel", "reels", "stories", "explore", "accounts", "about", "developer"].includes(handle)) return undefined;
    return handle.replace(/^@/, "");
  } catch {
    return undefined;
  }
}

function isGenericSocialHandle(url: string): boolean {
  const handle = instagramHandle(url)?.replace(/[^a-z0-9]/g, "") ?? "";
  return Boolean(handle) && GENERIC_SOCIAL_HANDLE_TERMS.some((term) => handle.includes(term.replace(/[^a-z0-9]/g, "")));
}

function handleMatchesProfessionalName(url: string, name: string): boolean {
  const handle = instagramHandle(url)?.replace(/[^a-z0-9]/g, "") ?? "";
  if (!handle) return false;
  const tokens = professionalNameTokens(name);
  if (tokens.length < 2) return false;
  const matches = tokens.filter((token) => handle.includes(token));
  if (matches.length >= 2) return true;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  return Boolean(last && handle.includes(last) && first && handle.includes(first.slice(0, Math.min(2, first.length))));
}

function evidenceMatchesProfessionalName(evidence: string, name: string): boolean {
  const normalizedEvidence = normalize(evidence);
  const normalizedName = normalize(stripProfessionalPrefix(name));
  if (normalizedName && normalizedEvidence.includes(normalizedName)) return true;
  const tokens = professionalNameTokens(name);
  return tokens.filter((token) => normalizedEvidence.includes(token)).length >= Math.min(2, tokens.length);
}

function isAcceptableInstagramUrlForProfessional(url: string | undefined, name: string, evidence = ""): url is string {
  if (!url || !isInstagramProfileUrl(url)) return false;
  if (isGenericSocialHandle(url)) return false;
  const handle = instagramHandle(url)?.replace(/[^a-z0-9]/g, "") ?? "";
  const professionalContext = instagramEvidenceHasProfessionalContext(evidence);
  const handleProfessional = /psi|psico|psicolog|terap|crp/.test(handle);
  if (instagramLooksNonProfessional(url, evidence) && !handleProfessional) return false;
  return instagramCandidateScore(url, name, evidence) >= 55;
}

function isAcceptableOwnWebsiteForProfessional(url: string | undefined, name: string, evidence = ""): url is string {
  return ownWebsiteCandidateDecision(url, name, evidence).ok;
}

function isPotentialOwnWebsiteForProfessional(url: string | undefined, name: string, evidence = ""): url is string {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const kind = classifyWebsiteCandidateUrl(url, evidence);
  if (isHardInvalidWebsiteKind(kind)) return false;
  const host = hostOf(url);
  const hostLooksProfessional = /psi|psico|psicolog|psicologia|terapia|terapeuta/.test(compactAlphaNumeric(host));
  const evidenceMatches = evidenceMatchesProfessionalName(evidence, name);
  const professionalContext = /psic[oó]log|psicoterapia|terapia|atendimento|consulta|consult[oó]rio|crp|whatsapp|telefone/i.test(evidence);
  return hostLooksProfessional || (evidenceMatches && professionalContext);
}

function canonicalOwnWebsiteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const servicePath = pathParts.some((part) => /servicos?|terapia|psicolog|atendimento|consulta|depressao|ansiedade|agendamento/i.test(part));
    if (servicePath && pathParts.length > 1) parsed.pathname = "/";
    return parsed.href.replace(/\/$/, "/");
  } catch {
    return url;
  }
}

const CITY_PREFERRED_DDDS: Record<string, number[]> = {
  londrina: [43],
  cambe: [43],
  cambé: [43],
  maringa: [44],
  maringá: [44],
  curitiba: [41],
  "ponta grossa": [42],
  cascavel: [45],
  "foz do iguacu": [45],
  "foz do iguaçu": [45],
  guarapuava: [42],
  paranagua: [41],
  paranaguá: [41]
};

function preferredDddsForCampaign(campaign: Campaign): number[] {
  const normalizedCity = normalize(campaign.city).replace(/[^a-z0-9]+/g, " ").trim();
  for (const [city, ddds] of Object.entries(CITY_PREFERRED_DDDS)) {
    const normalizedCandidate = normalize(city).replace(/[^a-z0-9]+/g, " ").trim();
    if (normalizedCity === normalizedCandidate || normalizedCity.includes(normalizedCandidate)) return ddds;
  }
  const stateDdds = BRAZIL_STATE_DDDS[campaign.state.toUpperCase()] ?? [];
  return stateDdds.length === 1 ? stateDdds : [];
}

function normalizedPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
}

function phoneIsMobile(value: string): boolean {
  const national = normalizedPhoneDigits(value);
  return national.length === 11 && national[2] === "9";
}

function phoneContactRank(value: string, campaign: Campaign, options: { preferWhatsapp?: boolean; evidence?: string } = {}): number {
  const ddd = dddFromPhone(value);
  const preferred = preferredDddsForCampaign(campaign);
  const stateDdds = BRAZIL_STATE_DDDS[campaign.state.toUpperCase()] ?? [];
  let score = 0;
  if (options.preferWhatsapp) score += 25;
  if (phoneIsMobile(value)) score += 28;
  if (ddd && preferred.includes(ddd)) score += 65;
  else if (ddd && stateDdds.includes(ddd)) score += 18;
  else if (ddd) score -= 45;
  const evidence = normalize(options.evidence ?? "");
  if (/whatsapp|wa\.me|agendar|contato|celular/.test(evidence)) score += 15;
  return score;
}

function rankPhones(values: Iterable<string>, campaign: Campaign, options: { preferWhatsapp?: boolean; evidence?: string } = {}): string[] {
  return normalizeContactList(Array.from(values))
    .filter((phone) => phoneMatchesCampaignRegion(phone, campaign))
    .sort((a, b) => phoneContactRank(b, campaign, options) - phoneContactRank(a, campaign, options));
}

function shouldUseAiForAggregator(cardSeeds: ProfessionalSeed[]): boolean {
  if (process.env.SCRAPER_AI_EXTRACT_AGGREGATOR === "false") return false;
  if (cardSeeds.length === 0) return true;
  const withContact = cardSeeds.filter((seed) => contactScore(seed) > 0).length;
  return cardSeeds.length < 3 || withContact === 0;
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


const NAME_STOP_WORDS = [
  "psicologo", "psicologa", "psicologos", "psicologia", "clinica", "consultorio", "consulta",
  "atendimento", "online", "presencial", "whatsapp", "instagram", "site", "londrina", "parana",
  "preco", "agenda", "agendar", "ver", "perfil", "telefone", "email", "endereco", "especialidades", "curitiba", "sao paulo", "são paulo", "cristo rei"
];

const NON_PERSON_NAME_TERMS = [
  "rua", "avenida", "av", "alameda", "travessa", "praca", "praça", "rodovia", "bairro", "centro",
  "clinica", "clínica", "instituto", "consultorio", "consultório", "centro de saude", "centro de saúde",
  "psicomotricidade", "relacional", "terapia", "terapias", "saude", "saúde", "empresa", "unidade",
  "como chegar", "sugerir edicao", "sugerir edição", "ver mapa", "mapa", "telefone", "endereco", "endereço",
  "atendimento", "especialidade", "especialidades", "curitiba", "sao paulo", "são paulo", "cristo rei", "servico", "serviço", "servicos", "serviços",
  "espaco", "espaço", "personare", "associacao", "associação", "grupo", "acp"
];

const NON_PERSON_EXACT_OR_GEO_TERMS = [
  "sao paulo", "são paulo", "cristo rei", "bigorrilho", "batel", "centro civico", "centro cívico",
  "curitiba", "londrina", "maringa", "maringá", "parana", "paraná", "santa catarina", "brasil",
  "acp curitiba", "espaco terapeutico personare", "espaço terapêutico personare"
];

function personNameScore(value: string): number {
  const name = stripProfessionalPrefix(value);
  const normalized = normalize(name);
  if (!name || name.length < 5 || name.length > 90) return 0;
  if (/\d|@|https?:|www\./i.test(name)) return 0;
  if (NON_PERSON_EXACT_OR_GEO_TERMS.some((term) => normalized === normalize(term) || (normalized.includes(normalize(term)) && normalized.split(" ").length <= 3))) return 0;
  if (/\b(?:solicitar\s+exclus[aã]o|como\s+chegar|ver\s+telefone|agendar|endere[cç]o)\b/i.test(name)) return 0;
  if (/\b(?:e|ou|de|da|do|das|dos)$/i.test(name.trim())) return 0;
  if (NON_PERSON_NAME_TERMS.some((term) => normalized.includes(term))) return 0;
  const tokens = name.split(/\s+/).filter(Boolean);
  const relevantTokens = tokens.filter((token) => !/^(de|da|do|das|dos|e)$/i.test(token));
  if (relevantTokens.length < 2 || relevantTokens.length > 5) return 0;
  const capitalized = relevantTokens.filter((token) => /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'`´-]{1,}$/u.test(token)).length;
  const nameTokenRatio = capitalized / relevantTokens.length;
  const commonPersonShape = relevantTokens.every((token) => /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'`´-]{1,}$/u.test(token));
  const shortPenalty = relevantTokens.some((token) => token.length <= 2) ? 0.15 : 0;
  return Math.max(0, Math.min(1, (commonPersonShape ? 0.62 : 0.35) + nameTokenRatio * 0.35 - shortPenalty));
}

function stripProfessionalPrefix(value: string): string {
  return compactText(
    value
      .replace(/^\s*(?:Dr\.?|Dra\.?|Psic[oó]loga?|Psic[oó]logo|Terapeuta)\s+/i, "")
      .replace(/\s+(?:CRP|CRM|CRO)\b.*$/i, "")
      .replace(/[|•·,;:-]+.*$/g, "")
      .trim(),
    90
  );
}

function looksLikePersonName(value: string): boolean {
  const normalized = normalize(stripProfessionalPrefix(value));
  if (NAME_STOP_WORDS.some((word) => normalized.includes(word))) return false;
  return personNameScore(value) >= 0.65;
}

function extractPersonNameFromSearchTitle(title: string): string | undefined {
  const cleaned = compactText(title
    .replace(/\s+[|›»].*$/g, "")
    .replace(/\s+-\s+(?:Psic[oó]log[ao].*|Terap.*|Consulta.*|Doctoralia.*|Mundo.*|Londrina.*)$/i, "")
    .replace(/(?:em|no|na)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ\s-]+$/u, "")
    .trim(), 100);
  const patterns = [
    /(?:Dr\.?|Dra\.?|Psic[oó]loga?|Psic[oó]logo)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'`´-]+(?:\s+(?:de|da|do|das|dos|e|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'`´-]+)){1,5})/u,
    /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'`´-]+(?:\s+(?:de|da|do|das|dos|e|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'`´-]+)){1,5})\s+(?:Psic[oó]log|Terap|CRP|Consulta)/u,
    /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'`´-]+(?:\s+(?:de|da|do|das|dos|e|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'`´-]+)){1,5})$/u
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const candidate = match?.[1] ? stripProfessionalPrefix(match[1]) : undefined;
    if (candidate && looksLikePersonName(candidate)) return candidate;
  }
  const fallback = stripProfessionalPrefix(cleaned);
  return looksLikePersonName(fallback) ? fallback : undefined;
}

function normalizeOptionalUrl(url: string | undefined, baseUrl: string): string | undefined {
  if (!url) return undefined;
  const absolute = absoluteUrl(url, baseUrl);
  return /^https?:\/\//i.test(absolute) ? absolute : undefined;
}

function normalizeContactList(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

function extractProfessionalRegistry(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ");
  const match = normalized.match(/\b(?:CRP|CRM|CRO|OAB)\s*(?:[-:]?\s*[A-Z]{2})?\s*\d{1,3}\s*\/?\s*\d{3,8}\b/i);
  return match ? compactText(match[0].replace(/\s+/g, " "), 40) : undefined;
}

function extractAddress(text: string, campaign: Campaign): string | undefined {
  const normalized = text.replace(/\s+/g, " ");
  const city = campaign.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const addressPattern = new RegExp(`\\b(?:Rua|R\\.|Avenida|Av\\.|Alameda|Travessa|Praça|Praca)\\s+[^\\n|•]{8,160}?(?:${city}|${campaign.state}|CEP|\\d{5}-?\\d{3})`, "i");
  const match = normalized.match(addressPattern);
  return match ? compactText(match[0], 180) : undefined;
}

function contactScore(contacts: { emails?: string[]; phones?: string[]; whatsappNumbers?: string[] }): number {
  return (contacts.whatsappNumbers?.length ? 60 : 0)
    + (contacts.emails?.length ? 35 : 0)
    + (contacts.phones?.length ? 25 : 0);
}

const BRAZIL_STATE_DDDS: Record<string, number[]> = {
  AC: [68], AL: [82], AP: [96], AM: [92, 97], BA: [71, 73, 74, 75, 77], CE: [85, 88], DF: [61],
  ES: [27, 28], GO: [62, 64], MA: [98, 99], MT: [65, 66], MS: [67], MG: [31, 32, 33, 34, 35, 37, 38],
  PA: [91, 93, 94], PB: [83], PR: [41, 42, 43, 44, 45, 46], PE: [81, 87], PI: [86, 89],
  RJ: [21, 22, 24], RN: [84], RS: [51, 53, 54, 55], RO: [69], RR: [95], SC: [47, 48, 49],
  SP: [11, 12, 13, 14, 15, 16, 17, 18, 19], SE: [79], TO: [63]
};

function dddFromPhone(value: string): number | undefined {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  if (national.length !== 10 && national.length !== 11) return undefined;
  const ddd = Number(national.slice(0, 2));
  return Number.isFinite(ddd) ? ddd : undefined;
}

function phoneMatchesCampaignRegion(value: string, campaign: Campaign): boolean {
  const allowed = BRAZIL_STATE_DDDS[campaign.state.toUpperCase()];
  if (!allowed?.length) return true;
  const ddd = dddFromPhone(value);
  return Boolean(ddd && allowed.includes(ddd));
}

function filterContactsForCampaign<T extends { emails?: string[]; phones?: string[]; whatsappNumbers?: string[] }>(
  contacts: T,
  campaign: Campaign
): T {
  return {
    ...contacts,
    emails: normalizeContactList(contacts.emails),
    phones: normalizeContactList(contacts.phones).filter((phone) => phoneMatchesCampaignRegion(phone, campaign)),
    whatsappNumbers: normalizeContactList(contacts.whatsappNumbers).filter((phone) => phoneMatchesCampaignRegion(phone, campaign))
  };
}

const GENERIC_PLATFORM_EMAIL_LOCALS = new Set([
  "atendimento", "contato", "suporte", "comercial", "sac", "admin", "administrativo", "financeiro", "ouvidoria",
  "privacidade", "lgpd", "dpo", "noreply", "no-reply", "naoresponda", "marketing"
]);

function emailLooksLikePlatformContact(email: string, sourceUrl?: string): boolean {
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  if (!local || !domain) return true;
  const sourceHost = sourceUrl ? hostOf(sourceUrl) : "";
  const genericLocal = GENERIC_PLATFORM_EMAIL_LOCALS.has(local) || /^(atendimento|contato|suporte|comercial|sac)[._-]/.test(local);
  if (genericLocal && (!sourceHost || domain === sourceHost || sourceHost.endsWith(`.${domain}`) || domain.endsWith(`.${sourceHost}`))) return true;
  if (BLOCKED_OWN_WEBSITE_HOSTS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) return true;
  return false;
}

function sanitizeContactOwnership<T extends { emails?: string[]; phones?: string[]; whatsappNumbers?: string[] }>(
  contacts: T,
  campaign: Campaign,
  options: { sourceUrl?: string; professionalName?: string; evidence?: string; allowGenericEmailOnOwnWebsite?: boolean } = {}
): T {
  const normalized = filterContactsForCampaign(contacts, campaign);
  const sourceUrl = options.sourceUrl;
  const isOwnWebsiteSource = Boolean(sourceUrl && looksLikeOwnWebsite(sourceUrl, options.evidence ?? ""));
  return {
    ...contacts,
    emails: normalizeContactList(normalized.emails).filter((email) => {
      if (emailLooksLikePlatformContact(email, sourceUrl)) return false;
      if (isOwnWebsiteSource && options.allowGenericEmailOnOwnWebsite) return true;
      if (!options.professionalName) return true;
      const compactEmail = normalize(email).replace(/[^a-z0-9]/g, "");
      const tokens = professionalNameTokens(options.professionalName);
      return tokens.length === 0 || tokens.some((token) => token.length >= 4 && compactEmail.includes(token));
    }),
    phones: normalizeContactList(normalized.phones),
    whatsappNumbers: normalizeContactList(normalized.whatsappNumbers)
  };
}

function hasPhoneContact(contacts: { phones?: string[]; whatsappNumbers?: string[] }): boolean {
  return Boolean(contacts.whatsappNumbers?.length || contacts.phones?.length);
}

function sourceContactScore(candidate: RawSearchCandidate): number {
  if (shouldHardSkipSearchResult(candidate)) return -1000;
  const text = normalize(`${candidate.title} ${candidate.snippet} ${candidate.url}`);
  const host = hostOf(candidate.url);
  return [
    /whatsapp|wa\.me|telefone|contato|agendar|celular/.test(text) ? 45 : 0,
    /eguias|telelistas|guiamais|apontador|solutudo/.test(host) ? 35 : 0,
    /doctoralia|mundopsicologos|psicologiaviva|zenklub|boaconsulta|medicosbrasil|mapadatcs/.test(host) ? 20 : 0,
    /crp|registro|endereco|endereço/.test(text) ? 15 : 0,
    isInstagramProfileUrl(candidate.url) ? 12 : 0,
    isSocialUrl(candidate.url) && !isInstagramProfileUrl(candidate.url) ? -100 : 0
  ].reduce((sum, value) => sum + value, 0);
}

function deterministicSourceClassification(candidate: RawSearchCandidate): SourceClassification {
  const evidence = `${candidate.title} ${candidate.snippet} ${candidate.url}`;
  if (shouldHardSkipSearchResult(candidate)) {
    return { type: "noise", confidence: 0.9, reason: "Fonte bloqueada antes de scraping/IA." };
  }
  if (isAggregatorUrl(candidate.url, evidence)) {
    return { type: "aggregator", confidence: 0.68, reason: "Fonte com sinais de diretório/agregador profissional." };
  }
  if (isAcceptableInstagramUrlForProfessional(candidate.url, candidate.title, evidence) || isInstagramProfileUrl(candidate.url)) {
    return { type: "social", confidence: 0.62, reason: "Resultado social com possível perfil profissional." };
  }
  if (looksLikeOwnWebsite(candidate.url, evidence) || looksLikePersonName(extractPersonNameFromSearchTitle(candidate.title) ?? "")) {
    return { type: "direct_professional", confidence: 0.55, reason: "Resultado direto potencialmente ligado a profissional." };
  }
  return { type: "noise", confidence: 0.5, reason: "Sem sinais suficientes de agregador ou profissional." };
}

function normalizeUsefulSourceClassification(ai: SourceClassification, heuristic: SourceClassification): SourceClassification {
  const minimumUsefulConfidence: Record<SourceClassificationType, number> = {
    aggregator: 0.62,
    direct_professional: 0.5,
    social: 0.5,
    noise: 0.45
  };
  if (ai.type === "noise" && ai.confidence < 0.7 && heuristic.type !== "noise") {
    return heuristic;
  }
  const normalizedConfidence = ai.type === "noise"
    ? Math.max(ai.confidence, 0.35)
    : Math.max(ai.confidence, minimumUsefulConfidence[ai.type], ai.type === heuristic.type ? heuristic.confidence : 0);
  return {
    ...ai,
    confidence: Math.min(0.98, normalizedConfidence),
    reason: ai.reason ?? heuristic.reason
  };
}

function isUsefulAggregatorCandidate(item: { candidate: RawSearchCandidate; classification: SourceClassification }): boolean {
  const evidence = `${item.candidate.title} ${item.candidate.snippet} ${item.candidate.url}`;
  return item.classification.type === "aggregator" || isAggregatorUrl(item.candidate.url, evidence);
}

async function classifyInitialSourcesWithAi(
  campaign: Campaign,
  candidates: RawSearchCandidate[],
  run?: ActiveDiscoveryRun,
  profile: DiscoveryProfile = DISCOVERY_PROFILES.quick
): Promise<Map<number, SourceClassification>> {
  const fallback = new Map<number, SourceClassification>();
  candidates.forEach((candidate, index) => fallback.set(index, deterministicSourceClassification(candidate)));
  if (!process.env.OPENAI_API_KEY || process.env.SCRAPER_AI_CLASSIFY_SOURCES === "false" || candidates.length === 0) {
    return fallback;
  }

  const input = {
    target: {
      niche: campaign.niche,
      city: campaign.city,
      state: campaign.state
    },
    candidates: candidates.slice(0, Math.min(candidates.length, 36)).map((candidate, index) => ({
      index,
      title: compactText(candidate.title, 90),
      host: hostOf(candidate.url),
      path: (() => {
        try { return compactText(new URL(candidate.url).pathname, 100); } catch { return compactText(candidate.url, 100); }
      })(),
      snippet: compactText(candidate.snippet, 120),
      heuristic: fallback.get(index)?.type
    })),
    rules: "Tipos: aggregator=listagem/diretório de vários profissionais; direct_professional=site/página do próprio profissional; social=perfil social pessoal/profissional; noise=clínica/empresa genérica, anúncio, notícia, rede social bloqueada, dado público ou página sem prospecção. Retorne sem reason salvo se incerto."
  };
  const hash = inputHash(input);
  const cacheKey = ["campaign", campaign.id, "source_classifier_v1", model, promptVersion, hash].join(":");
  const cached = store.aiCache.get(cacheKey)?.outputJson;
  if (cached) {
    const parsed = sourceClassificationSchema.parse(cached);
    for (const item of parsed.items) {
      const heuristic = fallback.get(item.index) ?? deterministicSourceClassification(candidates[item.index]);
      fallback.set(item.index, normalizeUsefulSourceClassification({ type: item.type, confidence: item.confidence, reason: item.reason }, heuristic));
    }
    return fallback;
  }

  if (run) {
    pushEvent(run, {
      kind: "ai_request",
      title: "IA classificando fontes iniciais",
      payload: input
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Classifique resultados de busca para prospecção B2B local. Retorne só JSON {\"items\":[{\"index\":0,\"type\":\"aggregator|direct_professional|social|noise\",\"confidence\":0.75,\"reason\":\"até 80 chars\"}]}. Para classes úteis use confidence 0.35-0.95; use 0 só se impossível classificar. Seja conservador: agregador não é site próprio; empresa/clínica genérica não é profissional."
      },
      { role: "user", content: JSON.stringify(input) }
    ]
  });
  const content = response.choices[0]?.message.content;
  if (!content) return fallback;
  const parsed = sourceClassificationSchema.parse(JSON.parse(content));
  for (const item of parsed.items) {
    const heuristic = fallback.get(item.index) ?? deterministicSourceClassification(candidates[item.index]);
    fallback.set(item.index, normalizeUsefulSourceClassification({ type: item.type, confidence: item.confidence, reason: item.reason }, heuristic));
  }
  store.aiCache.set(cacheKey, {
    id: store.nextId("aiCache"),
    entityType: "campaign",
    entityId: String(campaign.id),
    analysisType: "source_classifier_v1",
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
      title: "Fontes iniciais classificadas pela IA",
      response: parsed
    });
  }
  return fallback;
}

function seedQualityScore(seed: ProfessionalSeed): number {
  return contactScore(seed)
    + (seed.instagramUrl ? 45 : 0)
    + (hasPhoneContact(seed) ? 35 : 0)
    + (seed.profileUrl ? 18 : 0)
    + (seed.professionalRegistry ? 16 : 0)
    + (seed.address ? 8 : 0)
    + (seed.websiteUrl ? 10 : 0)
    + ((seed.confidence ?? 0.55) * 10);
}

function mergeSeedData(target: ProfessionalSeed, source: ProfessionalSeed): ProfessionalSeed {
  return {
    ...target,
    profileUrl: target.profileUrl ?? source.profileUrl,
    websiteUrl: target.websiteUrl ?? source.websiteUrl,
    instagramUrl: target.instagramUrl ?? source.instagramUrl,
    googleMapsUrl: target.googleMapsUrl ?? source.googleMapsUrl,
    address: target.address ?? source.address,
    professionalRegistry: target.professionalRegistry ?? source.professionalRegistry,
    evidence: target.evidence.length >= source.evidence.length ? target.evidence : source.evidence,
    emails: normalizeContactList([...(target.emails ?? []), ...(source.emails ?? [])]),
    phones: normalizeContactList([...(target.phones ?? []), ...(source.phones ?? [])]),
    whatsappNumbers: normalizeContactList([...(target.whatsappNumbers ?? []), ...(source.whatsappNumbers ?? [])]),
    confidence: Math.max(target.confidence ?? 0, source.confidence ?? 0),
    extractionMethod: target.extractionMethod ?? source.extractionMethod
  };
}

function mergeDuplicateSeeds(seeds: ProfessionalSeed[]): ProfessionalSeed[] {
  const byName = new Map<string, ProfessionalSeed>();
  for (const seed of seeds) {
    const key = normalize(seed.name);
    if (!key) continue;
    const existing = byName.get(key);
    byName.set(key, existing ? mergeSeedData(existing, seed) : seed);
  }
  return Array.from(byName.values());
}

function extractNamesFromText(text: string): string[] {
  const chunks = text
    .split(/[\n|•·;]+/g)
    .flatMap((chunk) => chunk.split(/(?=\b(?:Dr\.?|Dra\.?|Psic[oó]loga?|Psic[oó]logo)\s+)/i))
    .map((chunk) => compactText(chunk, 160));
  const names: string[] = [];
  for (const chunk of chunks) {
    const prefixed = chunk.match(/\b(?:Dr\.?|Dra\.?|Psic[oó]loga?|Psic[oó]logo)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'`´-]+(?:\s+(?:de|da|do|das|dos|e|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'`´-]+)){1,5}/gu) ?? [];
    for (const match of prefixed) {
      const name = stripProfessionalPrefix(match);
      if (looksLikePersonName(name)) names.push(name);
    }
  }
  return Array.from(new Set(names));
}

function aggregatorCardScore(rawText: string, links: Array<{ text: string; href: string }>, contacts: { emails?: string[]; phones?: string[]; whatsappNumbers?: string[] }, campaign: Campaign): number {
  const text = normalize(rawText);
  const linkEvidence = normalize(links.map((link) => `${link.text} ${link.href}`).join(" "));
  const linkCount = links.length;
  return [
    /(?:dr|dra|psicologo|psicologa|terapeuta)/i.test(rawText) ? 20 : 0,
    /crp|registro/.test(text) ? 25 : 0,
    /whatsapp|wa\.me|telefone|contato|agendar/.test(`${text} ${linkEvidence}`) ? 30 : 0,
    contacts.whatsappNumbers?.length ? 45 : 0,
    contacts.phones?.length ? 30 : 0,
    contacts.emails?.length ? 15 : 0,
    /instagram/.test(linkEvidence) ? 25 : 0,
    normalize(campaign.city) && text.includes(normalize(campaign.city)) ? 10 : 0,
    /login|entrar|cadastro|cadastre|pol[ií]tica|termos|footer|menu|navbar|publicidade|an[uú]ncio/.test(text) ? -45 : 0,
    linkCount > 24 ? -35 : 0,
    rawText.length > 1300 ? -20 : 0
  ].reduce((sum, value) => sum + value, 0);
}

function extractAggregatorCardSeeds(
  url: string,
  html: string,
  page: CompactPage,
  campaign: Campaign,
  maxNames = MAX_NAMES_PER_AGGREGATOR
): ProfessionalSeed[] {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, canvas, iframe").remove();
  const selectors = [
    "[itemtype*='Person']",
    "article",
    "li",
    "section",
    "div[class*='card' i]",
    "div[class*='result' i]",
    "div[class*='profile' i]",
    "div[class*='professional' i]",
    "div[class*='doctor' i]",
    "div[class*='item' i]"
  ].join(",");
  const elements = $(selectors).toArray();
  const seeds: ProfessionalSeed[] = [];
  const city = normalize(campaign.city);

  for (const element of elements) {
    const $element = $(element);
    const rawText = compactText($element.text(), 1400);
    const normalizedText = normalize(rawText);
    if (rawText.length < 50 || rawText.length > 1400) continue;
    if (city && !normalizedText.includes(city) && !normalize(`${page.title} ${page.description}`).includes(city)) continue;

    const links = $element.find("a").slice(0, 18).map((_, link) => ({
      text: compactText($(link).text(), 120),
      href: absoluteUrl($(link).attr("href") ?? "", url)
    })).get();
    const linkText = links.map((link) => `${link.text} ${link.href}`).join(" ");
    const contactText = `${rawText} ${linkText}`;
    const contacts = sanitizeContactOwnership(extractStructuredContacts(contactText), campaign, { sourceUrl: url, evidence: contactText });
    const professionalRegistry = extractProfessionalRegistry(contactText);
    const address = extractAddress(contactText, campaign);
    const googleMapsUrl = links.find((link) => /google\.[^/]+\/maps|maps\.app\.goo\.gl/i.test(link.href))?.href;
    const websiteCandidate = links.find((link) => looksLikeOwnWebsite(link.href, `${link.text} ${rawText}`))?.href;
    const instagramCandidate = links.find((link) => isInstagramProfileUrl(link.href))?.href;
    const profileUrl = links.find((link) => {
      const hrefHost = hostOf(link.href);
      return hrefHost === hostOf(url)
        && link.href !== url
        && !/\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(link.href)
        && !/login|entrar|cadastro|favorito|avaliacao|review/i.test(link.href);
    })?.href;

    const nameCandidates = [
      $element.find("[itemprop='name']").first().text(),
      $element.find("h1,h2,h3,h4").first().text(),
      links.find((link) => looksLikePersonName(link.text))?.text,
      ...extractNamesFromText(rawText)
    ].filter((value): value is string => Boolean(value)).map(stripProfessionalPrefix).filter(looksLikePersonName);

    const name = nameCandidates[0];
    if (!name) continue;
    const cardScore = aggregatorCardScore(rawText, links, contacts, campaign);
    if (cardScore < 15) continue;
    const websiteUrl = isAcceptableOwnWebsiteForProfessional(websiteCandidate, name, `${rawText} ${linkText}`)
      ? websiteCandidate
      : undefined;
    const instagramUrl = isAcceptableInstagramUrlForProfessional(instagramCandidate, name, `${rawText} ${linkText}`)
      ? instagramCandidate
      : undefined;
    const score = contactScore(contacts) + (profileUrl ? 20 : 0) + (professionalRegistry ? 15 : 0) + cardScore;
    if (score <= 0 && !/psic[oó]log|terapia|consulta|crp/i.test(rawText)) continue;

    seeds.push({
      name,
      sourceUrl: url,
      sourceTitle: page.title,
      profileUrl,
      websiteUrl,
      instagramUrl,
      googleMapsUrl,
      address,
      professionalRegistry,
      emails: contacts.emails,
      phones: contacts.phones,
      whatsappNumbers: contacts.whatsappNumbers,
      evidence: compactText(rawText, 260),
      confidence: Math.min(0.95, 0.55 + score / 160),
      extractionMethod: "card"
    });
  }

  return mergeDuplicateSeeds(seeds)
    .sort((a, b) => seedQualityScore(b) - seedQualityScore(a))
    .slice(0, maxNames * 2);
}

function hasReachableChannel(professional: EnrichedProfessional): boolean {
  return hasRequiredLeadSignals(professional);
}

function leadQualityFor(professional: EnrichedProfessional): EnrichedProfessional["leadQuality"] {
  if (hasRequiredLeadSignals(professional)) return "ready_for_outreach";
  if (professional.instagramUrl || professional.finalWebsiteUrl || professional.emails.length) return "enrich_more";
  return "weak_candidate";
}

function createDiscoverySnapshot(campaignId: number, profile?: DiscoveryProfile): DiscoveryRunSnapshot {
  const now = new Date().toISOString();
  return {
    campaignId,
    running: true,
    startedAt: now,
    updatedAt: now,
    searchLevel: profile?.level,
    targetFinalLeads: profile?.targetFinalLeads,
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

function buildInitialSearchQueries(campaign: Campaign, profile: DiscoveryProfile): string[] {
  const niche = campaign.niche;
  const city = campaign.city;
  const state = campaign.state;
  return [
    `${niche} ${city} ${state} atendimento whatsapp instagram site`,
    `${niche} ${city} ${state} doctoralia mundo psicologos guia telefone`,
    `"${niche}" "${city}" "Instagram" "WhatsApp"`,
    `"${niche}" "${city}" "CRP" telefone`,
    `site:instagram.com "${city}" "${niche}"`,
    `site:doctoralia.com.br "${city}" "${niche}"`,
    `site:mundopsicologos.com.br "${city}" "${niche}"`,
    `"${city}" "${state}" "${niche}" "agendar consulta"`
  ]
    .map((query) => query.replace(/\s+/g, " ").trim())
    .slice(0, profile.initialSearchQueryLimit);
}

async function collectInitialCandidates(
  campaign: Campaign,
  profile: DiscoveryProfile,
  signal?: AbortSignal,
  browser?: Browser,
  page?: Page,
  run?: ActiveDiscoveryRun
): Promise<RawSearchCandidate[]> {
  const collected: RawSearchCandidate[] = [];
  for (const query of buildInitialSearchQueries(campaign, profile)) {
    throwIfDiscoveryStopped(signal);
    const results = await collectDuckDuckGoQuery(query, profile.initialResultsPerQuery, signal, browser, page, run);
    collected.push(...results);
    if (run) {
      pushEvent(run, {
        kind: "search_results",
        title: "Busca inicial por fonte",
        payload: {
          query,
          results: results.map((item) => ({ title: item.title, url: item.url, snippet: item.snippet }))
        }
      });
    }
  }
  return dedupeBy(collected, (candidate) => candidate.url);
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

function isBlockedOrChallengePage(url: string, page: CompactPage | { title?: string; text?: string; description?: string }): boolean {
  const haystack = normalize(`${hostOf(url)} ${page.title ?? ""} ${page.description ?? ""} ${page.text ?? ""}`);
  return /cloudflare|cf-chl|just a moment|checking your browser|verificando|verificacao de seguranca|executando verificacao|captcha|access denied|acesso negado/.test(haystack)
    || /qual o telefone|localizar um telefone|atos oficiais|cadastro medico|consultas medicas/.test(haystack)
    || isHardSkipUrl(url);
}

type CompactPageFacts = {
  url: string;
  host: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  contacts: ReturnType<typeof extractStructuredContacts>;
  relevantLinks: Array<{ text: string; href: string }>;
  registry?: string;
  address?: string;
};

function compactPageFactsForAi(page: CompactPage, campaign: Campaign, options: { seed?: ProfessionalSeed; textLimit?: number; linkLimit?: number } = {}): CompactPageFacts {
  const seedName = options.seed?.name ?? "";
  const combined = `${page.title} ${page.description} ${page.headings.join(" ")} ${page.text} ${page.links.map((link) => `${link.text} ${link.href}`).join(" ")}`;
  const relevantLinks = page.links
    .filter((link) => {
      const evidence = `${link.text} ${link.href}`;
      return /instagram|whats|contato|agendar|telefone|perfil|profile|mapa|crp|site/i.test(evidence)
        || isInstagramProfileUrl(link.href)
        || isAggregatorUrl(link.href, evidence)
        || isAcceptableOwnWebsiteForProfessional(link.href, seedName || page.title, evidence);
    })
    .slice(0, options.linkLimit ?? 10)
    .map((link) => ({ text: compactText(link.text, 70), href: compactText(link.href, 160) }));
  return {
    url: compactText(page.url, 180),
    host: hostOf(page.url),
    title: compactText(page.title, 120),
    description: compactText(page.description, 180),
    headings: page.headings.slice(0, 6).map((heading) => compactText(heading, 90)),
    text: compactText(page.text, options.textLimit ?? 900),
    contacts: filterContactsForCampaign(extractStructuredContacts(combined), campaign),
    relevantLinks,
    registry: extractProfessionalRegistry(combined),
    address: extractAddress(combined, campaign)
  };
}

function fallbackExtractNames(page: CompactPage, campaign: Campaign, maxNames = MAX_NAMES_PER_AGGREGATOR): ProfessionalSeed[] {
  const text = `${page.title}\n${page.headings.join("\n")}\n${page.text}`;
  const registry = extractProfessionalRegistry(text);
  const address = extractAddress(text, campaign);
  const city = normalize(campaign.city);
  const seeds = extractNamesFromText(text).map((name) => ({
    name,
    sourceUrl: page.url,
    sourceTitle: page.title,
    evidence: "Extraído por heurística conservadora do texto da página agregadora; contatos globais ignorados para evitar vazamento entre cards.",
    emails: [],
    phones: [],
    whatsappNumbers: [],
    professionalRegistry: registry,
    address,
    confidence: 0.42,
    extractionMethod: "heuristic" as const
  }));
  return mergeDuplicateSeeds(seeds)
    .filter((seed) => seed.name.split(" ").length >= 2 && (!city || normalize(`${seed.evidence} ${page.text}`).includes(city)))
    .sort((a, b) => seedQualityScore(b) - seedQualityScore(a))
    .slice(0, maxNames);
}

async function extractProfessionalsWithAi(
  page: CompactPage,
  campaign: Campaign,
  run?: ActiveDiscoveryRun
): Promise<ProfessionalSeed[] | undefined> {
  if (!process.env.OPENAI_API_KEY) return undefined;
  const facts = compactPageFactsForAi(page, campaign, { textLimit: 950, linkLimit: 10 });
  const input = {
    target: {
      niche: campaign.niche,
      city: campaign.city,
      state: campaign.state
    },
    page: facts,
    extractionGoal: "Extraia apenas profissionais individuais reais. Contatos só se estiverem no mesmo card/bloco. Saída curta, sem explicação."
  };
  if (run) {
    pushEvent(run, {
      kind: "ai_request",
      title: "IA extraindo profissionais e contatos do agregador",
      url: page.url,
      payload: input
    });
  }
  const hash = inputHash(input);
  const cacheKey = ["campaign", campaign.id, "aggregator_professional_extraction_v2", model, promptVersion, hash].join(":");
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
    return parsed.professionals
      .map((item) => professionalSeedFromAiItem(item, page, campaign))
      .filter((seed): seed is ProfessionalSeed => Boolean(seed));
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Extraia profissionais reais de agregadores/diretórios. Use só o JSON recebido. Retorne apenas {\"professionals\":[{\"name\":\"...\",\"profileUrl\":\"...\",\"websiteUrl\":\"...\",\"instagramUrl\":\"...\",\"googleMapsUrl\":\"...\",\"address\":\"...\",\"professionalRegistry\":\"...\",\"emails\":[],\"phones\":[],\"whatsappNumbers\":[],\"evidence\":\"até 120 caracteres\",\"confidence\":0.7}]}. Não inclua empresas, clínicas, anúncios, agregadores nem contatos fora do card do profissional."
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
    analysisType: "aggregator_professional_extraction_v2",
    model,
    promptVersion,
    inputHash: hash,
    inputJson: input,
    outputJson: parsed,
    createdAt: new Date().toISOString()
  });
  return parsed.professionals
    .map((item) => professionalSeedFromAiItem(item, page, campaign))
    .filter((seed): seed is ProfessionalSeed => Boolean(seed))
    .sort((a, b) => seedQualityScore(b) - seedQualityScore(a));
}

function professionalSeedFromAiItem(
  item: z.infer<typeof professionalsSchema>["professionals"][number],
  page: CompactPage,
  campaign: Campaign
): ProfessionalSeed | undefined {
  const name = stripProfessionalPrefix(compactText(item.name, 90));
  if (!looksLikePersonName(name)) return undefined;
  const confidence = item.confidence ?? 0.6;
  if (confidence < 0.25) return undefined;
  const contactText = `${item.emails.join(" ")} ${item.phones.join(" ")} ${item.whatsappNumbers.join(" ")}`;
  const deterministicContacts = sanitizeContactOwnership(extractStructuredContacts(contactText), campaign, { sourceUrl: page.url, professionalName: name, evidence: item.evidence ?? page.title });
  return {
    name,
    sourceUrl: page.url,
    sourceTitle: page.title,
    profileUrl: normalizeOptionalUrl(item.profileUrl, page.url),
    websiteUrl: isAcceptableOwnWebsiteForProfessional(normalizeOptionalUrl(item.websiteUrl, page.url), name, `${item.evidence ?? ""} ${page.title}`)
      ? normalizeOptionalUrl(item.websiteUrl, page.url)
      : undefined,
    instagramUrl: isAcceptableInstagramUrlForProfessional(normalizeOptionalUrl(item.instagramUrl, page.url), name, `${item.evidence ?? ""} ${page.title}`)
      ? normalizeOptionalUrl(item.instagramUrl, page.url)
      : undefined,
    googleMapsUrl: normalizeOptionalUrl(item.googleMapsUrl, page.url),
    address: item.address ? compactText(item.address, 180) : undefined,
    professionalRegistry: item.professionalRegistry ? compactText(item.professionalRegistry, 60) : undefined,
    emails: normalizeContactList(deterministicContacts.emails.length ? deterministicContacts.emails : item.emails),
    phones: normalizeContactList(deterministicContacts.phones.length ? deterministicContacts.phones : item.phones),
    whatsappNumbers: normalizeContactList(deterministicContacts.whatsappNumbers.length ? deterministicContacts.whatsappNumbers : item.whatsappNumbers),
    evidence: item.evidence ?? "Extraído por IA do agregador",
    confidence,
    extractionMethod: "ai"
  };
}

function sanitizeReviewedResult(
  reviewed: z.infer<typeof professionalResultReviewSchema>,
  resultUrl: string,
  professionalName: string,
  evidence = "",
  campaign?: Campaign
): z.infer<typeof professionalResultReviewSchema> {
  const extractedContacts = extractStructuredContacts(`${reviewed.emails.join(" ")} ${reviewed.phones.join(" ")} ${reviewed.whatsappNumbers.join(" ")}`);
  const contacts = campaign ? sanitizeContactOwnership(extractedContacts, campaign, { sourceUrl: resultUrl, professionalName, evidence }) : extractedContacts;
  const websiteUrl = isAcceptableOwnWebsiteForProfessional(reviewed.websiteUrl, professionalName, `${evidence} ${reviewed.reason}`)
    ? reviewed.websiteUrl
    : undefined;
  const instagramUrl = isAcceptableInstagramUrlForProfessional(reviewed.instagramUrl, professionalName, `${evidence} ${reviewed.reason}`)
    ? reviewed.instagramUrl
    : undefined;
  return {
    ...reviewed,
    websiteUrl,
    instagramUrl,
    emails: contacts.emails,
    phones: contacts.phones,
    whatsappNumbers: contacts.whatsappNumbers,
    address: reviewed.address ? compactText(reviewed.address, 180) : undefined,
    professionalRegistry: reviewed.professionalRegistry ? compactText(reviewed.professionalRegistry, 60) : undefined,
    googleMapsUrl: reviewed.googleMapsUrl
  };
}

async function reviewProfessionalResultPage(
  seed: ProfessionalSeed,
  result: SearchResult,
  page: CompactPage,
  campaign: Campaign,
  run?: ActiveDiscoveryRun
): Promise<z.infer<typeof professionalResultReviewSchema> | undefined> {
  const combinedText = `${result.title} ${result.snippet} ${page.title} ${page.description} ${page.text} ${page.links.map((link) => `${link.text} ${link.href}`).join(" ")}`;
  const contacts = filterContactsForCampaign(extractStructuredContacts(combinedText), campaign);
  const address = extractAddress(combinedText, campaign);
  const professionalRegistry = extractProfessionalRegistry(combinedText);
  const googleMapsUrl = page.links.find((link) => /google\.[^/]+\/maps|maps\.app\.goo\.gl/i.test(link.href))?.href;
  const resultType = isInstagramProfileUrl(result.url)
    ? "instagram"
    : isAcceptableOwnWebsiteForProfessional(result.url, seed.name, combinedText)
      ? "website"
      : isAggregatorUrl(result.url, `${result.title} ${result.snippet} ${page.title}`) || result.source === "aggregator_profile"
        ? "directory"
        : isSocialUrl(result.url)
          ? "social"
          : "other";
  const instagramUrl = isAcceptableInstagramUrlForProfessional(result.url, seed.name, `${result.title} ${result.snippet} ${page.title}`)
    ? result.url
    : page.links.find((link) => isAcceptableInstagramUrlForProfessional(link.href, seed.name, `${link.text} ${page.title} ${page.description}`))?.href;
  const websiteUrl = isAcceptableOwnWebsiteForProfessional(result.url, seed.name, combinedText)
    ? result.url
    : page.links.find((link) => isAcceptableOwnWebsiteForProfessional(link.href, seed.name, `${link.text} ${page.title} ${page.description} ${page.text}`))?.href;
  const hasUsefulSignal = hasPhoneContact(contacts)
    || contacts.emails.length > 0
    || Boolean(instagramUrl)
    || Boolean(websiteUrl)
    || Boolean(professionalRegistry)
    || Boolean(address)
    || result.source === "aggregator_profile";
  const hasNameEvidence = evidenceMatchesProfessionalName(combinedText, seed.name);
  const blocked = isBlockedOrChallengePage(result.url, page) || shouldHardSkipSearchResult(result);

  const deterministic = sanitizeReviewedResult({
    isProfessionalMatch: !blocked && hasUsefulSignal && (hasNameEvidence || result.source === "aggregator_profile" || Boolean(instagramUrl && handleMatchesProfessionalName(instagramUrl, seed.name))),
    resultType,
    websiteUrl,
    instagramUrl,
    emails: contacts.emails,
    phones: contacts.phones,
    whatsappNumbers: contacts.whatsappNumbers,
    address,
    professionalRegistry,
    googleMapsUrl,
    confidence: !blocked && hasNameEvidence ? 0.72 : !blocked && result.source === "aggregator_profile" ? 0.58 : 0.25,
    reason: blocked
      ? "Fonte bloqueada/intermediária descartada sem IA."
      : hasUsefulSignal
        ? "Extração determinística compacta."
        : "Sem sinal útil de contato/Instagram/site para este profissional."
  }, result.url, seed.name, combinedText, campaign);

  const strongEnoughWithoutAi = deterministic.isProfessionalMatch
    && deterministic.confidence >= 0.55
    && (hasPhoneContact(deterministic) || Boolean(deterministic.instagramUrl) || Boolean(deterministic.websiteUrl));
  const shouldUseAi = process.env.OPENAI_API_KEY
    && process.env.SCRAPER_AI_REVIEW_RESULTS === "true"
    && !blocked
    && hasUsefulSignal
    && !strongEnoughWithoutAi;

  if (!shouldUseAi) {
    if (run && (deterministic.isProfessionalMatch || process.env.SCRAPER_DEBUG_DETERMINISTIC_REVIEWS === "true")) {
      pushEvent(run, {
        kind: "result",
        title: deterministic.isProfessionalMatch ? "Resultado validado sem IA" : "Resultado descartado sem IA",
        leadName: seed.name,
        url: result.url,
        response: deterministic
      });
    }
    return deterministic;
  }

  const input = {
    professional: {
      name: seed.name,
      city: campaign.city,
      state: campaign.state,
      niche: campaign.niche,
      sourceProfileUrl: seed.profileUrl,
      sourceEvidence: compactText(seed.evidence, 120)
    },
    result: {
      title: compactText(result.title, 100),
      host: hostOf(result.url),
      url: compactText(result.url, 180),
      snippet: compactText(result.snippet, 120)
    },
    page: compactPageFactsForAi(page, campaign, { seed, textLimit: 650, linkLimit: 8 }),
    deterministicExtraction: {
      contacts,
      address,
      professionalRegistry,
      googleMapsUrl,
      instagramUrl,
      websiteUrl,
      resultType
    },
    output: "JSON curto; reason <= 60 chars"
  };
  if (run) {
    pushEvent(run, {
      kind: "ai_request",
      title: "IA revisando resultado ambíguo",
      leadName: seed.name,
      url: result.url,
      payload: input
    });
  }

  const hash = inputHash(input);
  const cacheKey = ["lead_search_result", normalize(seed.name), hostOf(result.url), "search_candidate_review_v3", model, promptVersion, hash].join(":");
  const cached = store.aiCache.get(cacheKey)?.outputJson;
  if (cached) {
    const parsed = sanitizeReviewedResult(professionalResultReviewSchema.parse(cached), result.url, seed.name, combinedText, campaign);
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
          "Valide resultado ambíguo. Retorne só JSON {\"isProfessionalMatch\":true,\"resultType\":\"website|instagram|directory|social|other\",\"websiteUrl\":\"...\",\"instagramUrl\":\"...\",\"emails\":[],\"phones\":[],\"whatsappNumbers\":[],\"address\":\"...\",\"professionalRegistry\":\"...\",\"googleMapsUrl\":\"...\",\"confidence\":0.75,\"reason\":\"<=60 chars\"}. websiteUrl só pode ser site institucional/pessoal do psicólogo, com domínio/conteúdo congruente ao nome. Nunca retorne Yelp, ORCID/Lattes, notícias, diretórios, agregadores, perfis em marketplaces, páginas de telefone/endereço ou páginas que apenas mencionam o nome."
      },
      { role: "user", content: JSON.stringify(input) }
    ]
  });
  const content = response.choices[0]?.message.content;
  if (!content) return deterministic;
  const parsed = sanitizeReviewedResult(professionalResultReviewSchema.parse(JSON.parse(content)), result.url, seed.name, combinedText, campaign);
  store.aiCache.set(cacheKey, {
    id: store.nextId("aiCache"),
    entityType: "lead_search_result",
    entityId: `${normalize(seed.name)}:${hostOf(result.url)}`,
    analysisType: "search_candidate_review_v3",
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
      title: "Resposta da IA sobre resultado ambíguo",
      leadName: seed.name,
      url: result.url,
      response: parsed
    });
  }
  return parsed;
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
      links: page.links.slice(0, 40),
      text: compactText(page.text, 1800)
    },
    blockedHosts: BLOCKED_OWN_WEBSITE_HOSTS,
    rule: "Identifique o link externo principal do perfil. Marque isOwnWebsite=true somente se for site institucional/pessoal do profissional, com domínio/conteúdo congruente ao nome. Nunca aceite Meta/about.meta.com, Instagram, Facebook, linktree, WhatsApp, marketplace, agregador, Yelp, ORCID/Lattes, notícia, diretório, guia ou rede social."
  };
  const hash = inputHash(input);
  const cacheKey = ["instagram_profile", page.url, "external_link_review_v2", model, promptVersion, hash].join(":");
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
          "Você analisa um perfil público de Instagram representado por JSON compacto. Retorne apenas JSON válido no formato {\"externalUrl\":\"https://...\",\"isOwnWebsite\":true,\"reason\":\"...\"}. Se não houver site próprio útil, omita externalUrl ou use isOwnWebsite=false."
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
    analysisType: "instagram_external_link_review_v2",
    model,
    promptVersion,
    inputHash: hash,
    inputJson: input,
    outputJson: parsed,
    createdAt: new Date().toISOString()
  });
  return parsed;
}

async function extractProfessionalsFromAggregator(
  candidate: RawSearchCandidate,
  campaign: Campaign,
  browser?: Browser,
  signal?: AbortSignal,
  page?: Page,
  run?: ActiveDiscoveryRun,
  profile: DiscoveryProfile = DISCOVERY_PROFILES.quick
): Promise<ProfessionalSeed[]> {
  try {
    throwIfDiscoveryStopped(signal);
    const html = await fetchHtml(candidate.url, browser, signal, page, run, "aggregator-page");
    throwIfDiscoveryStopped(signal);
    const compactedPage = compactPageFromHtml(candidate.url, html);
    if (isBlockedOrChallengePage(candidate.url, compactedPage)) {
      if (run) {
        pushEvent(run, {
          kind: "result",
          title: "Agregador ignorado por bloqueio/intermediário",
          url: candidate.url
        });
      }
      return [];
    }
    const cardSeeds = extractAggregatorCardSeeds(candidate.url, html, compactedPage, campaign, profile.maxNamesPerAggregator);
    const aiSeeds = shouldUseAiForAggregator(cardSeeds)
      ? await extractProfessionalsWithAi(compactedPage, campaign, run).catch(() => undefined)
      : undefined;
    const fallbackSeeds = cardSeeds.length || aiSeeds?.length ? [] : fallbackExtractNames(compactedPage, campaign, profile.maxNamesPerAggregator);
    const seeds = mergeDuplicateSeeds([...(cardSeeds ?? []), ...(aiSeeds ?? []), ...fallbackSeeds])
      .filter((seed) => seed.name.split(" ").length >= 2)
      .sort((a, b) => seedQualityScore(b) - seedQualityScore(a))
      .slice(0, profile.maxNamesPerAggregator);
    if (run) {
      pushEvent(run, {
        kind: "result",
        title: "Profissionais extraídos do agregador",
        url: candidate.url,
        response: seeds.map((seed) => ({
          name: seed.name,
          profileUrl: seed.profileUrl,
          websiteUrl: seed.websiteUrl,
          instagramUrl: seed.instagramUrl,
          contacts: {
            emails: seed.emails,
            phones: seed.phones,
            whatsappNumbers: seed.whatsappNumbers
          },
          professionalRegistry: seed.professionalRegistry,
          address: seed.address,
          extractionMethod: seed.extractionMethod,
          qualityScore: seedQualityScore(seed)
        }))
      });
    }
    return seeds;
  } catch (error) {
    if (isDiscoveryStopped(error)) throw error;
    return [];
  }
}

function seedFromDirectCandidate(candidate: RawSearchCandidate, campaign?: Campaign): ProfessionalSeed {
  const extractedName = extractPersonNameFromSearchTitle(candidate.title);
  const rawName = stripProfessionalPrefix(candidate.title.replace(/\s[-|].*$/, ""));
  const name = extractedName ?? (looksLikePersonName(rawName) ? rawName : compactText(candidate.title.replace(/\s[-|].*$/, ""), 90));
  const evidence = `${candidate.title} ${candidate.snippet} ${candidate.url}`;
  const contacts = campaign
    ? sanitizeContactOwnership(extractStructuredContacts(evidence), campaign, { sourceUrl: candidate.url, professionalName: name, evidence })
    : extractStructuredContacts(evidence);
  const websiteUrl = isAcceptableOwnWebsiteForProfessional(candidate.url, name, evidence) ? canonicalOwnWebsiteUrl(candidate.url) : undefined;
  const instagramUrl = isAcceptableInstagramUrlForProfessional(candidate.url, name, evidence) ? candidate.url : undefined;
  return {
    name,
    sourceUrl: candidate.url,
    sourceTitle: candidate.title,
    profileUrl: !websiteUrl && !instagramUrl && isAggregatorUrl(candidate.url, evidence) ? candidate.url : undefined,
    websiteUrl,
    instagramUrl,
    evidence: compactText(candidate.snippet || candidate.title || "Resultado direto de busca", 180),
    ...contacts,
    confidence: extractedName ? 0.55 : 0.35,
    extractionMethod: "direct"
  };
}

function chooseOwnWebsite(results: SearchResult[], professionalName: string): string | undefined {
  return results
    .map((result) => {
      const evidence = `${result.title} ${result.snippet} ${result.url}`;
      const decision = ownWebsiteCandidateDecision(result.url, professionalName, evidence);
      return { result, decision };
    })
    .filter(({ decision }) => decision.ok)
    .sort((a, b) => b.decision.score - a.decision.score)
    [0]?.result.url;
}

function chooseInstagram(results: SearchResult[], professionalName: string): string | undefined {
  return results
    .map((result) => {
      const evidence = `${result.title} ${result.snippet} ${result.url}`;
      return { result, score: instagramCandidateScore(result.url, professionalName, evidence) };
    })
    .filter(({ score }) => score >= 55)
    .sort((a, b) => b.score - a.score)
    [0]?.result.url;
}

function shouldInspectSearchResultForProfessional(seed: ProfessionalSeed, result: SearchResult, goal: "instagram" | "contact" | "website" | "any" = "any"): boolean {
  if (result.source === "aggregator_profile") return true;
  if (shouldHardSkipSearchResult(result)) return false;
  const evidence = `${result.title} ${result.snippet} ${result.url}`;
  if (goal === "instagram") return isAcceptableInstagramUrlForProfessional(result.url, seed.name, evidence);
  if (goal === "website") return isAcceptableOwnWebsiteForProfessional(result.url, seed.name, evidence) || isPotentialOwnWebsiteForProfessional(result.url, seed.name, evidence);
  if (goal === "contact") {
    if (isAcceptableInstagramUrlForProfessional(result.url, seed.name, evidence)) return false;
    if (isAcceptableOwnWebsiteForProfessional(result.url, seed.name, evidence)) return true;
    if (isAggregatorUrl(result.url, evidence)) return evidenceMatchesProfessionalName(evidence, seed.name) || /whats|telefone|contato|agendar|crp|registro/i.test(evidence);
    return evidenceMatchesProfessionalName(evidence, seed.name) && /whats|telefone|contato|agendar|crp|registro/i.test(evidence);
  }
  if (isAcceptableInstagramUrlForProfessional(result.url, seed.name, evidence)) return true;
  if (isAcceptableOwnWebsiteForProfessional(result.url, seed.name, evidence)) return true;
  if (isAggregatorUrl(result.url, evidence)) {
    return evidenceMatchesProfessionalName(evidence, seed.name) && /psic[oó]log|terapia|crp|registro|consulta|whats|telefone/i.test(evidence);
  }
  return evidenceMatchesProfessionalName(evidence, seed.name) && /psic[oó]log|terapia|crp|instagram|whats|contato|site/i.test(evidence);
}

function searchResultScore(seed: ProfessionalSeed, result: SearchResult): number {
  const evidence = `${result.title} ${result.snippet} ${result.url}`;
  const websiteDecision = ownWebsiteCandidateDecision(result.url, seed.name, evidence);
  return (result.source === "aggregator_profile" ? 60 : 0)
    + (websiteDecision.ok ? 45 + Math.round(websiteDecision.score / 5) : 0)
    + (isAcceptableInstagramUrlForProfessional(result.url, seed.name, evidence) ? 45 : 0)
    + (hasPhoneContact(extractStructuredContacts(evidence)) ? 25 : 0)
    + (evidenceMatchesProfessionalName(evidence, seed.name) ? 20 : 0)
    + (/whats|telefone|contato|agendar/i.test(evidence) ? 15 : 0)
    + (/crp|registro/i.test(evidence) ? 8 : 0)
    - (shouldHardSkipSearchResult(result) ? 1000 : 0)
    - (["directory_profile", "business_listing", "academic_profile", "news_article"].includes(websiteDecision.kind) ? 180 : 0)
    - (isAggregatorUrl(result.url, evidence) && result.source !== "aggregator_profile" ? 20 : 0);
}

async function discoverInstagramExternalLink(
  instagramUrl: string,
  professionalName: string,
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
    const aiReview = process.env.SCRAPER_AI_REVIEW_INSTAGRAM_LINK === "true"
      ? await analyzeInstagramLinkWithAi(compactedPage, run).catch(() => undefined)
      : undefined;
    if (aiReview?.externalUrl && aiReview.isOwnWebsite && isAcceptableOwnWebsiteForProfessional(aiReview.externalUrl, professionalName, compactedPage.text)) {
      return aiReview.externalUrl;
    }
    return compactedPage.links
      .find((link) => isAcceptableOwnWebsiteForProfessional(link.href, professionalName, `${link.text} ${compactedPage.text}`))?.href;
  } catch (error) {
    if (isDiscoveryStopped(error)) throw error;
    return undefined;
  }
}

function normalizeQueries(queries: string[], maxQueries: number): string[] {
  return Array.from(new Set(queries.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean))).slice(0, maxQueries);
}

function buildInstagramSearchQueries(
  seed: ProfessionalSeed,
  campaign: Campaign,
  profile: DiscoveryProfile = DISCOVERY_PROFILES.quick
): string[] {
  return normalizeQueries([
    `site:instagram.com "${seed.name}" "${campaign.city}"`,
    `site:instagram.com "${seed.name}" psicóloga`,
    `site:instagram.com "${seed.name}" psicologo`,
    `"${seed.name}" "${campaign.city}" instagram`
  ], profile.maxQueriesPerProfessional);
}

function buildPhoneSearchQueries(
  seed: ProfessionalSeed,
  campaign: Campaign,
  profile: DiscoveryProfile = DISCOVERY_PROFILES.quick
): string[] {
  return normalizeQueries([
    `"${seed.name}" "${campaign.city}" whatsapp`,
    `"${seed.name}" "${campaign.city}" telefone`,
    `"${seed.name}" "WhatsApp"`,
    `"${seed.name}" CRP ${campaign.state} telefone`
  ], profile.maxQueriesPerProfessional);
}

function buildWebsiteSearchQueries(
  seed: ProfessionalSeed,
  campaign: Campaign,
  profile: DiscoveryProfile = DISCOVERY_PROFILES.quick
): string[] {
  return normalizeQueries([
    `"${seed.name}" "${campaign.city}" "site oficial" psicóloga`,
    `"${seed.name}" "${campaign.city}" "site próprio"`,
    `"${seed.name}" psicóloga "atendimento" "${campaign.city}"`,
    `"${seed.name}" psicólogo site institucional`
  ], Math.min(3, profile.maxQueriesPerProfessional));
}

function buildGeneralEvidenceSearchQuery(seed: ProfessionalSeed, campaign: Campaign): string {
  return `"${seed.name}" "${campaign.city}" psicólogo psicóloga instagram whatsapp telefone site`;
}

function addContactsToSets(
  target: { emails: Set<string>; phones: Set<string>; whatsappNumbers: Set<string> },
  contacts: { emails?: string[]; phones?: string[]; whatsappNumbers?: string[] },
  campaign?: Campaign,
  ownership?: { sourceUrl?: string; professionalName?: string; evidence?: string; allowGenericEmailOnOwnWebsite?: boolean }
): void {
  const normalized = campaign ? sanitizeContactOwnership(contacts, campaign, ownership) : contacts;
  const sourceIsDirectory = Boolean(ownership?.sourceUrl && isDirectoryProfileUrl(ownership.sourceUrl, ownership.evidence ?? ""));
  const phoneLimit = sourceIsDirectory && (normalized.phones?.length ?? 0) > 3 ? 2 : Number.POSITIVE_INFINITY;
  const whatsappLimit = sourceIsDirectory && (normalized.whatsappNumbers?.length ?? 0) > 3 ? 2 : Number.POSITIVE_INFINITY;
  for (const email of normalized.emails ?? []) target.emails.add(email);
  const rankedPhones = campaign ? rankPhones(normalized.phones ?? [], campaign, { evidence: ownership?.evidence }) : normalizeContactList(normalized.phones);
  const rankedWhatsappNumbers = campaign ? rankPhones(normalized.whatsappNumbers ?? [], campaign, { preferWhatsapp: true, evidence: ownership?.evidence }) : normalizeContactList(normalized.whatsappNumbers);
  for (const phone of rankedPhones.slice(0, phoneLimit)) target.phones.add(phone);
  for (const phone of rankedWhatsappNumbers.slice(0, whatsappLimit)) target.whatsappNumbers.add(phone);
}

async function enrichProfessional(
  seed: ProfessionalSeed,
  campaign: Campaign,
  browser?: Browser,
  signal?: AbortSignal,
  page?: Page,
  run?: ActiveDiscoveryRun,
  profile: DiscoveryProfile = DISCOVERY_PROFILES.quick
): Promise<EnrichedProfessional> {
  throwIfDiscoveryStopped(signal);
  let searchWebsiteUrl = isAcceptableOwnWebsiteForProfessional(seed.websiteUrl, seed.name, seed.evidence) ? canonicalOwnWebsiteUrl(seed.websiteUrl) : undefined;
  let instagramUrl = isAcceptableInstagramUrlForProfessional(seed.instagramUrl, seed.name, seed.evidence) ? seed.instagramUrl : undefined;
  let address = seed.address;
  let professionalRegistry = seed.professionalRegistry;
  let googleMapsUrl = seed.googleMapsUrl;
  const emails = new Set<string>();
  const phones = new Set<string>();
  const whatsappNumbers = new Set<string>();
  const reasons: string[] = [];
  const contactEvidence = () => `${seed.evidence} ${reasons.join(" ")}`;
  const outputPhones = () => rankPhones(phones, campaign, { evidence: contactEvidence() });
  const outputWhatsappNumbers = () => rankPhones(whatsappNumbers, campaign, { preferWhatsapp: true, evidence: contactEvidence() });
  addContactsToSets({ emails, phones, whatsappNumbers }, seed, campaign, { sourceUrl: seed.sourceUrl, professionalName: seed.name, evidence: seed.evidence });

  const applyReviewed = (reviewed: z.infer<typeof professionalResultReviewSchema> | undefined, sourceText = "", sourceUrl?: string) => {
    if (!reviewed?.isProfessionalMatch || reviewed.confidence < 0.35) return;
    const reviewEvidence = `${sourceText} ${reviewed.reason}`;
    reasons.push(reviewed.reason);
    addContactsToSets({ emails, phones, whatsappNumbers }, reviewed, campaign, {
      sourceUrl: sourceUrl ?? reviewed.websiteUrl ?? seed.profileUrl ?? seed.sourceUrl,
      professionalName: seed.name,
      evidence: reviewEvidence,
      allowGenericEmailOnOwnWebsite: Boolean(sourceUrl && isAcceptableOwnWebsiteForProfessional(sourceUrl, seed.name, reviewEvidence))
    });
    address = address ?? reviewed.address;
    professionalRegistry = professionalRegistry ?? reviewed.professionalRegistry;
    googleMapsUrl = googleMapsUrl ?? reviewed.googleMapsUrl;
    if (!instagramUrl && reviewed.instagramUrl && isAcceptableInstagramUrlForProfessional(reviewed.instagramUrl, seed.name, reviewEvidence)) {
      instagramUrl = reviewed.instagramUrl;
    }
    const reviewedWebsiteCandidate = reviewed.websiteUrl && isAcceptableOwnWebsiteForProfessional(reviewed.websiteUrl, seed.name, reviewEvidence)
      ? reviewed.websiteUrl
      : undefined;
    const sourceWebsiteCandidate = reviewed.resultType === "website" && sourceUrl && isAcceptableOwnWebsiteForProfessional(sourceUrl, seed.name, reviewEvidence)
      ? sourceUrl
      : undefined;
    if (!searchWebsiteUrl && (reviewedWebsiteCandidate || sourceWebsiteCandidate)) {
      searchWebsiteUrl = canonicalOwnWebsiteUrl(reviewedWebsiteCandidate ?? sourceWebsiteCandidate!);
      reasons.push("Site próprio promovido a partir de resultado validado com nome/profissão/contato.");
    }
  };

  const inspectResults = async (goal: "instagram" | "contact" | "website" | "any", results: SearchResult[], maxResults: number) => {
    const candidates = dedupeBy(results, (result) => result.url)
      .filter((result) => shouldInspectSearchResultForProfessional(seed, result, goal))
      .sort((a, b) => searchResultScore(seed, b) - searchResultScore(seed, a))
      .slice(0, maxResults);

    for (const result of candidates) {
      throwIfDiscoveryStopped(signal);
      if (shouldHardSkipSearchResult(result)) continue;
      if (run) {
        setRunStep(run, "Inspecionando resultado filtrado", `${goal}: ${result.title}`, seed.name);
      }
      if (isAcceptableInstagramUrlForProfessional(result.url, seed.name, `${result.title} ${result.snippet}`)) {
        instagramUrl = instagramUrl ?? result.url;
        reasons.push("Instagram validado pela SERP sem scraping.");
        if (goal === "instagram") continue;
      }
      const html = await fetchHtml(result.url, browser, signal, page, run, result.source === "aggregator_profile" ? "aggregator-profile-page" : `filtered-${goal}-page`).catch(() => undefined);
      if (!html) continue;
      const compactedPage = compactPageFromHtml(result.url, html);
      if (isBlockedOrChallengePage(result.url, compactedPage)) {
        if (run) {
          pushEvent(run, {
            kind: "result",
            title: "Página intermediária/bloqueada ignorada",
            leadName: seed.name,
            url: result.url
          });
        }
        continue;
      }
      const reviewed = await reviewProfessionalResultPage(seed, result, compactedPage, campaign, run);
      applyReviewed(reviewed, `${result.title} ${result.snippet} ${compactedPage.title} ${compactedPage.description}`, result.url);
      if (hasRequiredLeadSignals({ instagramUrl, phones: Array.from(phones), whatsappNumbers: Array.from(whatsappNumbers) } as EnrichedProfessional)
        && (goal !== "website" || searchWebsiteUrl)) {
        break;
      }
    }
  };

  if (seed.profileUrl && (!instagramUrl || !hasPhoneContact({ phones: Array.from(phones), whatsappNumbers: Array.from(whatsappNumbers) }))) {
    await inspectResults("contact", [{
      title: seed.sourceTitle,
      url: seed.profileUrl,
      snippet: seed.evidence,
      source: "aggregator_profile"
    }], 1);
  }

  if (!instagramUrl || !hasPhoneContact({ phones: Array.from(phones), whatsappNumbers: Array.from(whatsappNumbers) }) || !searchWebsiteUrl) {
    const generalQuery = buildGeneralEvidenceSearchQuery(seed, campaign);
    const generalResults = (await searchDuckDuckGo(generalQuery, Math.max(profile.searchResultsPerProfessional, 6), signal, browser, page, run))
      .filter((result) => !shouldHardSkipSearchResult(result));
    if (run) {
      pushEvent(run, {
        kind: "search_results",
        title: "Busca compacta de evidências",
        leadName: seed.name,
        payload: { query: generalQuery, results: generalResults.map((item) => ({ title: item.title, url: item.url, snippet: item.snippet })) }
      });
    }
    const generalInstagram = !instagramUrl ? chooseInstagram(generalResults, seed.name) : undefined;
    if (generalInstagram) {
      instagramUrl = generalInstagram;
      reasons.push("Instagram encontrado por busca compacta de evidências.");
    }
    const generalWebsite = !searchWebsiteUrl ? chooseOwnWebsite(generalResults, seed.name) : undefined;
    if (generalWebsite) {
      searchWebsiteUrl = canonicalOwnWebsiteUrl(generalWebsite);
      reasons.push("Site próprio encontrado por busca compacta de evidências.");
    }
    if (!hasPhoneContact({ phones: Array.from(phones), whatsappNumbers: Array.from(whatsappNumbers) })) {
      await inspectResults("contact", generalResults, Math.min(2, profile.inspectedResultsPerProfessional));
    }
  }

  if (!instagramUrl) {
    const instagramResults: SearchResult[] = [];
    for (const query of buildInstagramSearchQueries(seed, campaign, profile)) {
      throwIfDiscoveryStopped(signal);
      const queryResults = await searchDuckDuckGo(query, profile.searchResultsPerProfessional, signal, browser, page, run);
      instagramResults.push(...queryResults.filter((result) => !shouldHardSkipSearchResult(result)));
      if (run) {
        pushEvent(run, {
          kind: "search_results",
          title: "Busca prioritária de Instagram",
          leadName: seed.name,
          payload: { query, results: queryResults.map((item) => ({ title: item.title, url: item.url, snippet: item.snippet })) }
        });
      }
      const found = chooseInstagram(instagramResults, seed.name);
      if (found) {
        instagramUrl = found;
        reasons.push("Instagram encontrado por busca dedicada.");
        break;
      }
    }
    if (!instagramUrl) {
      await inspectResults("instagram", instagramResults, 1);
    }
  }

  if (!instagramUrl && process.env.SCRAPER_ALLOW_LEADS_WITHOUT_INSTAGRAM !== "true") {
    const professional: EnrichedProfessional = {
      name: seed.name,
      searchWebsiteUrl,
      instagramUrl,
      finalWebsiteUrl: searchWebsiteUrl,
      emails: Array.from(emails),
      phones: outputPhones(),
      whatsappNumbers: outputWhatsappNumbers(),
      hasOwnWebsite: Boolean(searchWebsiteUrl),
      hasDirectContact: emails.size > 0 || phones.size > 0 || whatsappNumbers.size > 0,
      isReadyForLead: false,
      leadQuality: "weak_candidate",
      reason: "Descartado cedo: Instagram obrigatório não encontrado após busca dedicada.",
      sourceUrl: seed.sourceUrl,
      sourceTitle: seed.sourceTitle,
      profileUrl: seed.profileUrl,
      address,
      professionalRegistry,
      googleMapsUrl
    };
    return professional;
  }

  if (!hasPhoneContact({ phones: Array.from(phones), whatsappNumbers: Array.from(whatsappNumbers) })) {
    const phoneResults: SearchResult[] = [];
    for (const query of buildPhoneSearchQueries(seed, campaign, profile)) {
      throwIfDiscoveryStopped(signal);
      const queryResults = await searchDuckDuckGo(query, profile.searchResultsPerProfessional, signal, browser, page, run);
      phoneResults.push(...queryResults.filter((result) => !shouldHardSkipSearchResult(result)));
      if (run) {
        pushEvent(run, {
          kind: "search_results",
          title: "Busca prioritária de telefone/WhatsApp",
          leadName: seed.name,
          payload: { query, results: queryResults.map((item) => ({ title: item.title, url: item.url, snippet: item.snippet })) }
        });
      }
      await inspectResults("contact", queryResults, profile.inspectedResultsPerProfessional);
      if (hasPhoneContact({ phones: Array.from(phones), whatsappNumbers: Array.from(whatsappNumbers) })) break;
    }
  }

  if (!hasPhoneContact({ phones: Array.from(phones), whatsappNumbers: Array.from(whatsappNumbers) })) {
    const professional: EnrichedProfessional = {
      name: seed.name,
      searchWebsiteUrl,
      instagramUrl,
      finalWebsiteUrl: searchWebsiteUrl,
      emails: Array.from(emails),
      phones: outputPhones(),
      whatsappNumbers: outputWhatsappNumbers(),
      hasOwnWebsite: Boolean(searchWebsiteUrl),
      hasDirectContact: emails.size > 0 || phones.size > 0 || whatsappNumbers.size > 0,
      isReadyForLead: false,
      leadQuality: "weak_candidate",
      reason: "Descartado cedo: telefone/WhatsApp obrigatório não encontrado após busca dedicada.",
      sourceUrl: seed.sourceUrl,
      sourceTitle: seed.sourceTitle,
      profileUrl: seed.profileUrl,
      address,
      professionalRegistry,
      googleMapsUrl
    };
    return professional;
  }

  if (!searchWebsiteUrl) {
    const websiteResults: SearchResult[] = [];
    for (const query of buildWebsiteSearchQueries(seed, campaign, profile)) {
      throwIfDiscoveryStopped(signal);
      const queryResults = await searchDuckDuckGo(query, profile.searchResultsPerProfessional, signal, browser, page, run);
      websiteResults.push(...queryResults.filter((result) => !shouldHardSkipSearchResult(result)));
      if (run) {
        pushEvent(run, {
          kind: "search_results",
          title: "Busca complementar de site próprio",
          leadName: seed.name,
          payload: { query, results: queryResults.map((item) => ({ title: item.title, url: item.url, snippet: item.snippet })) }
        });
      }
      const foundWebsite = chooseOwnWebsite(websiteResults, seed.name);
      if (foundWebsite) {
        searchWebsiteUrl = canonicalOwnWebsiteUrl(foundWebsite);
        reasons.push("Site próprio encontrado por busca complementar.");
        break;
      }
      // Quando a SERP traz um domínio plausível, mas ainda não há evidência textual forte,
      // abre poucas páginas para confirmar por H1/title/body/CRP/telefone antes de descartar.
      await inspectResults("website", queryResults, 1);
      if (searchWebsiteUrl) break;
    }
  }

  const instagramExternalUrl = !searchWebsiteUrl && instagramUrl && process.env.SCRAPER_DISCOVER_INSTAGRAM_EXTERNAL_LINK === "true"
    ? await discoverInstagramExternalLink(instagramUrl, seed.name, browser, signal, page, run)
    : undefined;
  const instagramOwnSite = isAcceptableOwnWebsiteForProfessional(instagramExternalUrl, seed.name, "instagram external link") ? instagramExternalUrl : undefined;
  const finalWebsiteUrl = searchWebsiteUrl ?? instagramOwnSite;
  const baseProfessional: EnrichedProfessional = {
    name: seed.name,
    searchWebsiteUrl,
    instagramUrl,
    instagramExternalUrl,
    finalWebsiteUrl,
    emails: Array.from(emails),
    phones: outputPhones(),
    whatsappNumbers: outputWhatsappNumbers(),
    hasOwnWebsite: Boolean(finalWebsiteUrl),
    hasDirectContact: emails.size > 0 || phones.size > 0 || whatsappNumbers.size > 0,
    isReadyForLead: false,
    leadQuality: "weak_candidate",
    reason: "",
    sourceUrl: seed.sourceUrl,
    sourceTitle: seed.sourceTitle,
    profileUrl: seed.profileUrl,
    address,
    professionalRegistry,
    googleMapsUrl
  };
  const leadQuality = leadQualityFor(baseProfessional);
  const reason = leadQuality === "ready_for_outreach"
    ? reasons[0] ?? "Instagram e telefone/WhatsApp validados por pipeline dedicado."
    : leadQuality === "enrich_more"
      ? reasons[0] ?? "Canal digital encontrado, mas contato direto ainda precisa de enriquecimento."
      : "Candidato descartado: sem sinais obrigatórios de Instagram e telefone/WhatsApp.";

  return {
    ...baseProfessional,
    leadQuality,
    isReadyForLead: hasReachableChannel(baseProfessional),
    reason
  };
}

function hasRequiredLeadSignals(professional: EnrichedProfessional): boolean {
  return Boolean(professional.instagramUrl) && hasPhoneContact(professional);
}

function deterministicFinalGateBlockReason(professional: EnrichedProfessional): string | undefined {
  if (personNameScore(professional.name) < 0.65) return "Descartado: nome não parece pessoa/profissional individual.";
  // Site próprio é oportunidade complementar, não requisito do lead.
  // Se o candidato de site for agregador/diretório/notícia/perfil acadêmico, ele será limpo antes de persistir.
  if (professional.instagramUrl && !isAcceptableInstagramUrlForProfessional(professional.instagramUrl, professional.name, `${professional.sourceTitle} ${professional.reason}`)) {
    return "Descartado: Instagram não bate com o nome do profissional.";
  }
  const suspiciousSource = normalize(`${professional.sourceTitle} ${professional.sourceUrl} ${professional.profileUrl ?? ""}`);
  if (/rua |avenida |como chegar|sugerir edicao|sugerir edição|psicomotricidade relacional|centro de saude|centro de saúde/.test(suspiciousSource) && personNameScore(professional.name) < 0.85) {
    return "Descartado: fonte sugere endereço/empresa/especialidade, não pessoa individual.";
  }
  return undefined;
}

async function reviewFinalLeadGateWithAi(
  professional: EnrichedProfessional,
  campaign: Campaign,
  run?: ActiveDiscoveryRun
): Promise<EnrichedProfessional> {
  if (!hasRequiredLeadSignals(professional)) {
    const reason = !professional.instagramUrl && !hasPhoneContact(professional)
      ? "Descartado: falta Instagram pessoal/profissional validado e telefone/WhatsApp regional."
      : !professional.instagramUrl
        ? "Descartado: Instagram é obrigatório para descobrir mais sobre o profissional."
        : "Descartado: telefone ou WhatsApp é obrigatório como meio direto de contato.";
    return {
      ...professional,
      isReadyForLead: false,
      leadQuality: "weak_candidate",
      reason
    };
  }

  const deterministicBlockReason = deterministicFinalGateBlockReason(professional);
  if (deterministicBlockReason) {
    return {
      ...professional,
      isReadyForLead: false,
      leadQuality: "weak_candidate",
      reason: deterministicBlockReason
    };
  }

  if (!process.env.OPENAI_API_KEY || process.env.SCRAPER_AI_FINAL_LEAD_GATE === "false") {
    return {
      ...professional,
      isReadyForLead: true,
      leadQuality: "ready_for_outreach",
      reason: professional.reason || "Lead aprovado por regra determinística: possui Instagram e telefone/WhatsApp validado."
    };
  }

  const gateWebsiteUrl = professional.finalWebsiteUrl && isAcceptableOwnWebsiteForProfessional(professional.finalWebsiteUrl, professional.name, `${professional.sourceTitle} ${professional.reason}`)
    ? professional.finalWebsiteUrl
    : undefined;
  const input = {
    target: { niche: campaign.niche, city: campaign.city, state: campaign.state },
    professional: {
      name: professional.name,
      instagramUrl: professional.instagramUrl,
      instagramHandle: professional.instagramUrl ? instagramHandle(professional.instagramUrl) : undefined,
      phones: professional.phones.slice(0, 3),
      whatsappNumbers: professional.whatsappNumbers.slice(0, 3),
      websiteUrl: gateWebsiteUrl,
      sourceTitle: professional.sourceTitle,
      sourceHost: hostOf(professional.sourceUrl),
      profileHost: professional.profileUrl ? hostOf(professional.profileUrl) : undefined,
      professionalRegistry: professional.professionalRegistry,
      address: professional.address,
      reason: compactText(professional.reason, 120)
    },
    rules: "Aprove somente pessoa/profissional individual. Rejeite clínica, empresa, agregador, Instagram genérico, perfil que não bate com o nome, telefone de outro estado/cidade ou contato de plataforma. Instagram e telefone/WhatsApp são obrigatórios."
  };
  const hash = inputHash(input);
  const cacheKey = ["lead_final_gate", professional.name, professional.instagramUrl ?? "no-instagram", "final_lead_gate_v1", model, promptVersion, hash].join(":");
  const cached = store.aiCache.get(cacheKey)?.outputJson;
  if (cached) {
    const parsed = finalLeadDecisionSchema.parse(cached);
    return {
      ...professional,
      isReadyForLead: parsed.accept,
      leadQuality: parsed.accept ? "ready_for_outreach" : "weak_candidate",
      reason: parsed.reason || (parsed.accept ? "Lead aprovado no gate final." : "Lead descartado no gate final.")
    };
  }

  if (run) {
    pushEvent(run, {
      kind: "ai_request",
      title: "IA aplicando gate final do lead",
      leadName: professional.name,
      url: professional.instagramUrl,
      payload: input
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Gate final de lead. Retorne JSON minificado: {\"accept\":true,\"instagramIsPersonal\":true,\"hasValidPhone\":true,\"identityConfidence\":0.75,\"contactConfidence\":0.75}. Campo reason é opcional e deve ser omitido quando accept=true. Aceite apenas profissional individual com Instagram profissional/pessoal útil para abordagem e telefone/WhatsApp válido. Rejeite clínica, empresa, agregador, Meta, diretório, perfil genérico e Instagram de outro nicho como wedding/fotografia/moda/loja. Ignore websiteUrl ausente; se houver websiteUrl, ele só vale quando for site institucional/pessoal congruente ao profissional."
      },
      { role: "user", content: JSON.stringify(input) }
    ]
  });
  const content = response.choices[0]?.message.content;
  if (!content) {
    return {
      ...professional,
      isReadyForLead: false,
      leadQuality: "weak_candidate",
      reason: "Descartado: gate final de IA não retornou decisão."
    };
  }
  const rawParsed = finalLeadDecisionSchema.parse(JSON.parse(content));
  const parsed = {
    ...rawParsed,
    identityConfidence: rawParsed.accept && rawParsed.instagramIsPersonal && rawParsed.identityConfidence === 0 ? 0.7 : rawParsed.identityConfidence,
    contactConfidence: rawParsed.accept && rawParsed.hasValidPhone && rawParsed.contactConfidence === 0 ? 0.7 : rawParsed.contactConfidence
  };
  const accept = parsed.accept && parsed.instagramIsPersonal && parsed.hasValidPhone && parsed.identityConfidence >= 0.55 && parsed.contactConfidence >= 0.55;
  store.aiCache.set(cacheKey, {
    id: store.nextId("aiCache"),
    entityType: "lead_final_gate",
    entityId: `${professional.name}:${professional.instagramUrl}`,
    analysisType: "final_lead_gate_v1",
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
      title: accept ? "Lead aprovado no gate final" : "Lead descartado no gate final",
      leadName: professional.name,
      url: professional.instagramUrl,
      response: parsed
    });
  }
  return {
    ...professional,
    isReadyForLead: accept,
    leadQuality: accept ? "ready_for_outreach" : "weak_candidate",
    reason: parsed.reason || (accept ? "Lead aprovado no gate final." : "Lead descartado no gate final.")
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

function emailBelongsToProfessional(email: string, professional: EnrichedProfessional): boolean {
  const [localPart, domainPart] = email.toLowerCase().split("@");
  if (!localPart || !domainPart) return false;
  const websiteHost = professional.finalWebsiteUrl && isAcceptableOwnWebsiteForProfessional(professional.finalWebsiteUrl, professional.name, professional.reason) ? hostOf(professional.finalWebsiteUrl) : "";
  if (websiteHost && (websiteHost === domainPart || websiteHost.endsWith(`.${domainPart}`) || domainPart.endsWith(`.${websiteHost}`))) {
    return true;
  }
  const compactEmail = normalize(`${localPart} ${domainPart}`).replace(/[^a-z0-9]/g, "");
  const tokens = professionalNameTokens(professional.name);
  if (tokens.length === 0) return false;
  const matches = tokens.filter((token) => compactEmail.includes(token));
  return matches.length >= 2 || (tokens.length === 1 && matches.length === 1);
}

function leadFromProfessional(professional: EnrichedProfessional, campaign: Campaign): Lead | undefined {
  if (!professional.isReadyForLead) return undefined;
  const now = new Date().toISOString();
  const professionalEmails = professional.emails.filter((email) => emailBelongsToProfessional(email, professional));
  const verifiedWebsiteUrl = professional.finalWebsiteUrl && isAcceptableOwnWebsiteForProfessional(professional.finalWebsiteUrl, professional.name, `${professional.sourceTitle} ${professional.reason}`)
    ? professional.finalWebsiteUrl
    : undefined;
  const websiteDecision = ownWebsiteCandidateDecision(professional.finalWebsiteUrl, professional.name, `${professional.sourceTitle} ${professional.reason}`);
  const websiteStatus = professional.finalWebsiteUrl ? (verifiedWebsiteUrl ? "found" : "aggregator_only") : "not_found";
  return {
    id: store.nextId("lead"),
    campaignId: campaign.id,
    businessName: professional.name,
    personName: professional.name,
    niche: campaign.niche,
    city: campaign.city,
    state: campaign.state,
    country: campaign.country,
    professionalRegistry: professional.professionalRegistry,
    address: professional.address,
    phone: professional.phones[0],
    whatsapp: professional.whatsappNumbers[0] ?? professional.phones[0],
    email: professionalEmails[0],
    websiteUrl: verifiedWebsiteUrl,
    instagramUrl: professional.instagramUrl,
    googleMapsUrl: professional.googleMapsUrl,
    source: "professional_deep_discovery",
    rawDataJson: {
      discoveryMode: "aggregator_to_professional_deep_discovery_v3_strict_instagram_phone_gate",
      leadQuality: professional.leadQuality,
      sourceTitle: professional.sourceTitle,
      sourceUrl: professional.sourceUrl,
      profileUrl: professional.profileUrl,
      searchWebsiteUrl: verifiedWebsiteUrl,
      rejectedWebsiteCandidateUrl: verifiedWebsiteUrl ? undefined : professional.finalWebsiteUrl,
      websiteStatus,
      websiteCandidateKind: websiteDecision.kind,
      websiteCandidateScore: websiteDecision.score,
      websiteCandidateReason: websiteDecision.reason,
      aggregatorProfileUrl: professional.profileUrl,
      searchEngine: "duckduckgo",
      instagramUrl: professional.instagramUrl,
      instagramExternalUrl: professional.instagramExternalUrl,
      contacts: {
        emails: professionalEmails,
        phones: professional.phones,
        whatsappNumbers: professional.whatsappNumbers
      },
      address: professional.address,
      professionalRegistry: professional.professionalRegistry,
      googleMapsUrl: professional.googleMapsUrl,
      hasOwnWebsite: Boolean(verifiedWebsiteUrl),
      hasDirectContact: professional.hasDirectContact,
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
    url: professional.finalWebsiteUrl ?? professional.instagramUrl ?? professional.profileUrl ?? professional.sourceUrl,
    snippet: reason,
    source: "professional_deep_discovery",
    priority: professional.leadQuality === "ready_for_outreach" ? "high" : professional.leadQuality === "enrich_more" ? "medium" : "low",
    isPotentialLead: professional.leadQuality !== "weak_candidate",
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
    .filter((candidate) => !shouldHardSkipSearchResult(candidate) && !isAggregatorUrl(candidate.url, `${candidate.title} ${candidate.snippet}`))
    .map((candidate) => seedFromDirectCandidate(candidate, campaign))
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

export async function discoverCampaign(
  campaign: Campaign,
  options: { level?: DiscoverySearchLevel; targetFinalLeads?: number } = {}
) {
  const profile = resolveDiscoveryProfile(options.level, options.targetFinalLeads);
  await stopCampaignDiscovery(campaign.id);

  const controller = new AbortController();
  const run: ActiveDiscoveryRun = {
    controller,
    browser: undefined,
    snapshot: createDiscoverySnapshot(campaign.id, profile),
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
    setRunStep(run, "Iniciando descoberta", `Campanha ${campaign.name} · nível ${profile.level} · alvo ${profile.targetFinalLeads} leads finais`);
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
      await collectInitialCandidates(campaign, profile, controller.signal, browser, workflowPage, run),
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
    const sourceClassifications = await classifyInitialSourcesWithAi(campaign, collected, run, profile);
    const classifiedCandidates = collected.map((candidate, index) => ({
      candidate,
      index,
      classification: sourceClassifications.get(index) ?? deterministicSourceClassification(candidate)
    }));
    pushEvent(run, {
      kind: "result",
      title: "Fontes classificadas",
      payload: classifiedCandidates.map((item) => ({
        title: item.candidate.title,
        url: item.candidate.url,
        type: item.classification.type,
        confidence: item.classification.confidence,
        reason: item.classification.reason
      }))
    });
    const aggregatorCandidates = classifiedCandidates
      .filter((item) => !shouldHardSkipSearchResult(item.candidate))
      .filter(isUsefulAggregatorCandidate)
      .map((item) => item.candidate)
      .sort((a, b) => sourceContactScore(b) - sourceContactScore(a))
      .slice(0, profile.maxAggregatorPages);
    const directSeeds = classifiedCandidates
      .filter((item) => !shouldHardSkipSearchResult(item.candidate))
      .filter((item) => item.classification.type === "direct_professional" || item.classification.type === "social")
      .map((item) => seedFromDirectCandidate(item.candidate, campaign));

    const aggregatorSeeds: ProfessionalSeed[] = [];
    for (const candidate of aggregatorCandidates) {
      throwIfDiscoveryStopped(controller.signal);
      setRunStep(run, "Abrindo agregador", candidate.title);
      aggregatorSeeds.push(
        ...(await extractProfessionalsFromAggregator(candidate, campaign, browser, controller.signal, workflowPage, run, profile))
      );
    }

    const seeds = mergeDuplicateSeeds([...aggregatorSeeds, ...directSeeds])
      .filter((seed) => seed.name.split(" ").length >= 2 && looksLikePersonName(seed.name) && personNameScore(seed.name) >= 0.65)
      .sort((a, b) => seedQualityScore(b) - seedQualityScore(a))
      .slice(0, Math.max(profile.maxProfessionalsToReview, Math.ceil(profile.maxProfessionalsToReview * 1.8)));
    updateRunStats(run, { extractedProfessionals: seeds.length });
    pushEvent(run, {
      kind: "result",
      title: "Profissionais extraídos",
      payload: seeds.map((seed) => ({
        name: seed.name,
        sourceTitle: seed.sourceTitle,
        sourceUrl: seed.sourceUrl,
        evidence: seed.evidence,
        profileUrl: seed.profileUrl,
        websiteUrl: seed.websiteUrl,
        instagramUrl: seed.instagramUrl,
        contacts: {
          emails: seed.emails,
          phones: seed.phones,
          whatsappNumbers: seed.whatsappNumbers
        },
        professionalRegistry: seed.professionalRegistry,
        address: seed.address,
        qualityScore: seedQualityScore(seed)
      }))
    });

    const discoveryStartedAtMs = Date.now();
    let lastLeadAtMs = discoveryStartedAtMs;
    let reviewedAtLastLead = 0;
    let reviewedNewProfessionals = 0;
    let totalProfessionalsTouched = 0;
    const absoluteTouchedLimit = Math.max(profile.maxProfessionalsToReview, Math.ceil(profile.maxProfessionalsToReview * 1.8));

    const shouldStopByBudget = (): string | undefined => {
      const elapsed = Date.now() - discoveryStartedAtMs;
      if (elapsed >= profile.maxRuntimeMs) return `Tempo máximo do nível ${profile.level} atingido.`;
      if (totalProfessionalsTouched >= absoluteTouchedLimit) return `Limite absoluto de ${absoluteTouchedLimit} profissionais tocados atingido.`;
      if (insertedLeads.length === 0 && reviewedNewProfessionals >= profile.maxReviewedWithoutLead) {
        return `${profile.maxReviewedWithoutLead} profissionais novos revisados sem lead final.`;
      }
      if (reviewedNewProfessionals > reviewedAtLastLead && Date.now() - lastLeadAtMs >= profile.noLeadStallMs) {
        return `Sem novo lead por ${Math.round(profile.noLeadStallMs / 60000)} minutos.`;
      }
      return undefined;
    };

    for (const seed of seeds) {
      throwIfDiscoveryStopped(controller.signal);
      const stopReason = shouldStopByBudget();
      if (stopReason) {
        pushEvent(run, {
          kind: "result",
          title: "Watchdog encerrou a busca",
          detail: stopReason
        });
        break;
      }
      setRunStep(run, "Pesquisando profissional", seed.name, seed.name);
      const enrichedProfessional = await enrichProfessional(seed, campaign, browser, controller.signal, workflowPage, run, profile);
      const professional = await reviewFinalLeadGateWithAi(enrichedProfessional, campaign, run);
      totalProfessionalsTouched += 1;
      throwIfDiscoveryStopped(controller.signal);
      const duplicate = candidateAlreadyExists(professional);
      if (!duplicate) {
        reviewedNewProfessionals += 1;
        updateRunStats(run, { reviewed: reviewedNewProfessionals });
      } else {
        pushEvent(run, {
          kind: "result",
          title: "Duplicado ignorado no orçamento principal",
          leadName: professional.name,
          detail: "Duplicados não contam contra o limite principal de profissionais verificados do nível."
        });
      }
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
        lastLeadAtMs = Date.now();
        reviewedAtLastLead = reviewedNewProfessionals;
      }
      const candidateStatus: DiscoveryCandidate["status"] = duplicate
        ? "duplicate"
        : lead
          ? "inserted"
          : professional.leadQuality === "enrich_more"
            ? "pending"
            : "discarded";
      savedCandidates.push(saveDiscoveryCandidate(
        campaign,
        professional,
        candidateStatus,
        lead,
        duplicate ? "Candidato duplicado." : professional.reason
      ));
      const loggedWebsiteUrl = professional.finalWebsiteUrl && isAcceptableOwnWebsiteForProfessional(professional.finalWebsiteUrl, professional.name, `${professional.sourceTitle} ${professional.reason}`)
        ? professional.finalWebsiteUrl
        : undefined;
      pushEvent(run, {
        kind: "result",
        title: duplicate ? "Profissional duplicado" : lead ? "Profissional catalogado" : candidateStatus === "pending" ? "Profissional pendente para enriquecimento" : "Profissional descartado no gate final",
        leadName: seed.name,
        url: loggedWebsiteUrl ?? professional.instagramUrl ?? professional.profileUrl ?? professional.sourceUrl,
        response: {
          websiteUrl: loggedWebsiteUrl,
          websiteStatus: ownWebsiteStatus(professional.finalWebsiteUrl, professional.name, `${professional.sourceTitle} ${professional.reason}`),
          rejectedWebsiteCandidateUrl: loggedWebsiteUrl ? undefined : professional.finalWebsiteUrl,
          instagramUrl: professional.instagramUrl,
          emails: professional.emails.filter((email) => emailBelongsToProfessional(email, professional)),
          phones: professional.phones,
          whatsappNumbers: professional.whatsappNumbers,
          address: professional.address,
          professionalRegistry: professional.professionalRegistry,
          leadQuality: professional.leadQuality,
          isReadyForLead: professional.isReadyForLead,
          reason: professional.reason
        }
      });
      if (insertedLeads.length >= profile.targetFinalLeads) {
        pushEvent(run, {
          kind: "result",
          title: "Alvo do nível atingido",
          detail: `${profile.level}: ${insertedLeads.length}/${profile.targetFinalLeads} leads finais validados.`
        });
        break;
      }
    }

    run.snapshot.running = false;
    setRunStep(run, "Descoberta concluída", `${insertedLeads.length}/${profile.targetFinalLeads} leads finais validados no nível ${profile.level}`);
    recentDiscoverySnapshots.set(campaign.id, structuredClone(run.snapshot));

    return {
      collected: collected.length,
      filtered: seeds.length,
      reviewed: run.snapshot.stats.reviewed,
      inserted: insertedLeads.length,
      candidates: savedCandidates,
      leads: insertedLeads,
      meta: {
        browserMode: browser ? (isHeadlessMode() ? "headless" : "headed") : "fetch_fallback",
        searchLevel: profile.level,
        targetFinalLeads: profile.targetFinalLeads,
        aggregatorPages: aggregatorCandidates.length,
        extractedProfessionals: seeds.length,
        logDirectory: run.logger?.directory
      }
    };
  } catch (error) {
    const cancelled = isDiscoveryStopped(error);
    run.snapshot.running = false;
    pushEvent(run, {
      kind: "result",
      title: cancelled ? "Descoberta cancelada" : "Descoberta falhou",
      detail: cancelled
        ? "Execução interrompida antes da conclusão."
        : error instanceof Error ? error.message : String(error)
    });
    recentDiscoverySnapshots.set(campaign.id, structuredClone(run.snapshot));
    return {
      collected: run.snapshot.stats.collected,
      filtered: savedCandidates.length,
      reviewed: run.snapshot.stats.reviewed,
      inserted: insertedLeads.length,
      candidates: savedCandidates,
      leads: insertedLeads,
      cancelled,
      failed: !cancelled,
      error: cancelled ? undefined : error instanceof Error ? error.message : String(error),
      meta: {
        browserMode: browser ? (isHeadlessMode() ? "headless" : "headed") : "fetch_fallback",
        searchLevel: profile.level,
        targetFinalLeads: profile.targetFinalLeads,
        aggregatorPages: undefined,
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
