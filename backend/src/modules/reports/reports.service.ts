import { store } from "../../shared/store/memory-store.js";
import type {
  CampaignValidationReport,
  CommercialInteraction,
  DimensionReport,
  Lead,
  LeadScore,
  RecommendedOffer,
  ScoreWeightVersion,
  Temperature
} from "../../shared/types.js";
import { latestScoreForLead } from "../scoring/scoring.service.js";

const RESPONSE_STATUSES = ["replied", "interested", "meeting_scheduled", "proposal_sent", "won"];
const INTEREST_STATUSES = ["interested", "meeting_scheduled", "proposal_sent", "won"];
const MEETING_STATUSES = ["meeting_scheduled", "proposal_sent", "won"];
const PROPOSAL_STATUSES = ["proposal_sent", "won"];
const CONTACTED_STATUSES = ["contacted", ...RESPONSE_STATUSES, "lost", "no_response", "invalid_contact"];

function percentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function latestInteractionForLead(leadId: number): CommercialInteraction | undefined {
  return Array.from(store.interactions.values())
    .filter((interaction) => interaction.leadId === leadId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function scoreBand(score?: LeadScore): string {
  const value = score?.finalScore ?? 0;
  if (value >= 80) return "80-100";
  if (value >= 60) return "60-79";
  if (value >= 40) return "40-59";
  if (value >= 20) return "20-39";
  return "0-19";
}

function leadRows(campaignId?: number) {
  return Array.from(store.leads.values())
    .filter((lead) => campaignId === undefined || lead.campaignId === campaignId)
    .map((lead) => ({
      lead,
      score: latestScoreForLead(lead.id),
      interaction: latestInteractionForLead(lead.id)
    }));
}

function buildReport(key: string, rows: Array<{ lead: Lead; score?: LeadScore; interaction?: CommercialInteraction }>): DimensionReport {
  const contacted = rows.filter((row) => row.interaction && CONTACTED_STATUSES.includes(row.interaction.status)).length;
  const replied = rows.filter((row) => row.interaction && RESPONSE_STATUSES.includes(row.interaction.status)).length;
  const interested = rows.filter((row) => row.interaction && INTEREST_STATUSES.includes(row.interaction.status)).length;
  const meetings = rows.filter((row) => row.interaction && MEETING_STATUSES.includes(row.interaction.status)).length;
  const proposals = rows.filter((row) => row.interaction && PROPOSAL_STATUSES.includes(row.interaction.status)).length;
  const won = rows.filter((row) => row.interaction?.status === "won").length;
  const lost = rows.filter((row) => row.interaction?.status === "lost").length;
  const noResponse = rows.filter((row) => row.interaction?.status === "no_response").length;

  return {
    key,
    leads: rows.length,
    contacted,
    replied,
    interested,
    meetings,
    proposals,
    won,
    lost,
    noResponse,
    responseRate: percentage(replied, contacted),
    conversionRate: percentage(won, contacted),
    estimatedRevenue: won * 597
  };
}

function groupBy(keySelector: (row: { lead: Lead; score?: LeadScore; interaction?: CommercialInteraction }) => string, campaignId?: number) {
  const groups = new Map<string, Array<{ lead: Lead; score?: LeadScore; interaction?: CommercialInteraction }>>();
  for (const row of leadRows(campaignId)) {
    const key = keySelector(row) || "sem_dado";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries())
    .map(([key, rows]) => buildReport(key, rows))
    .sort((a, b) => b.conversionRate - a.conversionRate || b.responseRate - a.responseRate || b.leads - a.leads);
}

function offerLabel(value: RecommendedOffer | string): string {
  const labels: Record<string, string> = {
    landing_page: "landing page",
    institutional_site: "site institucional",
    redesign: "redesign",
    seo_local: "SEO local",
    maintenance: "manutenção",
    no_offer: "sem oferta",
    digital_presence_organization: "organização da presença digital"
  };
  return labels[value] ?? value;
}

export function commercialReport(campaignId?: number) {
  const rows = leadRows(campaignId);
  const all = buildReport("total", rows);
  const aiReviews = Array.from(store.aiReviews.values()).filter((review) => {
    if (campaignId === undefined) return true;
    const lead = review.leadId ? store.leads.get(review.leadId) : undefined;
    return lead?.campaignId === campaignId;
  });
  const tokensUsed = aiReviews.reduce((sum, review) => sum + (review.tokensInput ?? 0) + (review.tokensOutput ?? 0), 0);
  const aiCost = aiReviews.reduce((sum, review) => sum + (review.costEstimate ?? 0), 0);
  const qualifiedLeads = rows.filter((row) => row.score && ["hot", "warm"].includes(row.score.temperature)).length;
  const discoveryCandidates = Array.from(store.discoveryCandidates.values()).filter(
    (candidate) => campaignId === undefined || candidate.campaignId === campaignId
  );
  const lostNotes = rows
    .filter((row) => row.interaction?.status === "lost" && row.interaction.notes)
    .map((row) => row.interaction?.notes ?? "")
    .slice(0, 10);

  const byNiche = groupBy((row) => row.lead.niche, campaignId);
  const byCity = groupBy((row) => row.lead.city, campaignId);
  const byScoreBand = groupBy((row) => scoreBand(row.score), campaignId);
  const byOffer = groupBy((row) => row.score?.recommendedOffer ?? "no_offer", campaignId);
  const byChannel = groupBy((row) => row.interaction?.contactChannel ?? "sem_canal", campaignId);
  const byTemperature = groupBy((row) => row.score?.temperature ?? "sem_score", campaignId);

  return {
    summary: {
      ...all,
      validLeads: rows.length,
      discardedCandidates: discoveryCandidates.filter((candidate) => candidate.status === "discarded").length,
      hotLeads: rows.filter((row) => row.score?.temperature === "hot").length,
      warmLeads: rows.filter((row) => row.score?.temperature === "warm").length,
      mediumLeads: rows.filter((row) => row.score?.temperature === "medium").length,
      coldLeads: rows.filter((row) => row.score?.temperature === "cold").length,
      leadsWithWebsite: rows.filter((row) => row.lead.websiteUrl).length,
      leadsWithoutWebsite: rows.filter((row) => !row.lead.websiteUrl).length,
      leadsWithWhatsapp: rows.filter((row) => row.lead.whatsapp).length,
      leadsWithInstagram: rows.filter((row) => row.lead.instagramUrl).length,
      leadsWithGoogleMaps: rows.filter((row) => row.lead.googleMapsUrl).length,
      tokensUsed,
      aiCostEstimate: aiCost,
      aiCostPerQualifiedLead: qualifiedLeads > 0 ? Number((aiCost / qualifiedLeads).toFixed(4)) : 0,
      averageTicket: all.won > 0 ? Math.round(all.estimatedRevenue / all.won) : 0
    },
    byNiche,
    byCity,
    byScoreBand,
    byOffer,
    byChannel,
    byTemperature,
    bestNiche: byNiche[0]?.key,
    bestCity: byCity[0]?.key,
    bestScoreBand: byScoreBand[0]?.key,
    bestOffer: byOffer[0]?.key,
    lossReasons: lostNotes,
    nextCampaignSuggestions: suggestNextCampaigns(byNiche, byCity, byOffer)
  };
}

function suggestNextCampaigns(byNiche: DimensionReport[], byCity: DimensionReport[], byOffer: DimensionReport[]): string[] {
  const suggestions: string[] = [];
  if (byNiche[0]) suggestions.push(`Priorizar nicho ${byNiche[0].key} se houver volume suficiente.`);
  if (byCity[0]) suggestions.push(`Expandir ou repetir campanha em ${byCity[0].key}.`);
  if (byOffer[0]) suggestions.push(`Testar oferta ${offerLabel(byOffer[0].key)} como ângulo principal.`);
  if (!suggestions.length) suggestions.push("Coletar mais contatos manuais antes de ajustar nicho, oferta ou score.");
  return suggestions;
}

export function validationReport(campaignId: number): CampaignValidationReport {
  const rows = leadRows(campaignId);
  const scores = rows.map((row) => row.score).filter(Boolean);
  const contacted = rows.filter((row) => row.interaction && CONTACTED_STATUSES.includes(row.interaction.status)).length;
  const replies = rows.filter((row) => row.interaction && RESPONSE_STATUSES.includes(row.interaction.status)).length;
  const wonDeals = rows.filter((row) => row.interaction?.status === "won").length;
  const hotWarm = scores.filter((score) => score && ["hot", "warm"].includes(score.temperature)).length;
  const collectedLeads = rows.length;
  const estimatedRevenue = wonDeals * 597;

  let interpretation = "Coletar e contatar mais leads antes de decidir.";
  let recommendedDecision: CampaignValidationReport["recommendedDecision"] = "continue_niche";

  if (wonDeals >= 2 && contacted >= 50) {
    interpretation = "Canal forte: duas ou mais vendas em contatos qualificados.";
    recommendedDecision = "continue_niche";
  } else if (wonDeals >= 1 && contacted >= 50) {
    interpretation = "Canal potencialmente viável: houve venda com contatos qualificados.";
    recommendedDecision = "continue_niche";
  } else if (collectedLeads >= 300 && contacted >= 50 && wonDeals === 0) {
    interpretation = "Sem vendas com volume relevante: revisar nicho, oferta, mensagem ou scoring.";
    recommendedDecision = replies >= 8 ? "adjust_offer" : "adjust_message";
  } else if (contacted >= 50 && replies < 5) {
    interpretation = "Poucas respostas: revisar abordagem, qualidade dos leads ou mensagem.";
    recommendedDecision = "adjust_message";
  } else if (replies >= 8 && wonDeals === 0) {
    interpretation = "Há respostas sem venda: revisar oferta, preço ou diagnóstico.";
    recommendedDecision = "adjust_offer";
  } else if (hotWarm < 50 && collectedLeads >= 300) {
    interpretation = "Poucos leads hot/warm: revisar scoring e filtros de qualificação.";
    recommendedDecision = "adjust_scoring";
  }

  return {
    campaignId,
    collectedLeads,
    reviewedHotWarm: hotWarm,
    manualContacts: contacted,
    replies,
    wonDeals,
    estimatedRevenue,
    minimumSaleTargetMet: wonDeals >= 1,
    strongChannelTargetMet: wonDeals >= 2,
    interpretation,
    recommendedDecision,
    checklist: [
      { label: "Leads coletados", current: collectedLeads, target: 300, done: collectedLeads >= 300 },
      { label: "Leads hot/warm revisados", current: hotWarm, target: 50, done: hotWarm >= 50 },
      { label: "Contatos manuais", current: contacted, target: 50, done: contacted >= 50 },
      { label: "Meta mínima de vendas", current: wonDeals, target: 1, done: wonDeals >= 1 },
      { label: "Meta boa de vendas", current: wonDeals, target: 2, done: wonDeals >= 2 }
    ]
  };
}

export function scoreCalibrationSuggestion(): ScoreWeightVersion {
  const report = commercialReport();
  const temperature = report.byTemperature;
  const hot = temperature.find((item) => item.key === "hot");
  const warm = temperature.find((item) => item.key === "warm");
  const rationale: string[] = [];
  const weights = {
    objective: 0.5,
    aiCommercial: 0.3,
    digitalPresence: 0.1,
    embeddingSimilarity: 0.1
  };

  if ((hot?.conversionRate ?? 0) < (warm?.conversionRate ?? 0)) {
    weights.objective = 0.45;
    weights.aiCommercial = 0.25;
    weights.digitalPresence = 0.15;
    weights.embeddingSimilarity = 0.15;
    rationale.push("Leads warm converteram melhor que hot; aumentar peso de sinais digitais e semânticos.");
  }

  if ((report.summary.leadsWithoutWebsite > report.summary.leadsWithWebsite) && report.summary.won > 0) {
    rationale.push("Ausencia de site aparece como sinal relevante para oferta de landing page.");
  }

  if (!rationale.length) {
    rationale.push("Volume ainda insuficiente para alterar pesos com confiança; manter pesos atuais.");
  }

  const version: ScoreWeightVersion = {
    id: store.nextId("scoreWeightVersion"),
    version: `suggested-${new Date().toISOString()}`,
    weights,
    rationale,
    createdAt: new Date().toISOString()
  };
  store.scoreWeightVersions.set(version.id, version);
  return version;
}

export function latestScoreWeightVersions() {
  return Array.from(store.scoreWeightVersions.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
