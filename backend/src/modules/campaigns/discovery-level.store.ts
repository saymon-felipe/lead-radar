import { prisma } from "../../shared/prisma.js";

export type CampaignDiscoveryLevel = "nano" | "quick" | "medium" | "deep";

const DISCOVERY_LEVELS = new Set<string>(["nano", "quick", "medium", "deep"]);
let ensureColumnPromise: Promise<void> | null = null;

export function normalizeCampaignDiscoveryLevel(value: unknown): CampaignDiscoveryLevel {
  return DISCOVERY_LEVELS.has(String(value)) ? (String(value) as CampaignDiscoveryLevel) : "quick";
}

export function defaultDiscoveryTarget(level: CampaignDiscoveryLevel): number {
  switch (level) {
    case "nano": return 5;
    case "medium": return 30;
    case "deep": return 60;
    case "quick":
    default: return 10;
  }
}

export async function ensureCampaignDiscoveryLevelColumn(): Promise<void> {
  if (!ensureColumnPromise) {
    ensureColumnPromise = (async () => {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ COLUMN_NAME?: string; column_name?: string }>>(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'search_campaigns' AND COLUMN_NAME = 'discovery_level'"
        );
        if (rows.length === 0) {
          await prisma.$executeRawUnsafe(
            "ALTER TABLE search_campaigns ADD COLUMN discovery_level VARCHAR(16) NOT NULL DEFAULT 'quick'"
          );
        }
      } catch (error) {
        ensureColumnPromise = null;
        throw error;
      }
    })();
  }
  return ensureColumnPromise;
}

export async function setCampaignDiscoveryLevel(campaignId: number, level: unknown): Promise<CampaignDiscoveryLevel> {
  const normalized = normalizeCampaignDiscoveryLevel(level);
  await ensureCampaignDiscoveryLevelColumn();
  await prisma.$executeRawUnsafe(
    "UPDATE search_campaigns SET discovery_level = ?, updated_at = NOW() WHERE id = ?",
    normalized,
    campaignId
  );
  return normalized;
}

export async function getCampaignDiscoveryLevels(campaignIds: number[]): Promise<Record<number, CampaignDiscoveryLevel>> {
  const ids = [...new Set(campaignIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return {};

  await ensureCampaignDiscoveryLevelColumn();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; discoveryLevel?: string; discovery_level?: string }>>(
    `SELECT id, discovery_level AS discoveryLevel FROM search_campaigns WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids
  );

  return Object.fromEntries(
    rows.map((row) => [Number(row.id), normalizeCampaignDiscoveryLevel(row.discoveryLevel ?? row.discovery_level)])
  );
}

export async function getCampaignDiscoveryLevel(campaignId: number): Promise<CampaignDiscoveryLevel> {
  const levels = await getCampaignDiscoveryLevels([campaignId]);
  return levels[campaignId] ?? "quick";
}

export async function attachCampaignDiscoveryLevels<T extends { id: number }>(campaigns: T[]): Promise<Array<T & { discoveryLevel: CampaignDiscoveryLevel }>> {
  const levels = await getCampaignDiscoveryLevels(campaigns.map((campaign) => campaign.id));
  return campaigns.map((campaign) => ({
    ...campaign,
    discoveryLevel: levels[campaign.id] ?? normalizeCampaignDiscoveryLevel((campaign as any).discoveryLevel)
  }));
}
