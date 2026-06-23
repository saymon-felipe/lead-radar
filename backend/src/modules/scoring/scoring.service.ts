import type { Lead, LeadScore, RecommendedOffer, ScoreBreakdownItem, Temperature } from "../../shared/types.js";
import { prisma } from "../../shared/prisma.js";
import { serializeScore } from "../../shared/http/serializers.js";

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function classifyTemperature(score: number): Temperature {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "medium";
  if (score >= 20) return "cold";
  return "discard";
}

function recommendedOfferForLead(
  lead: Lead,
  objectiveScore: number,
  latestWebsiteReview?: Record<string, unknown>,
  latestSocialReview?: Record<string, unknown>
): RecommendedOffer {
  const websiteOpportunity = latestWebsiteReview?.commercialOpportunity;
  if (typeof websiteOpportunity === "string" && websiteOpportunity !== "none") {
    return websiteOpportunity as RecommendedOffer;
  }

  const socialOpportunity = latestSocialReview?.opportunity;
  if (socialOpportunity === "digital_presence_organization") {
    return "digital_presence_organization";
  }

  if (typeof socialOpportunity === "string" && socialOpportunity !== "none") {
    return socialOpportunity as RecommendedOffer;
  }

  if (!hasValue(lead.websiteUrl)) return "landing_page";
  if (lead.websiteSignals?.isSlow || lead.websiteSignals?.isOutdated || lead.websiteSignals?.hasCta === false) {
    return "redesign";
  }
  if (objectiveScore >= 45) return "seo_local";
  return "no_offer";
}

function scoreItems(items: ScoreBreakdownItem[]): number {
  return clampScore(items.filter((item) => item.applied).reduce((sum, item) => sum + item.points, 0));
}

function normalizedCity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function calculateObjectiveScore(
  lead: Lead,
  components: {
    digitalPresenceScore?: number;
    aiCommercialScore?: number;
    embeddingSimilarityScore?: number;
    latestWebsiteReview?: Record<string, unknown>;
    latestSocialReview?: Record<string, unknown>;
  } = {}
): Pick<
  LeadScore,
  | "objectiveScore"
  | "aiCommercialScore"
  | "digitalPresenceScore"
  | "embeddingSimilarityScore"
  | "finalScore"
  | "temperature"
  | "recommendedOffer"
  | "scoreBreakdownJson"
> {
  const hasWebsite = hasValue(lead.websiteUrl);
  const signals = lead.websiteSignals ?? {};
  const raw = lead.rawDataJson ?? {};
  const rawText = JSON.stringify(raw).toLowerCase();
  const isStrategicRegion = ["londrina", "cambe", "cambé", "maringa", "maringá"].includes(normalizedCity(lead.city));
  const hasOwnEmail = hasValue(lead.email) && !/(atendimento|contato|suporte|comercial)@(?:listamais|doctoralia|mundopsicologos|empresafone|guia|agenda|melhores)/i.test(String(lead.email));
  const hasWhatsapp = hasValue(lead.whatsapp);
  const hasPhone = hasValue(lead.phone);
  const hasInstagram = hasValue(lead.instagramUrl);
  const hasAggregatorProfile = hasValue((raw as Record<string, unknown>).aggregatorProfileUrl) || hasValue((raw as Record<string, unknown>).profileUrl);
  const hasOnlySocialOrAggregator = !hasWebsite && (hasInstagram || hasAggregatorProfile || rawText.includes("aggregator"));

  const contactabilityItems: ScoreBreakdownItem[] = [
    { key: "contact_whatsapp", label: "WhatsApp público encontrado", points: 35, applied: hasWhatsapp },
    { key: "contact_phone", label: "Telefone público encontrado", points: 25, applied: hasPhone },
    { key: "contact_instagram", label: "Instagram validado", points: 30, applied: hasInstagram },
    { key: "contact_own_email", label: "Email próprio do profissional", points: 10, applied: hasOwnEmail }
  ];

  const identityItems: ScoreBreakdownItem[] = [
    { key: "identity_person_name", label: "Nome pessoal do profissional", points: 25, applied: hasValue(lead.personName) && lead.personName === lead.businessName },
    { key: "identity_instagram", label: "Instagram associado ao profissional", points: 25, applied: hasInstagram },
    { key: "identity_city", label: "Cidade confirmada", points: 15, applied: hasValue(lead.city) },
    { key: "identity_niche", label: "Nicho/atuação confirmado", points: 15, applied: hasValue(lead.niche) },
    { key: "identity_registry", label: "Registro profissional encontrado", points: 10, applied: hasValue(lead.professionalRegistry) },
    { key: "identity_address", label: "Endereço encontrado", points: 10, applied: hasValue(lead.address) }
  ];

  const opportunityItems: ScoreBreakdownItem[] = [
    { key: "opp_no_own_website", label: "Sem site próprio encontrado", points: 30, applied: !hasWebsite },
    { key: "opp_social_or_aggregator_only", label: "Depende de Instagram/agregador", points: 25, applied: hasOnlySocialOrAggregator },
    { key: "opp_bad_website", label: "Site ruim, lento ou desatualizado", points: 20, applied: hasWebsite && Boolean(signals.isSlow || signals.isOutdated) },
    { key: "opp_no_cta", label: "Site sem CTA claro", points: 10, applied: hasWebsite && signals.hasCta === false },
    { key: "opp_no_whatsapp_cta", label: "Site sem WhatsApp visível", points: 10, applied: hasWebsite && signals.hasWhatsappCta === false },
    { key: "opp_no_seo_meta", label: "Site sem SEO básico", points: 5, applied: hasWebsite && (signals.hasSeoTitle === false || signals.hasMetaDescription === false) },
    { key: "opp_google_maps", label: "Aparece no Google Maps", points: 5, applied: hasValue(lead.googleMapsUrl) },
    { key: "opp_strategic_region", label: "Região estratégica", points: 5, applied: isStrategicRegion }
  ];

  const contactabilityScore = scoreItems(contactabilityItems);
  const identityScore = scoreItems(identityItems);
  const opportunityScore = scoreItems(opportunityItems);
  const objectiveScore = clampScore(contactabilityScore * 0.35 + identityScore * 0.35 + opportunityScore * 0.3);

  const digitalPresenceScore =
    typeof components.digitalPresenceScore === "number" ? clampScore(components.digitalPresenceScore) : undefined;
  const aiCommercialScore =
    typeof components.aiCommercialScore === "number" ? clampScore(components.aiCommercialScore) : undefined;
  const embeddingSimilarityScore =
    typeof components.embeddingSimilarityScore === "number" ? clampScore(components.embeddingSimilarityScore) : undefined;

  const weightedComponents = [
    { value: objectiveScore, weight: 0.65 },
    { value: aiCommercialScore, weight: 0.2 },
    { value: digitalPresenceScore, weight: 0.1 },
    { value: embeddingSimilarityScore, weight: 0.05 }
  ].filter((component): component is { value: number; weight: number } => typeof component.value === "number");
  const totalWeight = weightedComponents.reduce((sum, component) => sum + component.weight, 0);
  const finalScore = clampScore(
    weightedComponents.reduce((sum, component) => sum + component.value * component.weight, 0) / totalWeight
  );

  return {
    objectiveScore,
    aiCommercialScore,
    digitalPresenceScore,
    embeddingSimilarityScore,
    finalScore,
    temperature: classifyTemperature(finalScore),
    recommendedOffer: recommendedOfferForLead(
      lead,
      objectiveScore,
      components.latestWebsiteReview,
      components.latestSocialReview
    ),
    scoreBreakdownJson: [
      { key: "contactability_score", label: `Contactability: ${contactabilityScore}/100`, points: contactabilityScore, applied: true },
      { key: "identity_score", label: `Identidade: ${identityScore}/100`, points: identityScore, applied: true },
      { key: "opportunity_score", label: `Oportunidade: ${opportunityScore}/100`, points: opportunityScore, applied: true },
      ...contactabilityItems,
      ...identityItems,
      ...opportunityItems
    ]
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

async function loadScoreComponents(organizationId: number, leadId: number) {
  const [digitalPresence, latestAiReview, profileEmbedding, latestWebsite, latestSocial] = await Promise.all([
    prisma.leadDigitalPresence.findFirst({ where: { organizationId, leadId } }),
    prisma.leadAiReview.findFirst({
      where: { organizationId, leadId, analysisType: "lead_final_review" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.leadEmbedding.findFirst({
      where: { organizationId, leadId, embeddingType: "lead_profile" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.leadWebsiteSnapshot.findFirst({
      where: { organizationId, leadId },
      orderBy: { createdAt: "desc" }
    }),
    prisma.leadSocialSnapshot.findFirst({
      where: { organizationId, leadId },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const digitalScores = [digitalPresence?.websiteQualityScore, digitalPresence?.socialPresenceScore].filter(
    (score): score is number => typeof score === "number"
  );
  const aiOutput = asRecord(latestAiReview?.outputJson);
  const embeddingMetadata = asRecord(profileEmbedding?.metadataJson);

  return {
    digitalPresenceScore: digitalScores.length
      ? clampScore(digitalScores.reduce((sum, score) => sum + score, 0) / digitalScores.length)
      : undefined,
    aiCommercialScore:
      typeof aiOutput?.aiCommercialScore === "number" ? clampScore(aiOutput.aiCommercialScore) : undefined,
    embeddingSimilarityScore:
      typeof embeddingMetadata?.idealSimilarityScore === "number"
        ? clampScore(embeddingMetadata.idealSimilarityScore)
        : undefined,
    latestWebsiteReview: asRecord(latestWebsite?.aiReviewJson),
    latestSocialReview: asRecord(latestSocial?.aiReviewJson)
  };
}

export async function createOrUpdateObjectiveScore(lead: Lead): Promise<LeadScore> {
  const calculated = calculateObjectiveScore(
    lead,
    await loadScoreComponents(lead.organizationId, lead.id)
  );
  const current = await prisma.leadScore.findFirst({
    where: { organizationId: lead.organizationId, leadId: lead.id },
    orderBy: { updatedAt: "desc" }
  });

  const score = current
    ? await prisma.leadScore.update({
        where: { id: current.id },
        data: calculated as any
      })
    : await prisma.leadScore.create({
        data: {
          organizationId: lead.organizationId,
          leadId: lead.id,
          ...(calculated as any)
        }
      });

  return serializeScore(score);
}

export async function latestScoreForLead(organizationId: number, leadId: number): Promise<LeadScore | undefined> {
  const score = await prisma.leadScore.findFirst({
    where: { organizationId, leadId },
    orderBy: { updatedAt: "desc" }
  });
  return score ? serializeScore(score) : undefined;
}
