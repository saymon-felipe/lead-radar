import { app, Tray, Menu, shell, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import express from "express";
import cors from "cors";
import axios from "axios";
import { runDiscovery } from "./runner";

// Configuration file path
const CONFIG_PATH = path.join(os.homedir(), ".lead-radar-worker.json");

interface WorkerConfig {
  deviceId: string;
  workerToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  apiBaseUrl: string;
  environment: "development" | "production";
}

let config: WorkerConfig = {
  deviceId: "",
  apiBaseUrl: "http://localhost:3333",
  environment: "development"
};

let tray: Tray | null = null;
let localServer: any = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let currentRunAbortController: AbortController | null = null;
let currentRunId: number | null = null;
let currentRunStatus: "idle" | "running" = "idle";
let activeDeviceName: string = "";
let activeOrgName: string = "";
let activeUserName: string = "";

// Load config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf8");
      config = { ...config, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error("Failed to load config:", error);
  }

  if (!config.deviceId) {
    config.deviceId = `device_${Math.random().toString(36).substring(2, 15)}`;
    saveConfig();
  }
}

// Save config
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to save config:", error);
  }
}


function describeAxiosError(error: any): string {
  if (error?.response) {
    const message = error.response.data?.message || error.response.data?.error || JSON.stringify(error.response.data || {});
    return `${error.response.status} ${message}`;
  }
  if (error?.code) return `${error.code}: ${error.message || "erro de rede"}`;
  return error?.message || String(error || "erro desconhecido");
}

function tokenExpiresSoon(): boolean {
  if (!config.expiresAt) return false;
  const time = Date.parse(config.expiresAt);
  if (!Number.isFinite(time)) return false;
  return time - Date.now() < 2 * 60 * 1000;
}

async function refreshSessionIfNeeded(force = false): Promise<boolean> {
  if (!config.refreshToken) return Boolean(config.workerToken);
  if (!force && config.workerToken && !tokenExpiresSoon()) return true;

  try {
    const res = await axios.post(`${config.apiBaseUrl}/api/workers/refresh`, {
      refreshToken: config.refreshToken
    }, { timeout: 10000 });

    config.workerToken = res.data.workerToken;
    config.refreshToken = res.data.refreshToken;
    config.expiresAt = res.data.expiresAt;
    if (res.data.apiBaseUrl) config.apiBaseUrl = res.data.apiBaseUrl;
    saveConfig();
    return true;
  } catch (error: any) {
    console.error("Worker session refresh failed:", describeAxiosError(error));
    return false;
  }
}

async function getAuthHeaders() {
  const ok = await refreshSessionIfNeeded(false);
  if (!ok || !config.workerToken) throw new Error("Worker não autenticado ou sessão expirada");
  return { Authorization: `Bearer ${config.workerToken}` };
}


function candidateApiBaseUrls(preferred?: string): string[] {
  const values = [preferred, config.apiBaseUrl, "http://localhost:3333", "http://127.0.0.1:3333", "http://localhost:3334", "http://127.0.0.1:3334"];
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.replace(/\/$/, ""))));
}

async function getWorkerProfileWithToken(baseUrl: string, token: string) {
  return axios.get(`${baseUrl}/api/workers/me`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000
  });
}

// Update tray menu dynamically
function updateTrayMenu() {
  if (!tray) return;

  const isLogged = Boolean(config.workerToken);
  const statusText = currentRunStatus === "running" ? "Rodando busca..." : (isLogged ? "Pronto" : "Desconectado");
  const envText = config.environment === "development" ? "Desenvolvimento (Local)" : "Produção (Heroku)";

  const contextMenu = Menu.buildFromTemplate([
    { label: `Lead Radar Worker`, enabled: false },
    { type: "separator" },
    { label: `Status: ${statusText}`, enabled: false },
    { label: `Ambiente: ${envText}`, enabled: false },
    { label: `Empresa: ${activeOrgName || "Nenhuma"}`, enabled: false },
    { label: `Usuário: ${activeUserName || "Nenhum"}`, enabled: false },
    { type: "separator" },
    ...(isLogged
      ? [
          {
            label: "Mudar de Empresa / Logout",
            click: () => {
              logout();
            }
          }
        ]
      : [
          {
            label: "Fazer Login",
            click: () => {
              shell.openExternal(`${config.apiBaseUrl.replace(/3333|3334/, "5173")}/auth`);
            }
          }
        ]),
    {
      label: "Alternar Ambiente",
      click: () => {
        config.environment = config.environment === "development" ? "production" : "development";
        config.apiBaseUrl = config.environment === "development" ? "http://localhost:3333" : "https://lead-radar-api.herokuapp.com";
        logout();
        updateTrayMenu();
      }
    },
    { type: "separator" },
    ...(currentRunStatus === "running"
      ? [
          {
            label: "Parar Busca Atual",
            click: () => {
              stopActiveRun();
            }
          }
        ]
      : []),
    {
      label: "Sair",
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip(`Lead Radar Worker (${statusText})`);
  tray.setContextMenu(contextMenu);
}

// Logout
function logout() {
  config.workerToken = undefined;
  config.refreshToken = undefined;
  config.expiresAt = undefined;
  activeOrgName = "";
  activeUserName = "";
  activeDeviceName = "";
  saveConfig();
  updateTrayMenu();
}

// Stop current running task
function stopActiveRun() {
  if (currentRunAbortController) {
    currentRunAbortController.abort();
    currentRunAbortController = null;
  }
  if (currentRunId && config.workerToken) {
    axios
      .post(
        `${config.apiBaseUrl}/api/workers/runs/${currentRunId}/fail`,
        { error: "Cancelado pelo usuário no tray do worker" },
        { headers: { Authorization: `Bearer ${config.workerToken}` } }
      )
      .catch(() => undefined);
  }
  currentRunStatus = "idle";
  currentRunId = null;
  updateTrayMenu();
}

// Send heartbeat periodically
async function sendHeartbeat() {
  if (!config.workerToken && !config.refreshToken) return;

  try {
    const headers = await getAuthHeaders();
    const res = await axios.post(
      `${config.apiBaseUrl}/api/workers/heartbeat`,
      {
        status: currentRunStatus === "running" ? "running" : "ready",
        cpuUsage: 0.1,
        ramUsage: 0.2
      },
      { headers, timeout: 10000 }
    );

    if (res.status === 200) {
      const profileRes = await axios.get(`${config.apiBaseUrl}/api/workers/me`, {
        headers,
        timeout: 10000
      });
      activeOrgName = profileRes.data.organization?.name || "";
      activeUserName = profileRes.data.user?.name || "";
      updateTrayMenu();
    }
  } catch (error: any) {
    console.error("Heartbeat failed:", describeAxiosError(error));
    if (error.response?.status === 401) {
      const refreshed = await refreshSessionIfNeeded(true);
      if (!refreshed) logout();
    }
  }
}

function targetForLevel(level: string, limit?: number): number {
  if (level === "nano") return 5;
  if (level === "quick") return Math.min(limit ?? 10, 10);
  if (level === "medium") return Math.min(limit ?? 30, 30);
  if (level === "deep") return Math.min(limit ?? 60, 60);
  return Math.min(limit ?? 10, 10);
}

// Start Express Server
function startExpressServer() {
  const server = express();
  server.use(cors({ origin: "*" }));
  server.use(express.json());

  server.get("/v1/health", (req, res) => {
    res.json({
      status: "ok",
      deviceId: config.deviceId,
      environment: config.environment,
      apiBaseUrl: config.apiBaseUrl,
      runStatus: currentRunStatus,
      isLogged: Boolean(config.workerToken),
      expiresAt: config.expiresAt,
      authHealthy: Boolean(config.workerToken) && !tokenExpiresSoon(),
      userName: activeUserName,
      orgName: activeOrgName
    });
  });

  server.get("/v1/session", (req, res) => {
    res.json({
      deviceId: config.deviceId,
      environment: config.environment,
      apiBaseUrl: config.apiBaseUrl,
      isLogged: Boolean(config.workerToken),
      expiresAt: config.expiresAt,
      authHealthy: Boolean(config.workerToken) && !tokenExpiresSoon(),
      user: activeUserName ? { name: activeUserName } : null,
      organization: activeOrgName ? { name: activeOrgName } : null
    });
  });

  server.post("/v1/login", async (req, res) => {
    try {
      const { workerToken, refreshToken, expiresAt, apiBaseUrl } = req.body;

      if (!workerToken) {
        return res.status(400).json({ error: "workerToken is required" });
      }

      config.workerToken = workerToken;
      config.refreshToken = refreshToken;
      config.expiresAt = expiresAt;

      let lastError: any;
      let profileRes: any;
      for (const candidateBaseUrl of candidateApiBaseUrls(apiBaseUrl)) {
        try {
          profileRes = await getWorkerProfileWithToken(candidateBaseUrl, workerToken);
          config.apiBaseUrl = candidateBaseUrl;
          break;
        } catch (candidateError: any) {
          lastError = candidateError;
        }
      }

      if (!profileRes) {
        throw new Error(`Nenhuma API do Lead Radar respondeu para o worker: ${describeAxiosError(lastError)}`);
      }

      saveConfig();
      activeOrgName = profileRes.data.organization?.name || "";
      activeUserName = profileRes.data.user?.name || "";

      updateTrayMenu();
      res.json({ success: true, user: activeUserName, organization: activeOrgName, apiBaseUrl: config.apiBaseUrl });
    } catch (err: any) {
      console.error("Error setting session in worker:", describeAxiosError(err));
      res.status(500).json({ error: "Failed to login worker: " + describeAxiosError(err) });
    }
  });

  server.post("/v1/runs", async (req, res) => {
    try {
      const { runId, commandToken, level, apiBaseUrl, options } = req.body;

      if (!config.workerToken) {
        return res.status(401).json({ error: "Worker not authenticated" });
      }

      if (currentRunStatus === "running") {
        return res.status(400).json({ error: "A run is already active on this worker" });
      }

      let targetApiBaseUrl = apiBaseUrl || config.apiBaseUrl;

      // Claim the run in the backend API. If the saved API port is stale, try common local ports.
      let claimed = false;
      let lastClaimError: any;
      let authHeaders: Record<string, string>;

      for (const candidateBaseUrl of candidateApiBaseUrls(targetApiBaseUrl)) {
        targetApiBaseUrl = candidateBaseUrl;
        config.apiBaseUrl = candidateBaseUrl;
        saveConfig();

        try {
          authHeaders = await getAuthHeaders();
          await axios.post(
            `${targetApiBaseUrl}/api/workers/runs/${runId}/claim`,
            {},
            { headers: authHeaders, timeout: 15000 }
          );
          claimed = true;
          break;
        } catch (err: any) {
          lastClaimError = err;
          if (err.response?.status === 401 && await refreshSessionIfNeeded(true)) {
            try {
              authHeaders = await getAuthHeaders();
              await axios.post(
                `${targetApiBaseUrl}/api/workers/runs/${runId}/claim`,
                {},
                { headers: authHeaders, timeout: 15000 }
              );
              claimed = true;
              break;
            } catch (retryErr: any) {
              lastClaimError = retryErr;
            }
          }
        }
      }

      if (!claimed) {
        return res.status(400).json({ error: "Failed to claim run: " + describeAxiosError(lastClaimError) });
      }

      // Start run asynchronously
      currentRunAbortController = new AbortController();
      currentRunId = runId;
      currentRunStatus = "running";
      updateTrayMenu();

      // Run background scraping process
      runDiscovery(
        runId,
        level,
        targetForLevel(level, options?.limit),
        config.workerToken!,
        targetApiBaseUrl,
        currentRunAbortController.signal
      )
        .then(() => {
          currentRunStatus = "idle";
          currentRunAbortController = null;
          currentRunId = null;
          updateTrayMenu();
        })
        .catch(err => {
          console.error("Run failed:", err);
          currentRunStatus = "idle";
          currentRunAbortController = null;
          currentRunId = null;
          updateTrayMenu();
        });

      res.json({ success: true, runId, status: "running" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post("/v1/runs/:runId/stop", (req, res) => {
    // The browser UI only knows the campaign id in some flows, while the worker
    // tracks the DB-backed run id. Since this local worker runs one job at a time,
    // stop the active job regardless of the numeric route parameter.
    if (currentRunStatus === "running" && currentRunId) {
      const stoppedRunId = currentRunId;
      stopActiveRun();
      res.json({ success: true, stoppedRunId });
    } else {
      res.status(404).json({ error: "Run not active" });
    }
  });

  localServer = server.listen(4004, "127.0.0.1", () => {
    console.log("Local worker server listening on http://127.0.0.1:4004");
  });
}

// App initialization
app.whenReady().then(() => {
  loadConfig();

  // Create tray icon
  const iconPath = path.join(__dirname, "../assets/logo.png");
  if (!fs.existsSync(iconPath)) {
    console.warn("Tray icon file not found at path:", iconPath);
  }

  // nativeImage loads the png file
  const image = nativeImage.createFromPath(iconPath);
  // Resize to standard tray icon size (16x16 or 24x24)
  const trayIcon = image.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  updateTrayMenu();

  // Start local server
  startExpressServer();

  // Start heartbeat interval
  sendHeartbeat(); // run once immediately
  heartbeatInterval = setInterval(sendHeartbeat, 30000);

  // If macOS, keep running in dock
  if (app.dock) app.dock.hide();
});

// Cleanups on quit
app.on("will-quit", () => {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (localServer) localServer.close();
  stopActiveRun();
});
