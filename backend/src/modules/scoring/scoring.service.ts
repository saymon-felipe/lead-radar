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
  const normalizedCity = lead.city
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const isStrategicRegion = ["londrina", "cambe", "maringa"].includes(normalizedCity);

  const items: ScoreBreakdownItem[] = [
    {
      key: "active_document",
      label: "CNPJ ativo",
      points: 25,
      applied: lead.documentStatus?.toLowerCase() === "active" || lead.documentStatus?.toLowerCase() === "ativo"
    },
    {
      key: "professional_registry",
      label: "Registro profissional encontrado",
      points: 15,
      applied: hasValue(lead.professionalRegistry)
    },
    {
      key: "no_website",
      label: "Sem site próprio",
      points: 25,
      applied: !hasWebsite
    },
    {
      key: "only_social_or_linktree",
      label: "Depende de Instagram ou Linktree",
      points: 10,
      applied: !hasWebsite && (hasValue(lead.instagramUrl) || JSON.stringify(lead.rawDataJson ?? {}).toLowerCase().includes("linktree"))
    },
    {
      key: "google_maps",
      label: "Aparece no Google Maps",
      points: 10,
      applied: hasValue(lead.googleMapsUrl)
    },
    {
      key: "public_whatsapp",
      label: "WhatsApp público encontrado",
      points: 10,
      applied: hasValue(lead.whatsapp)
    },
    {
      key: "bad_website",
      label: "Site ruim, lento ou desatualizado",
      points: 15,
      applied: hasWebsite && Boolean(signals.isSlow || signals.isOutdated)
    },
    {
      key: "no_ssl",
      label: "Site sem SSL",
      points: 5,
      applied: hasWebsite && signals.hasSsl === false
    },
    {
      key: "no_cta",
      label: "Site sem CTA claro",
      points: 10,
      applied: hasWebsite && signals.hasCta === false
    },
    {
      key: "no_whatsapp_cta",
      label: "Site sem WhatsApp visível",
      points: 10,
      applied: hasWebsite && signals.hasWhatsappCta === false
    },
    {
      key: "no_seo_meta",
      label: "Site sem meta title ou description",
      points: 5,
      applied: hasWebsite && (signals.hasSeoTitle === false || signals.hasMetaDescription === false)
    },
    {
      key: "strategic_region",
      label: "Região estratégica",
      points: 5,
      applied: isStrategicRegion
    }
  ];

  const objectiveScore = clampScore(items.filter((item) => item.applied).reduce((sum, item) => sum + item.points, 0));
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
    { value: objectiveScore, weight: 0.5 },
    { value: aiCommercialScore, weight: 0.3 },
    { value: digitalPresenceScore, weight: 0.1 },
    { value: embeddingSimilarityScore, weight: 0.1 }
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
    scoreBreakdownJson: items
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
