export interface DashboardMetrics {
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  contactedLeads: number;
  repliedLeads: number;
  wonDeals: number;
  potentialRevenue: number;
  responseRate: number;
  conversionRate: number;
  bestNiche?: string;
  bestCity?: string;
  bestScoreBand?: string;
  bestOffer?: string;
  aiCostPerQualifiedLead?: number;
  byTemperature?: DimensionReport[];
  byOffer?: DimensionReport[];
  nextCampaignSuggestions?: string[];
  lossReasons?: string[];
}

export interface DimensionReport {
  key: string;
  leads: number;
  contacted: number;
  replied: number;
  interested: number;
  meetings: number;
  proposals: number;
  won: number;
  lost: number;
  noResponse: number;
  responseRate: number;
  conversionRate: number;
  estimatedRevenue: number;
}

export interface CommercialReport {
  summary: DimensionReport & {
    validLeads: number;
    discardedCandidates: number;
    hotLeads: number;
    warmLeads: number;
    mediumLeads: number;
    coldLeads: number;
    leadsWithWebsite: number;
    leadsWithoutWebsite: number;
    leadsWithWhatsapp: number;
    leadsWithInstagram: number;
    leadsWithGoogleMaps: number;
    tokensUsed: number;
    aiCostEstimate: number;
    aiCostPerQualifiedLead: number;
    averageTicket: number;
  };
  byNiche: DimensionReport[];
  byCity: DimensionReport[];
  byScoreBand: DimensionReport[];
  byOffer: DimensionReport[];
  byChannel: DimensionReport[];
  byTemperature: DimensionReport[];
  bestNiche?: string;
  bestCity?: string;
  bestScoreBand?: string;
  bestOffer?: string;
  lossReasons: string[];
  nextCampaignSuggestions: string[];
}

export interface CampaignValidationReport {
  campaignId: number;
  collectedLeads: number;
  reviewedHotWarm: number;
  manualContacts: number;
  replies: number;
  wonDeals: number;
  estimatedRevenue: number;
  minimumSaleTargetMet: boolean;
  strongChannelTargetMet: boolean;
  interpretation: string;
  recommendedDecision: string;
  checklist: Array<{ label: string; current: number; target: number; done: boolean }>;
}

export interface ScoreWeightVersion {
  id: number;
  version: string;
  weights: Record<string, number>;
  rationale: string[];
  createdAt: string;
}
