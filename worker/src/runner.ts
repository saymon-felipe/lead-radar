import { chromium } from "playwright";
import axios from "axios";
import * as cheerio from "cheerio";

interface ExtractedContacts {
  emails: string[];
  phones: string[];
  whatsappNumbers: string[];
}

interface CampaignInfo {
  id: number;
  name: string;
  niche: string;
  city: string;
  state: string;
  country?: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface ProfessionalSeed {
  name: string;
  sourceUrl: string;
  sourceTitle?: string;
  profileUrl?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  contacts: ExtractedContacts;
  evidence: string;
  professionalRegistry?: string;
  address?: string;
}

interface LeadDraft extends ProfessionalSeed {
  phone?: string;
  whatsapp?: string;
  email?: string;
  finalInstagramUrl?: string;
  finalWebsiteUrl?: string;
}

const EMAIL_BLOCKED_LOCAL_PARTS = new Set([
  "example",
  "email",
  "teste",
  "test",
  "noreply",
  "no-reply",
  "donotreply",
  "naoresponda",
  "privacy",
  "privacidade",
  "lgpd",
  "suporte"
]);

const EMAIL_BLOCKED_DOMAINS = [
  "example.com",
  "sentry.io",
  "w3.org",
  "schema.org",
  "facebook.com",
  "instagram.com",
  "meta.com",
  "google.com",
  "gstatic.com",
  "cloudflare.com",
  "doubleclick.net",
  "listamais.com.br",
  "doctoralia.com.br",
  "mundopsicologos.com.br",
  "mundopsicologos.com",
  "empresafone.com.br",
  "guiamais.com.br",
  "guiafacil.com",
  "todosnegocios.com",
  "acheioprofissional.com.br",
  "brfirmas.org",
  "yelp.com"
];

const DIRECTORY_HOST_PARTS = [
  "doctoralia",
  "mundopsicologos",
  "guiamais",
  "guiafacil",
  "listamais",
  "empresafone",
  "todosnegocios",
  "telelistas",
  "acheioprofissional",
  "brfirmas",
  "cnpj",
  "yelp",
  "solutudo",
  "catalogo",
  "guiatelefone",
  "qualotelefone",
  "mapadatcs"
];

const BLOCKED_HOST_PARTS = [
  "linkedin.com",
  "facebook.com",
  "youtube.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "jusbrasil",
  "escavador",
  "reclameaqui",
  "glassdoor",
  "indeed",
  "vagas.com",
  "olx.com",
  "mercadolivre"
];

const WRONG_INSTAGRAM_TERMS = [
  "wedding",
  "fotografia",
  "photography",
  "makeup",
  "maquiagem",
  "moda",
  "loja",
  "store",
  "food",
  "viagem",
  "travel",
  "arquitetura",
  "advocacia",
  "imoveis",
  "imóveis"
];

const PROFESSION_TERMS = /psic[oó]log[ao]?|psicologia|psicoterapia|terapia|terapeuta|crp|atendimento|consulta/i;
const INSTAGRAM_PROFESSION_TERMS = /\b(psi|psico|psicologa|psicólogo|psicologo|psicologia|terapia|terapeuta|crp|atendimento|consulta)\b/i;

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForCompare(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function resolveUrl(href: string | undefined, baseUrl: string): string | undefined {
  if (!href) return undefined;
  try {
    if (href.includes("uddg=")) {
      const parsed = new URL(href, "https://duckduckgo.com");
      const urlParam = parsed.searchParams.get("uddg");
      if (urlParam) return decodeURIComponent(urlParam);
    }
    const parsed = new URL(href, baseUrl);
    if (!/^https?:$/.test(parsed.protocol)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function normalizeEmail(raw: string): string | undefined {
  const email = raw.trim().replace(/^mailto:/i, "").replace(/[),.;:]+$/g, "").toLowerCase();
  const match = email.match(/^([a-z0-9._%+-]{1,64})@([a-z0-9.-]{1,190})\.([a-z]{2,12})$/i);
  if (!match) return undefined;
  const [, local, domain, tld] = match;
  if (EMAIL_BLOCKED_LOCAL_PARTS.has(local)) return undefined;
  const fullDomain = `${domain}.${tld}`.toLowerCase();
  if (EMAIL_BLOCKED_DOMAINS.some((blocked) => fullDomain === blocked || fullDomain.endsWith(`.${blocked}`))) return undefined;
  if (/(.)\1{5,}/.test(local) || /(.)\1{5,}/.test(fullDomain)) return undefined;
  return email;
}

export function normalizePhoneNumber(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return undefined;
  const normalized = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits
    : digits.length === 10 || digits.length === 11
      ? digits
      : undefined;
  if (!normalized) return undefined;
  if (/^(\d)\1+$/.test(normalized)) return undefined;
  const national = normalized.startsWith("55") ? normalized.slice(2) : normalized;
  if (national.length !== 10 && national.length !== 11) return undefined;
  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) return undefined;
  const subscriber = national.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) return undefined;
  return normalized;
}

function extractPhoneCandidates(text: string): string[] {
  const candidates = text.match(/(?:\+?55[\s().-]*)?(?:\(?\d{2}\)?[\s.-]*)?(?:9\s*)?\d{4}[\s.-]?\d{4}/g) ?? [];
  return unique(candidates.map((item) => normalizePhoneNumber(item)).filter((item): item is string => Boolean(item)));
}

function extractExplicitWhatsappNumbers(text: string): string[] {
  const numbers: string[] = [];
  const patterns = [
    /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp:\/\/send\?phone=)(\+?\d{10,15})/gi,
    /(?:whatsapp|whats|zap|chamar no whatsapp|agendar pelo whatsapp)[^\d+]{0,60}(\+?55?[\s().-]*\(?\d{2}\)?[\s.-]*(?:9\s*)?\d{4}[\s.-]?\d{4})/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const normalized = normalizePhoneNumber(match[1] ?? match[0]);
      if (normalized) numbers.push(normalized);
    }
  }
  return unique(numbers);
}

export function extractContacts(text: string): ExtractedContacts {
  const cleaned = normalizeWhitespace(text);
  const emails = unique(
    (cleaned.match(/[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,190}\.[A-Z]{2,12}/gi) ?? [])
      .map((email) => normalizeEmail(email))
      .filter((email): email is string => Boolean(email))
  );
  const phones = extractPhoneCandidates(cleaned);
  const whatsappNumbers = extractExplicitWhatsappNumbers(cleaned);
  return { emails, phones, whatsappNumbers };
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

function isLikelyPersonName(raw: string): boolean {
  const value = normalizeWhitespace(raw.replace(/^(dr\.?|dra\.?|psic[oó]loga?|psic[oó]logo)\s+/i, ""));
  const normalized = normalizeForCompare(value);
  if (!value || value.length < 5 || value.length > 80) return false;
  if (/\b(rua|avenida|av|bairro|centro|curitiba|londrina|sao paulo|são paulo|cristo rei|batel|bigorrilho|como chegar|ver telefone|solicitar exclusao|agendar|endereco|endereço|clinica|clínica|instituto|espaco|espaço|associacao|associação|hospital|unidade)\b/i.test(normalized)) return false;
  if (/\b(e|ou|de|da|do|das|dos)$/i.test(normalized)) return false;
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 6) return false;
  const capitalized = tokens.filter((token) => /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+$/.test(token) || /^(de|da|do|das|dos|e)$/i.test(token));
  return capitalized.length >= Math.max(2, tokens.length - 1);
}

function extractNameFromEvidence(text: string): string | undefined {
  const cleaned = normalizeWhitespace(text);
  const patterns = [
    /(?:Dra?\.?\s*)?([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+(?:de|da|do|das|dos|e|[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+)){1,5})\s*[-|–—,]?\s*(?:Psic[oó]log[ao]|CRP|Psicologia)/,
    /(?:Psic[oó]log[ao]\s+)(?:Dra?\.?\s*)?([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+(?:de|da|do|das|dos|e|[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+)){1,5})/i,
    /^([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+(?:de|da|do|das|dos|e|[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+)){1,5})$/
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const name = match?.[1]?.trim();
    if (name && isLikelyPersonName(name)) return name;
  }
  return undefined;
}

function mergeContacts(...items: ExtractedContacts[]): ExtractedContacts {
  return {
    emails: unique(items.flatMap((item) => item.emails)),
    phones: unique(items.flatMap((item) => item.phones)),
    whatsappNumbers: unique(items.flatMap((item) => item.whatsappNumbers))
  };
}

function isDirectoryUrl(url: string): boolean {
  const host = hostOf(url);
  return DIRECTORY_HOST_PARTS.some((part) => host.includes(part));
}

function isBlockedResult(url: string): boolean {
  const host = hostOf(url);
  return BLOCKED_HOST_PARTS.some((part) => host.includes(part));
}

function isInstagramProfileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (!host.endsWith("instagram.com")) return false;
    const path = parsed.pathname.split("/").filter(Boolean);
    if (path.length !== 1) return false;
    return !["p", "reel", "reels", "stories", "explore", "accounts", "about", "developer"].includes(path[0].toLowerCase());
  } catch {
    return false;
  }
}

function instagramEvidenceScore(url: string, evidence: string, name: string): number {
  const normalized = normalizeForCompare(`${url} ${evidence}`);
  const tokens = professionalNameTokens(name);
  let score = 0;
  for (const token of tokens) {
    if (normalized.includes(token)) score += 20;
  }
  if (INSTAGRAM_PROFESSION_TERMS.test(normalized)) score += 35;
  if (evidenceMatchesName(evidence, name) && PROFESSION_TERMS.test(evidence)) score += 35;
  if (WRONG_INSTAGRAM_TERMS.some((term) => normalized.includes(term))) score -= 80;
  return score;
}

function isProfessionalInstagram(url: string, evidence: string, name: string): boolean {
  if (!isInstagramProfileUrl(url)) return false;
  return instagramEvidenceScore(url, evidence, name) >= 45;
}

function looksLikeOwnWebsite(url: string, name: string, evidence: string): boolean {
  const host = hostOf(url);
  if (!host || isDirectoryUrl(url) || isBlockedResult(url) || host.includes("instagram.com")) return false;
  const normalizedEvidence = normalizeForCompare(evidence);
  const compactHost = host.replace(/[^a-z0-9]/g, "");
  const tokens = professionalNameTokens(name);
  const hostTokenMatches = tokens.filter((token) => compactHost.includes(token)).length;
  const hasPsiDomain = /(psi|psico|psicolog|terapia)/i.test(compactHost);
  if (hostTokenMatches >= 1 && (hasPsiDomain || hostTokenMatches >= 2)) return true;
  return evidenceMatchesName(normalizedEvidence, name) && PROFESSION_TERMS.test(normalizedEvidence) && /(whats|telefone|contato|crp|atendimento|consulta)/i.test(normalizedEvidence);
}

function canonicalWebsiteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/`;
  } catch {
    return url;
  }
}

function selectOfficialEmail(emails: string[], name: string, websiteUrl?: string, sourceUrl?: string): string | undefined {
  const siteHost = websiteUrl ? hostOf(websiteUrl) : "";
  const sourceHost = sourceUrl ? hostOf(sourceUrl) : "";
  const sourceIsDirectory = DIRECTORY_HOST_PARTS.some((part) => sourceHost.includes(part));
  const tokens = professionalNameTokens(name);

  const scored = unique(emails).map((email) => {
    const parts = email.toLowerCase().split("@");
    if (parts.length !== 2) return { email, score: -1000 };
    const [local, domain] = parts;
    let score = 0;
    if (EMAIL_BLOCKED_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) score -= 1000;
    if (EMAIL_BLOCKED_LOCAL_PARTS.has(local)) score -= 1000;
    if (siteHost && (domain === siteHost || domain.endsWith(`.${siteHost}`))) score += 70;
    if (/(psi|psico|psicolog|terapia)/i.test(domain)) score += 35;
    if (tokens.some((token) => domain.replace(/[^a-z0-9]/g, "").includes(token))) score += 35;
    if (["contato", "atendimento", "comercial"].includes(local) && !siteHost && !/(psi|psico|psicolog|terapia)/i.test(domain)) score -= 40;
    if (sourceIsDirectory && !(siteHost && (domain === siteHost || domain.endsWith(`.${siteHost}`))) && !/(psi|psico|psicolog|terapia)/i.test(domain)) score -= 80;
    return { email, score };
  }).filter((item) => item.score >= 20).sort((a, b) => b.score - a.score);

  return scored[0]?.email;
}

function rankPhones(phones: string[], campaign: CampaignInfo, evidence = ""): string[] {
  const cityDdds: Record<string, string[]> = {
    londrina: ["43"],
    cambé: ["43"],
    cambe: ["43"],
    curitiba: ["41"],
    maringa: ["44"],
    maringá: ["44"]
  };
  const expected = cityDdds[normalizeForCompare(campaign.city)] ?? [];
  return unique(phones).sort((a, b) => phoneScore(b, expected, evidence) - phoneScore(a, expected, evidence));
}

function phoneScore(phone: string, expectedDdds: string[], evidence: string): number {
  const national = phone.startsWith("55") ? phone.slice(2) : phone;
  const ddd = national.slice(0, 2);
  const subscriber = national.slice(2);
  let score = 0;
  if (expectedDdds.includes(ddd)) score += 50;
  if (subscriber.length === 9 && subscriber.startsWith("9")) score += 25;
  if (/whats|zap|agendar|contato|telefone/i.test(evidence)) score += 15;
  return score;
}

function extractInstagramUrlsFromHtml($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const urls: string[] = [];
  $("a[href]").each((_, element) => {
    const href = resolveUrl($(element).attr("href"), baseUrl);
    if (href && isInstagramProfileUrl(href)) urls.push(href);
  });
  return unique(urls);
}

function extractProfessionalRegistry(text: string): string | undefined {
  return text.match(/CRP\s*[:\-]?\s*\d{2}\/?\d{3,6}/i)?.[0]?.trim();
}

function extractAddress(text: string): string | undefined {
  return text.match(/(?:Rua|Avenida|Av\.?|Alameda|Travessa)\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][^\n|•]{8,120}/i)?.[0]?.trim();
}

function extractSeedsFromPage(html: string, pageUrl: string, campaign: CampaignInfo): ProfessionalSeed[] {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,iframe,footer,nav").remove();
  const selectors = "article, li, section, div[class*='card'], div[class*='result'], div[class*='profile'], div[class*='professional'], div[class*='doctor'], div[class*='item']";
  const seeds: ProfessionalSeed[] = [];

  $(selectors).each((_, element) => {
    const block = $(element);
    const text = normalizeWhitespace(block.text());
    if (text.length < 60 || text.length > 1800) return;
    if (!PROFESSION_TERMS.test(text) && !/(whats|telefone|crp)/i.test(text)) return;
    if (/cadastre|login|entrar|pol[ií]tica de privacidade|termos de uso/i.test(text)) return;

    const contacts = extractContacts(`${text} ${block.find("a").map((__, a) => `${$(a).text()} ${$(a).attr("href") || ""}`).get().join(" ")}`);
    const nameFromHeading = block.find("h1,h2,h3,h4,[itemprop='name'],.name,[class*='name']").map((__, h) => normalizeWhitespace($(h).text())).get().find((candidate) => isLikelyPersonName(candidate));
    const name = nameFromHeading || extractNameFromEvidence(text);
    if (!name) return;

    const links = block.find("a[href]").map((__, a) => {
      const href = resolveUrl($(a).attr("href"), pageUrl);
      return href ? { text: normalizeWhitespace($(a).text()), href } : undefined;
    }).get().filter((item): item is { text: string; href: string } => Boolean(item));
    const instagramUrl = links.find((link) => isInstagramProfileUrl(link.href))?.href;
    const profileUrl = links.find((link) => !isBlockedResult(link.href) && (isDirectoryUrl(link.href) || hostOf(link.href) === hostOf(pageUrl)))?.href;
    const websiteUrl = links.find((link) => looksLikeOwnWebsite(link.href, name, `${link.text} ${text}`))?.href;

    seeds.push({
      name,
      sourceUrl: pageUrl,
      profileUrl,
      websiteUrl,
      instagramUrl,
      contacts,
      evidence: text.slice(0, 900),
      professionalRegistry: extractProfessionalRegistry(text),
      address: extractAddress(text)
    });
  });

  return Array.from(new Map(seeds.map((seed) => [normalizeForCompare(seed.name), seed])).values());
}

function seedFromSearchResult(result: SearchResult, campaign: CampaignInfo): ProfessionalSeed | undefined {
  const evidence = `${result.title} ${result.snippet}`;
  const name = extractNameFromEvidence(evidence);
  if (!name) return undefined;
  return {
    name,
    sourceUrl: result.url,
    sourceTitle: result.title,
    profileUrl: isDirectoryUrl(result.url) ? result.url : undefined,
    websiteUrl: looksLikeOwnWebsite(result.url, name, evidence) ? result.url : undefined,
    instagramUrl: isProfessionalInstagram(result.url, evidence, name) ? result.url : undefined,
    contacts: extractContacts(evidence),
    evidence,
    professionalRegistry: extractProfessionalRegistry(evidence),
    address: extractAddress(evidence)
  };
}

function targetForLevel(level: string, limit?: number) {
  if (level === "nano") return 5;
  if (level === "quick") return Math.min(limit ?? 10, 10);
  if (level === "medium") return Math.min(limit ?? 30, 30);
  if (level === "deep") return Math.min(limit ?? 60, 60);
  return Math.min(limit ?? 10, 10);
}

function searchProfile(level: string, limit?: number) {
  const target = targetForLevel(level, limit);
  return {
    targetFinalLeads: target,
    initialSearchLimit: level === "nano" ? 3 : level === "deep" ? 8 : level === "medium" ? 6 : 4,
    maxSerpResultsPerQuery: level === "nano" ? 10 : 12,
    maxAggregatorPages: level === "nano" ? 4 : level === "deep" ? 14 : level === "medium" ? 10 : 6,
    maxDirectPages: level === "nano" ? 4 : level === "deep" ? 20 : level === "medium" ? 14 : 8,
    maxSeeds: level === "nano" ? 24 : level === "deep" ? 240 : level === "medium" ? 120 : 55,
    maxMinutes: level === "nano" ? 12 : level === "deep" ? 150 : level === "medium" ? 60 : 22
  };
}

export async function runDiscovery(
  runId: number,
  level: string,
  limit: number | undefined,
  token: string,
  apiBaseUrl: string,
  signal: AbortSignal
) {
  let sequence = 1;
  let browser: any = null;

  const client = axios.create({
    baseURL: apiBaseUrl,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000
  });

  const sendEvent = async (kind: string, title: string, leadName?: string, url?: string, payload?: any) => {
    try {
      await client.post(`/api/workers/runs/${runId}/events`, {
        sequence: sequence++,
        kind,
        title,
        leadName,
        url,
        payload: payload || {}
      });
    } catch (err: any) {
      console.error("Failed to send event to backend:", err.message);
    }
  };

  const checkAbort = () => {
    if (signal.aborted) throw new Error("DISCOVERY_ABORTED");
  };

  try {
    checkAbort();
    await sendEvent("state_change", "Iniciando worker local", undefined, undefined, { level, limit });

    const runRes = await client.post(`/api/workers/runs/${runId}/claim`, {});
    const campaign = runRes.data.campaign as CampaignInfo;
    const profile = searchProfile(level, limit);
    const startedAt = Date.now();

    const isExpired = () => Date.now() - startedAt > profile.maxMinutes * 60_000;

    await sendEvent("state_change", "Campanha identificada", undefined, undefined, {
      campaignName: campaign.name,
      niche: campaign.niche,
      city: campaign.city,
      targetFinalLeads: profile.targetFinalLeads
    });

    browser = await chromium.launch({ headless: false, slowMo: 80 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const duckSearch = async (query: string, maxResults = profile.maxSerpResultsPerQuery): Promise<SearchResult[]> => {
      checkAbort();
      await sendEvent("state_change", `Pesquisando: ${query}`, undefined, undefined, { query });
      await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });
      const content = await page.content();
      const $ = cheerio.load(content);
      const results: SearchResult[] = [];
      $(".result, .web-result, .results_links, .result__body").each((_, element) => {
        const block = $(element);
        const anchor = block.find("a.result__a, a.result-link, a[href]").first();
        const title = normalizeWhitespace(anchor.text() || block.find("h2,h3").first().text());
        const href = resolveUrl(anchor.attr("href"), "https://duckduckgo.com");
        const snippet = normalizeWhitespace(block.find(".result__snippet, .snippet, .result__body").text() || block.text()).slice(0, 500);
        if (title && href && !results.some((result) => result.url === href)) {
          results.push({ title, url: href, snippet });
        }
      });
      const filtered = results.filter((result) => !isBlockedResult(result.url)).slice(0, maxResults);
      await sendEvent("search_results", `Resultados encontrados: ${filtered.length}`, undefined, undefined, { query, results: filtered.slice(0, 8) });
      return filtered;
    };

    const inspectPage = async (url: string): Promise<{ html: string; text: string; title: string; h1: string; contacts: ExtractedContacts; instagramUrls: string[] }> => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 18000 });
      const html = await page.content();
      const title = await page.title().catch(() => "");
      const text = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
      const h1 = await page.evaluate(() => document.querySelector("h1")?.textContent || "").catch(() => "");
      const $ = cheerio.load(html);
      return {
        html,
        text: normalizeWhitespace(text),
        title,
        h1: normalizeWhitespace(h1 || ""),
        contacts: extractContacts(`${text} ${html.slice(0, 50000)}`),
        instagramUrls: extractInstagramUrlsFromHtml($, url)
      };
    };

    const initialQueries = [
      `${campaign.niche} ${campaign.city} ${campaign.state} psicólogos whatsapp instagram telefone`,
      `${campaign.niche} ${campaign.city} ${campaign.state} doctoralia mundo psicologos guia telefone`,
      `site:instagram.com ${campaign.city} ${campaign.state} ${campaign.niche} psicologa psicologo`,
      `"${campaign.niche}" "${campaign.city}" "WhatsApp" "Instagram"`,
      `"${campaign.niche}" "${campaign.city}" "CRP" "telefone"`
    ].slice(0, profile.initialSearchLimit);

    const allResults: SearchResult[] = [];
    for (const query of initialQueries) {
      if (isExpired()) break;
      try {
        allResults.push(...await duckSearch(query));
      } catch (err: any) {
        await sendEvent("error", "Falha na busca inicial", undefined, undefined, { query, error: err.message });
      }
      await page.waitForTimeout(600);
    }

    const uniqueResults = Array.from(new Map(allResults.map((result) => [result.url, result])).values());
    await sendEvent("state_change", `${uniqueResults.length} resultados únicos coletados`, undefined, undefined, { total: uniqueResults.length });

    for (const result of uniqueResults.slice(0, Math.max(profile.targetFinalLeads * 4, 12))) {
      try {
        await client.post(`/api/workers/runs/${runId}/candidates`, {
          externalId: `cand_${Buffer.from(result.url).toString("base64").slice(0, 32)}`,
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          source: isDirectoryUrl(result.url) ? "directory" : isInstagramProfileUrl(result.url) ? "instagram" : "duckduckgo",
          localSignals: {
            hasPhone: extractContacts(result.snippet).phones.length > 0,
            hasWhatsapp: /whats|zap/i.test(result.snippet),
            hasEmail: /@/.test(result.snippet),
            looksLikeDirectory: isDirectoryUrl(result.url),
            looksLikeMarketplace: false,
            looksLikeJobPost: /vaga|emprego|contrata/i.test(result.snippet)
          }
        });
      } catch (err: any) {
        console.error("Failed to ingest candidate:", err.message);
      }
    }

    const seeds: ProfessionalSeed[] = [];
    for (const result of uniqueResults) {
      const seed = seedFromSearchResult(result, campaign);
      if (seed) seeds.push(seed);
    }

    const aggregatorResults = uniqueResults.filter((result) => isDirectoryUrl(result.url) || /guia|lista|telefone|psic[oó]logos em|profissionais/i.test(`${result.title} ${result.snippet}`));
    for (const result of aggregatorResults.slice(0, profile.maxAggregatorPages)) {
      if (isExpired()) break;
      try {
        await sendEvent("state_change", "Abrindo agregador/listagem", undefined, result.url, { title: result.title });
        const inspected = await inspectPage(result.url);
        seeds.push(...extractSeedsFromPage(inspected.html, result.url, campaign));
      } catch (err: any) {
        await sendEvent("error", "Falha ao abrir agregador", undefined, result.url, { error: err.message });
      }
      await page.waitForTimeout(500);
    }

    const directResults = uniqueResults.filter((result) => !isDirectoryUrl(result.url) && !isInstagramProfileUrl(result.url) && !isBlockedResult(result.url));
    for (const result of directResults.slice(0, profile.maxDirectPages)) {
      if (isExpired()) break;
      try {
        await sendEvent("state_change", "Inspecionando site direto", undefined, result.url, { title: result.title });
        const inspected = await inspectPage(result.url);
        const evidence = `${result.title} ${result.snippet} ${inspected.title} ${inspected.h1} ${inspected.text.slice(0, 1200)}`;
        const name = extractNameFromEvidence(evidence);
        if (name) {
          seeds.push({
            name,
            sourceUrl: result.url,
            sourceTitle: result.title,
            websiteUrl: looksLikeOwnWebsite(result.url, name, evidence) ? canonicalWebsiteUrl(result.url) : undefined,
            instagramUrl: inspected.instagramUrls.find((url) => isProfessionalInstagram(url, evidence, name)),
            contacts: inspected.contacts,
            evidence: evidence.slice(0, 1000),
            professionalRegistry: extractProfessionalRegistry(evidence),
            address: extractAddress(evidence)
          });
        }
      } catch (err: any) {
        await sendEvent("error", "Falha ao abrir site direto", undefined, result.url, { error: err.message });
      }
      await page.waitForTimeout(500);
    }

    const dedupedSeeds = Array.from(new Map(seeds.filter((seed) => isLikelyPersonName(seed.name)).map((seed) => [normalizeForCompare(seed.name), seed])).values()).slice(0, profile.maxSeeds);
    await sendEvent("state_change", `${dedupedSeeds.length} profissionais extraídos para validação local`, undefined, undefined, { total: dedupedSeeds.length });

    const findInstagramForName = async (name: string): Promise<string | undefined> => {
      const queries = [
        `site:instagram.com "${name}" "${campaign.city}" psicologa psicologo`,
        `site:instagram.com "${name}" psicologia terapia CRP`,
        `"${name}" "${campaign.city}" Instagram psicóloga`
      ];
      for (const query of queries) {
        const results = await duckSearch(query, 6);
        const ranked = results
          .filter((result) => isInstagramProfileUrl(result.url))
          .map((result) => ({ result, score: instagramEvidenceScore(result.url, `${result.title} ${result.snippet}`, name) }))
          .filter((item) => item.score >= 45)
          .sort((a, b) => b.score - a.score);
        if (ranked[0]) return ranked[0].result.url;
      }
      return undefined;
    };

    const enrichContactsAndWebsite = async (draft: LeadDraft): Promise<LeadDraft> => {
      const queries = [
        `"${draft.name}" "${campaign.city}" psicólogo whatsapp telefone site`,
        `"${draft.name}" "${campaign.city}" CRP telefone`,
        `"${draft.name}" psicóloga contato whatsapp`
      ];
      let bestWebsite = draft.websiteUrl;
      let contacts = draft.contacts;
      let instagram = draft.finalInstagramUrl || draft.instagramUrl;
      for (const query of queries) {
        if ((contacts.phones.length || contacts.whatsappNumbers.length) && instagram && bestWebsite) break;
        const results = await duckSearch(query, 5);
        for (const result of results.slice(0, 3)) {
          if (isBlockedResult(result.url)) continue;
          if (isInstagramProfileUrl(result.url)) {
            if (!instagram && isProfessionalInstagram(result.url, `${result.title} ${result.snippet}`, draft.name)) instagram = result.url;
            continue;
          }
          if (!looksLikeOwnWebsite(result.url, draft.name, `${result.title} ${result.snippet}`) && isDirectoryUrl(result.url)) continue;
          try {
            const inspected = await inspectPage(result.url);
            const evidence = `${result.title} ${result.snippet} ${inspected.title} ${inspected.h1} ${inspected.text.slice(0, 1500)}`;
            if (!evidenceMatchesName(evidence, draft.name)) continue;
            contacts = mergeContacts(contacts, inspected.contacts);
            const candidateInstagram = inspected.instagramUrls.find((url) => isProfessionalInstagram(url, evidence, draft.name));
            if (!instagram && candidateInstagram) instagram = candidateInstagram;
            if (!bestWebsite && looksLikeOwnWebsite(result.url, draft.name, evidence)) {
              bestWebsite = canonicalWebsiteUrl(result.url);
            }
          } catch {
            // continue with next result
          }
        }
      }
      const rankedPhones = rankPhones([...contacts.whatsappNumbers, ...contacts.phones], campaign, draft.evidence);
      return {
        ...draft,
        contacts,
        finalInstagramUrl: instagram,
        finalWebsiteUrl: bestWebsite,
        whatsapp: rankPhones(contacts.whatsappNumbers, campaign, draft.evidence)[0] || rankedPhones[0],
        phone: rankedPhones[0],
        email: selectOfficialEmail(contacts.emails, draft.name, bestWebsite, draft.sourceUrl)
      };
    };

    let inserted = 0;
    let updated = 0;
    let accepted = 0;
    for (const seed of dedupedSeeds) {
      if (inserted >= profile.targetFinalLeads || isExpired()) break;
      checkAbort();
      await sendEvent("state_change", "Validando profissional", seed.name, seed.sourceUrl, { hasPhone: seed.contacts.phones.length > 0, hasInstagram: Boolean(seed.instagramUrl) });

      let draft: LeadDraft = {
        ...seed,
        finalInstagramUrl: seed.instagramUrl,
        finalWebsiteUrl: seed.websiteUrl,
        whatsapp: rankPhones(seed.contacts.whatsappNumbers, campaign, seed.evidence)[0],
        phone: rankPhones([...seed.contacts.whatsappNumbers, ...seed.contacts.phones], campaign, seed.evidence)[0],
        email: selectOfficialEmail(seed.contacts.emails, seed.name, seed.websiteUrl, seed.sourceUrl)
      };

      if (!draft.finalInstagramUrl) {
        try {
          draft.finalInstagramUrl = await findInstagramForName(seed.name);
        } catch (err: any) {
          await sendEvent("error", "Falha ao buscar Instagram", seed.name, undefined, { error: err.message });
        }
      }

      if (!draft.phone || !draft.whatsapp || !draft.finalWebsiteUrl) {
        draft = await enrichContactsAndWebsite(draft);
      }

      if (!draft.finalInstagramUrl || (!draft.phone && !draft.whatsapp)) {
        await sendEvent("result", "Profissional descartado: faltou Instagram ou telefone/WhatsApp", seed.name, seed.sourceUrl, {
          hasInstagram: Boolean(draft.finalInstagramUrl),
          hasPhone: Boolean(draft.phone || draft.whatsapp)
        });
        continue;
      }

      try {
        await sendEvent("debug", "Enviando lead validado para API", seed.name, draft.finalInstagramUrl, {
          phone: draft.phone,
          whatsapp: draft.whatsapp,
          email: draft.email || null,
          websiteUrl: draft.finalWebsiteUrl || null,
          target: profile.targetFinalLeads,
          inserted,
          updated,
          accepted
        });
        const response = await client.post(`/api/workers/runs/${runId}/leads`, {
          externalId: `worker_${normalizeForCompare(seed.name).replace(/\s+/g, "_")}_${Date.now()}`,
          name: seed.name,
          personName: seed.name,
          niche: campaign.niche,
          city: campaign.city,
          state: campaign.state,
          country: campaign.country || "BR",
          phone: draft.phone,
          whatsapp: draft.whatsapp || draft.phone,
          email: draft.email,
          websiteUrl: draft.finalWebsiteUrl,
          instagramUrl: draft.finalInstagramUrl,
          sourceUrl: seed.profileUrl || seed.sourceUrl,
          source: "worker-discovery",
          professionalRegistry: draft.professionalRegistry,
          address: draft.address,
          rawData: {
            evidence: draft.evidence,
            contacts: draft.contacts,
            profileUrl: seed.profileUrl,
            websiteStatus: draft.finalWebsiteUrl ? "found" : "not_found"
          }
        });
        const created = response.data.created === true || response.data.duplicate === false;
        inserted = Number(response.data.insertedCount ?? (created ? inserted + 1 : inserted));
        updated = Number(response.data.updatedCount ?? (created ? updated : updated + 1));
        accepted = Number(response.data.acceptedCount ?? inserted + updated);
        await sendEvent("result", created ? "Lead novo validado e inserido no banco" : "Lead duplicado validado e atualizado", seed.name, draft.finalInstagramUrl, {
          leadId: response.data.leadId,
          created,
          duplicate: !created,
          insertedCount: inserted,
          updatedCount: updated,
          acceptedCount: accepted,
          target: response.data.target || profile.targetFinalLeads,
          phone: draft.phone,
          websiteUrl: draft.finalWebsiteUrl || null,
          score: response.data.score || null
        });
        if (inserted >= profile.targetFinalLeads) break;
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
        await sendEvent("error", "Backend recusou lead validado", seed.name, draft.finalInstagramUrl, {
          error: errorMessage,
          status: err.response?.status || null
        });
        if (err.response?.status === 409) break;
      }
    }

    checkAbort();
    await client.post(`/api/workers/runs/${runId}/complete`, {});
    await sendEvent("state_change", "Busca concluída com sucesso", undefined, undefined, { inserted, updated, accepted, target: profile.targetFinalLeads });
  } catch (err: any) {
    console.error("Runner aborted or failed:", err.message);
    if (err.message === "DISCOVERY_ABORTED") {
      await sendEvent("state_change", "Busca interrompida pelo usuário.", undefined, undefined, {});
    } else {
      await client.post(`/api/workers/runs/${runId}/fail`, { error: err.message }).catch(() => undefined);
      await sendEvent("error", "Corrida falhou por erro interno", undefined, undefined, { error: err.message });
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
