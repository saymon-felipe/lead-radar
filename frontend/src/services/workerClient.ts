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
  loginRequested?: boolean;
  userName?: string;
  orgName?: string;
}

function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    // Local dev: replace frontend port 5173 with backend port 3334
    return window.location.origin.replace("5173", "3334");
  }
  // Production: use current origin
  return window.location.origin;
}

class WorkerClient {
  private isChecking = false;

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

  async requestLocalWorkerLogin() {
    const res = await axios.post(`${WORKER_LOCAL_URL}/v1/login-request`, {}, { timeout: 1500 });
    return res.data;
  }

  async logoutLocalWorker() {
    const res = await axios.post(`${WORKER_LOCAL_URL}/v1/logout`, {}, { timeout: 1500 });
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

  // Automate worker login handshake if disconnected or out of sync
  async syncWorkerSession(orgId: number): Promise<WorkerStatus | null> {
    if (this.isChecking) {
      return this.checkHealth();
    }
    this.isChecking = true;

    try {
      const health = await this.checkHealth();
      if (!health) {
        this.isChecking = false;
        return null;
      }

      // Fetch the actual backend API base URL from the backend's health check (proxied)
      let targetApiBaseUrl = "";
      try {
        const backendHealth = await axios.get(`${getApiBaseUrl()}/health`);
        targetApiBaseUrl = backendHealth.data.apiBaseUrl;
      } catch (err) {
        console.warn("Failed to get backend health, falling back to heuristic:", err);
      }

      if (!targetApiBaseUrl) {
        targetApiBaseUrl = getApiBaseUrl();
      }

      // Self-healing: If we are on production, but targetApiBaseUrl is a local address,
      // it means the backend is misconfigured and returning its default localhost fallback.
      // We must override it with the public API URL.
      const isProduction = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
      if (isProduction && (targetApiBaseUrl.includes("localhost") || targetApiBaseUrl.includes("127.0.0.1"))) {
        targetApiBaseUrl = getApiBaseUrl();
      }

      const normalize = (u: string) => u.replace(/\/$/, "").toLowerCase();
      const isDivergent = normalize(health.apiBaseUrl) !== normalize(targetApiBaseUrl);

      // If the user explicitly logged out, do not silently provision fresh tokens.
      // The local worker only allows browser-side login after the tray "Login" action
      // sets loginRequested=true. Environment changes still require an explicit Login.
      if (!health.isLogged) {
        if (!health.loginRequested) {
          this.isChecking = false;
          return health;
        }
      }

      // If worker is not logged in after an explicit Login request, or its API target diverges,
      // provision a fresh session. This is intentionally NOT automatic after Logout.
      if ((!health.isLogged && health.loginRequested) || (health.isLogged && isDivergent)) {
        console.log("Syncing local worker auth to API:", targetApiBaseUrl);
        const isLocalDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        // 1. Call API backend to register device and get tokens
        const registration = await api.registerWorker({
          deviceId: health.deviceId,
          environment: isLocalDev ? "development" : "production",
          appVersion: "0.1.0",
          hostname: "Browser Link"
        });

        const { workerToken, refreshToken, expiresAt, apiBaseUrl: registeredApiBaseUrl } = registration as any;
        const finalApiBaseUrl = registeredApiBaseUrl || targetApiBaseUrl;

        // 2. Call local worker to log in and set backend base URL
        await this.loginLocalWorker(workerToken, refreshToken, expiresAt, finalApiBaseUrl);
        
        // Re-check health
        const updatedHealth = await this.checkHealth();
        this.isChecking = false;
        return updatedHealth;
      }

      this.isChecking = false;
      return health;
    } catch (err) {
      console.error("Failed to sync worker session:", err);
      this.isChecking = false;
      return null;
    }
  }
}

export const workerClient = new WorkerClient();

