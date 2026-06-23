const temperatureLabels: Record<string, string> = {
  hot: "Hot",
  warm: "Warm",
  medium: "MÃ©dio",
  cold: "Cold",
  discard: "Descartar",
  sem_score: "Sem score"
};

const offerLabels: Record<string, string> = {
  landing_page: "Landing page",
  institutional_site: "Site institucional",
  redesign: "Redesign",
  seo_local: "SEO local",
  maintenance: "ManutenÃ§Ã£o",
  no_offer: "Sem oferta",
  digital_presence_organization: "OrganizaÃ§Ã£o da presenÃ§a digital",
  google_business_optimization: "OtimizaÃ§Ã£o Google Business",
  none: "Nenhuma"
};

const interactionStatusLabels: Record<string, string> = {
  not_contacted: "NÃ£o contatado",
  contacted: "Contatado",
  replied: "Respondeu",
  interested: "Interessado",
  meeting_scheduled: "ReuniÃ£o agendada",
  proposal_sent: "Proposta enviada",
  won: "Ganho",
  lost: "Perdido",
  no_response: "Sem resposta",
  invalid_contact: "Contato invÃ¡lido"
};

const campaignStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  running: "Em andamento",
  paused: "Pausada",
  completed: "ConcluÃ­da",
  failed: "Falhou"
};

const decisionLabels: Record<string, string> = {
  continue_niche: "Continuar no nicho",
  adjust_niche: "Ajustar nicho",
  adjust_offer: "Ajustar oferta",
  adjust_message: "Ajustar mensagem",
  adjust_scoring: "Ajustar scoring"
};

const analysisTypeLabels: Record<string, string> = {
  lead_final_review: "RevisÃ£o final do lead",
  message_generation: "GeraÃ§Ã£o de mensagem",
  website_review: "AnÃ¡lise do site",
  social_review: "AnÃ¡lise social",
  search_candidate_review: "RevisÃ£o de candidatos"
};

const embeddingTypeLabels: Record<string, string> = {
  lead_profile: "Perfil do lead",
  ideal_profile: "Perfil ideal",
  website_summary: "Resumo do site",
  social_summary: "Resumo social",
  conversion_profile: "Perfil convertido",
  lost_profile: "Perfil perdido"
};

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  google_maps: "Google Maps",
  unknown: "Desconhecida"
};

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatTemperatureLabel(value?: string): string {
  if (!value) return "-";
  return temperatureLabels[value] ?? humanizeKey(value);
}

export function formatOfferLabel(value?: string): string {
  if (!value) return "-";
  return offerLabels[value] ?? humanizeKey(value);
}

export function formatInteractionStatusLabel(value?: string): string {
  if (!value) return "-";
  return interactionStatusLabels[value] ?? humanizeKey(value);
}

export function formatCampaignStatusLabel(value?: string): string {
  if (!value) return "-";
  return campaignStatusLabels[value] ?? humanizeKey(value);
}

export function formatDecisionLabel(value?: string): string {
  if (!value) return "-";
  return decisionLabels[value] ?? humanizeKey(value);
}

export function formatAnalysisTypeLabel(value?: string): string {
  if (!value) return "-";
  return analysisTypeLabels[value] ?? humanizeKey(value);
}

export function formatEmbeddingTypeLabel(value?: string): string {
  if (!value) return "-";
  return embeddingTypeLabels[value] ?? humanizeKey(value);
}

export function formatPlatformLabel(value?: string): string {
  if (!value) return "-";
  return platformLabels[value] ?? humanizeKey(value);
}
