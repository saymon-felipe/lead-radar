export interface Interaction {
  id: number;
  leadId: number;
  status: string;
  contactChannel?: string;
  notes?: string;
  contactedAt?: string;
  responseAt?: string;
}

export interface GeneratedMessage {
  id: number;
  leadId: number;
  channel: string;
  content: string;
  tone: string;
}
