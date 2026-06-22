export interface ExtractedContacts {
  emails: string[];
  phones: string[];
  whatsappNumbers: string[];
}

const EMAIL_BLOCKED_LOCAL_PARTS = new Set([
  "example",
  "email",
  "teste",
  "test",
  "noreply",
  "no-reply",
  "donotreply",
  "naoresponda"
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
  "doubleclick.net"
];

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeEmail(raw: string): string | undefined {
  const email = raw.trim().replace(/^mailto:/i, "").replace(/[),.;:]+$/g, "").toLowerCase();
  const match = email.match(/^([a-z0-9._%+-]{1,64})@([a-z0-9.-]{1,190})\.([a-z]{2,12})$/i);
  if (!match) return undefined;
  const [, local, domain, tld] = match;
  if (EMAIL_BLOCKED_LOCAL_PARTS.has(local)) return undefined;
  const fullDomain = `${domain}.${tld}`.toLowerCase();
  if (EMAIL_BLOCKED_DOMAINS.some((blocked) => fullDomain === blocked || fullDomain.endsWith(`.${blocked}`))) return undefined;
  if (/\.(png|jpe?g|gif|webp|svg|css|js|json|map)$/i.test(email)) return undefined;
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
    /(?:whatsapp|whats|zap|chamar no whatsapp|agendar pelo whatsapp)[^\d+]{0,40}(\+?55?[\s().-]*\(?\d{2}\)?[\s.-]*(?:9\s*)?\d{4}[\s.-]?\d{4})/gi
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
