export interface Campaign {
  id: number;
  name: string;
  niche: string;
  city: string;
  state: string;
  status: string;
  targetQuantity?: number;
  metrics?: {
    leadsFound: number;
    hotLeads: number;
    warmLeads: number;
  };
}
