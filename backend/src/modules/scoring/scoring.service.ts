import type { Lead, LeadScore, RecommendedOffer, ScoreBreakdownItem, Temperature } from "../../shared/types.js";
import { store } from "../../shared/store/memory-store.js";

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

export function recommendedOfferForLead(lead: Lead, objectiveScore: number): RecommendedOffer {
  const latestWebsite = Array.from(store.websiteSnapshots.values())
    .filter((snapshot) => snapshot.leadId === lead.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const latestSocial = Array.from(store.socialSnapshots.values())
    .filter((snapshot) => snapshot.leadId === lead.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (latestWebsite?.aiReview?.commercialOpportunity && latestWebsite.aiReview.commercialOpportunity !== "none") {
    return latestWebsite.aiReview.commercialOpportunity;
  }

  if (latestSocial?.aiReview?.opportunity === "digital_presence_organization") {
    return "digital_presence_organization";
  }

  if (latestSocial?.aiReview?.opportunity && latestSocial.aiReview.opportunity !== "none") {
    return latestSocial.aiReview.opportunity;
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

export function calculateObjectiveScore(lead: Lead): Pick<
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

  const digitalPresence = Array.from(store.digitalPresence.values()).find((presence) => presence.leadId === lead.id);
  const digitalScores = [digitalPresence?.websiteQualityScore, digitalPresence?.socialPresenceScore].filter(
    (score): score is number => typeof score === "number"
  );
  const digitalPresenceScore = digitalScores.length
    ? clampScore(digitalScores.reduce((sum, score) => sum + score, 0) / digitalScores.length)
    : undefined;
  const latestAiReview = Array.from(store.aiReviews.values())
    .filter((review) => review.leadId === lead.id && review.analysisType === "lead_final_review")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const aiCommercialScore = typeof latestAiReview?.outputJson.aiCommercialScore === "number"
    ? clampScore(latestAiReview.outputJson.aiCommercialScore)
    : undefined;
  const profileEmbedding = Array.from(store.embeddings.values())
    .filter((embedding) => embedding.leadId === lead.id && embedding.embeddingType === "lead_profile")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const embeddingSimilarityScore = typeof profileEmbedding?.metadataJson?.idealSimilarityScore === "number"
    ? clampScore(profileEmbedding.metadataJson.idealSimilarityScore)
    : undefined;

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
    recommendedOffer: recommendedOfferForLead(lead, objectiveScore),
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

export function createOrUpdateObjectiveScore(lead: Lead): LeadScore {
  const current = Array.from(store.scores.values()).find((score) => score.leadId === lead.id);
  const now = new Date().toISOString();
  const calculated = calculateObjectiveScore(lead);

  const score: LeadScore = {
    id: current?.id ?? store.nextId("score"),
    leadId: lead.id,
    ...calculated,
    createdAt: current?.createdAt ?? now,
    updatedAt: now
  };

  store.scores.set(score.id, score);
  return score;
}

export function latestScoreForLead(leadId: number): LeadScore | undefined {
  return Array.from(store.scores.values())
    .filter((score) => score.leadId === leadId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
