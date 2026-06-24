import axios from "axios";
import { api } from "./api.js";

const WORKER_LOCAL_URL = "http://127.0.0.1:4004";

export interface WorkerStatus {
  status: string;
  deviceId: string;
  environment: string;
  apiBaseUrl: string;
  runStatus: "idle" | "running";
  isLogged: boolean;
  authHealthy?: boolean;
  expiresAt?: string;
  userName?: string;
  orgName?: string;
}

function getApiBaseUrl(): string {
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    // Local dev: Vite proxy targets the backend on 3333 by default.
    return window.location.origin.replace("5173", "3333");
  }
  // Production: use current origin
  return window.location.origin;
}

class WorkerClient {
  private currentSync?: Promise<WorkerStatus | null>;

  async checkHealth(): Promise<WorkerStatus | null> {
    try {
      const res = await axios.get(`${WORKER_LOCAL_URL}/v1/health`, { timeout: 1500 });
      return res.data;
    } catch {
      return null;
    }
  }

  async getSession() {
    try {
      const res = await axios.get(`${WORKER_LOCAL_URL}/v1/session`, { timeout: 1500 });
      return res.data;
    } catch {
      return null;
    }
  }

  async loginLocalWorker(workerToken: string, refreshToken: string, expiresAt: string, apiBaseUrl: string) {
    const res = await axios.post(`${WORKER_LOCAL_URL}/v1/login`, {
      workerToken,
      refreshToken,
      expiresAt,
      apiBaseUrl
    });
    return res.data;
  }

  async startLocalRun(runId: number, commandToken: string, level: string, limit: number, apiBaseUrl: string) {
    const res = await axios.post(`${WORKER_LOCAL_URL}/v1/runs`, {
      runId,
      commandToken,
      level,
      apiBaseUrl,
      options: { limit }
    });
    return res.data;
  }

  async stopLocalRun(runId: number) {
    const res = await axios.post(`${WORKER_LOCAL_URL}/v1/runs/${runId}/stop`);
    return res.data;
  }

  // Automate worker login handshake if disconnected or out of sync.
  // Concurrent callers reuse the same promise so a campaign click cannot race the periodic health poll.
  async syncWorkerSession(orgId: number): Promise<WorkerStatus | null> {
    if (!this.currentSync) {
      this.currentSync = this.performSyncWorkerSession(orgId).finally(() => {
        this.currentSync = undefined;
      });
    }
    return this.currentSync;
  }

  private async performSyncWorkerSession(_orgId: number): Promise<WorkerStatus | null> {
    try {
      const health = await this.checkHealth();
      if (!health) return null;

      // Fetch the actual backend API base URL from the backend's health check (proxied)
      let targetApiBaseUrl = "";
      try {
        const backendHealth = await axios.get("/health");
        targetApiBaseUrl = backendHealth.data.apiBaseUrl;
      } catch (err) {
        console.warn("Failed to get backend health, falling back to heuristic:", err);
      }

      if (!targetApiBaseUrl) {
        targetApiBaseUrl = getApiBaseUrl();
      }

      const normalize = (u: string) => u.replace(/\/$/, "").toLowerCase();
      const isDivergent = normalize(health.apiBaseUrl) !== normalize(targetApiBaseUrl);
      const sessionUnhealthy = health.authHealthy === false;

      // If worker is not logged in, token is expired/near expiration, or API target diverges.
      if (!health.isLogged || health.orgName === "" || isDivergent || sessionUnhealthy) {
        console.log("Syncing local worker auth to API:", targetApiBaseUrl);
        const isLocalDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const registration = await api.registerWorker({
          deviceId: health.deviceId,
          environment: isLocalDev ? "development" : "production",
          appVersion: "0.1.0",
          hostname: "Browser Link"
        });

        const { workerToken, refreshToken, expiresAt, apiBaseUrl: registeredApiBaseUrl } = registration as any;
        const finalApiBaseUrl = registeredApiBaseUrl || targetApiBaseUrl;

        await this.loginLocalWorker(workerToken, refreshToken, expiresAt, finalApiBaseUrl);
        return this.checkHealth();
      }

      return health;
    } catch (err) {
      console.error("Failed to sync worker session:", err);
      return null;
    }
  }

}

export const workerClient = new WorkerClient();

