import { prisma } from "../../shared/prisma.js";
import { serializeInteraction, serializeLead, serializeScore } from "../../shared/http/serializers.js";
import type {
  CampaignValidationReport,
  CommercialInteraction,
  DimensionReport,
  Lead,
  LeadScore,
  RecommendedOffer,
  ScoreWeightVersion
} from "../../shared/types.js";

const RESPONSE_STATUSES = ["replied", "interested", "meeting_scheduled", "proposal_sent", "won"];
const INTEREST_STATUSES = ["interested", "meeting_scheduled", "proposal_sent", "won"];
const MEETING_STATUSES = ["meeting_scheduled", "proposal_sent", "won"];
const PROPOSAL_STATUSES = ["proposal_sent", "won"];
const CONTACTED_STATUSES = ["contacted", ...RESPONSE_STATUSES, "lost", "no_response", "invalid_contact"];

function percentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function scoreBand(score?: LeadScore): string {
  const value = score?.finalScore ?? 0;
  if (value >= 80) return "80-100";
  if (value >= 60) return "60-79";
  if (value >= 40) return "40-59";
  if (value >= 20) return "20-39";
  return "0-19";
}

type ReportRow = { lead: Lead; score?: LeadScore; interaction?: CommercialInteraction };

async function leadRows(organizationId: number, campaignId?: number): Promise<ReportRow[]> {
  const leads = await prisma.lead.findMany({
    where: { organizationId, ...(campaignId ? { campaignId } : {}) },
    include: {
      scores: { orderBy: { updatedAt: "desc" }, take: 1 },
      interactions: { orderBy: { updatedAt: "desc" }, take: 1 }
    }
  });

  return leads.map((lead) => ({
    lead: serializeLead(lead),
    score: lead.scores[0] ? serializeScore(lead.scores[0]) : undefined,
    interaction: lead.interactions[0] ? serializeInteraction(lead.interactions[0]) : undefined
  }));
}

function buildReport(key: string, rows: ReportRow[]): DimensionReport {
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

function groupBy(rows: ReportRow[], keySelector: (row: ReportRow) => string) {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const key = keySelector(row) || "sem_dado";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries())
    .map(([key, groupedRows]) => buildReport(key, groupedRows))
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

function suggestNextCampaigns(byNiche: DimensionReport[], byCity: DimensionReport[], byOffer: DimensionReport[]): string[] {
  const suggestions: string[] = [];
  if (byNiche[0]) suggestions.push(`Priorizar nicho ${byNiche[0].key} se houver volume suficiente.`);
  if (byCity[0]) suggestions.push(`Expandir ou repetir campanha em ${byCity[0].key}.`);
  if (byOffer[0]) suggestions.push(`Testar oferta ${offerLabel(byOffer[0].key)} como ângulo principal.`);
  if (!suggestions.length) suggestions.push("Coletar mais contatos manuais antes de ajustar nicho, oferta ou score.");
  return suggestions;
}

export async function commercialReport(organizationId: number, campaignId?: number) {
  const rows = await leadRows(organizationId, campaignId);
  const all = buildReport("total", rows);
  const aiReviews = await prisma.leadAiReview.findMany({
    where: { organizationId, ...(campaignId ? { lead: { campaignId, organizationId } } : {}) }
  });
  const tokensUsed = aiReviews.reduce((sum, review) => sum + (review.tokensInput ?? 0) + (review.tokensOutput ?? 0), 0);
  const aiCost = aiReviews.reduce((sum, review) => sum + Number(review.costEstimate ?? 0), 0);
  const qualifiedLeads = rows.filter((row) => row.score && ["hot", "warm"].includes(row.score.temperature)).length;
  const discardedCandidates = await prisma.discoveryCandidate.count({
    where: { organizationId, status: "discarded", ...(campaignId ? { campaignId } : {}) }
  });
  const lostNotes = rows
    .filter((row) => row.interaction?.status === "lost" && row.interaction.notes)
    .map((row) => row.interaction?.notes ?? "")
    .slice(0, 10);

  const byNiche = groupBy(rows, (row) => row.lead.niche);
  const byCity = groupBy(rows, (row) => row.lead.city);
  const byScoreBand = groupBy(rows, (row) => scoreBand(row.score));
  const byOffer = groupBy(rows, (row) => row.score?.recommendedOffer ?? "no_offer");
  const byChannel = groupBy(rows, (row) => row.interaction?.contactChannel ?? "sem_canal");
  const byTemperature = groupBy(rows, (row) => row.score?.temperature ?? "sem_score");

  return {
    summary: {
      ...all,
      validLeads: rows.length,
      discardedCandidates,
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

export async function validationReport(organizationId: number, campaignId: number): Promise<CampaignValidationReport> {
  const rows = await leadRows(organizationId, campaignId);
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
  } else if (wonDeals >= 1 && contacted >= 50) {
    interpretation = "Canal potencialmente viável: houve venda com contatos qualificados.";
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

export async function scoreCalibrationSuggestion(organizationId: number): Promise<ScoreWeightVersion> {
  const report = await commercialReport(organizationId);
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

  if (report.summary.leadsWithoutWebsite > report.summary.leadsWithWebsite && report.summary.won > 0) {
    rationale.push("Ausência de site aparece como sinal relevante para oferta de landing page.");
  }

  if (!rationale.length) {
    rationale.push("Volume ainda insuficiente para alterar pesos com confiança; manter pesos atuais.");
  }

  const created = await prisma.scoreWeightVersion.create({
    data: {
      organizationId,
      version: `suggested-${new Date().toISOString()}`,
      weights: weights as any,
      rationale: rationale as any
    }
  });

  return {
    id: created.id,
    organizationId: created.organizationId,
    version: created.version,
    weights,
    rationale,
    createdAt: created.createdAt.toISOString()
  };
}

export async function latestScoreWeightVersions(organizationId: number) {
  const versions = await prisma.scoreWeightVersion.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" }
  });
  return versions.map((version) => ({
    id: version.id,
    organizationId: version.organizationId,
    version: version.version,
    weights: version.weights,
    rationale: version.rationale,
    createdAt: version.createdAt.toISOString()
  }));
}
