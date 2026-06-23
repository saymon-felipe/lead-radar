import type { Lead } from "./leads";

export type DiscoverySearchLevel = "nano" | "quick" | "medium" | "deep";

export interface DiscoveryResult {
  collected: number;
  filtered: number;
  reviewed: number;
  inserted: number;
  cancelled?: boolean;
  candidates: Array<{
    id: number;
    title: string;
    url: string;
    priority: string;
    status: string;
    reason: string;
    leadId?: number;
  }>;
  leads: Lead[];
  meta?: {
    searchLevel?: DiscoverySearchLevel;
    targetFinalLeads?: number;
    [key: string]: unknown;
  };
}

export interface DiscoveryStopResult {
  stopped: boolean;
}

export interface DiscoveryTraceEvent {
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

export interface DiscoveryStatus {
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
