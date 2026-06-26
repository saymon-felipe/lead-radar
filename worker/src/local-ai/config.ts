import path from "path";
import fs from "fs";
import os from "os";
import { LocalAiConfig } from "./types";

export const LOCAL_AI_CONFIG_PATH = path.join(os.homedir(), ".lead-radar-worker-ai.json");

export function workerRootDir(): string {
  // If we are running inside the packed app.asar file (which is read-only),
  // we must write all AI binaries and models to a writable user directory.
  if (__dirname.includes("app.asar")) {
    return path.join(os.homedir(), ".lead-radar-worker-ai");
  }

  // dist/local-ai/config.js -> worker/dist/local-ai/config.js, so .. from dist is worker/dist.
  // In dev, __dirname is worker/src/local-ai. Keep both cases stable.
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "worker", "package.json"))) return path.join(cwd, "worker");
  if (fs.existsSync(path.join(cwd, "package.json")) && path.basename(cwd) === "worker") return cwd;
  return path.resolve(__dirname, "..", "..");
}

export function llamaServerExecutableName(): string {
  return process.platform === "win32" ? "llama-server.exe" : "llama-server";
}

export function defaultCpuServerPath(): string {
  return path.join(workerRootDir(), "vendor", "llama.cpp", "cpu", llamaServerExecutableName());
}

export function defaultCudaServerPath(): string {
  return path.join(workerRootDir(), "vendor", "llama.cpp", "cuda", llamaServerExecutableName());
}

export function defaultModelPath(): string {
  return path.join(workerRootDir(), "vendor", "models", "lead-radar-local.gguf");
}

export function defaultLocalAiConfig(): LocalAiConfig {
  return {
    enabled: false,
    provider: "llama.cpp",
    endpoint: "http://127.0.0.1:41114",
    serverPath: undefined,
    modelPath: defaultModelPath(),
    device: "auto",
    strictCuda: false,
    contextSize: 2048,
    maxTokens: 192,
    timeoutMs: 45000,
    autoStartServer: true,
    tasks: {
      personName: true,
      serpClassification: true,
      queryRewrite: true,
      htmlCleaning: false
    }
  };
}

function normalizeConfig(config: Partial<LocalAiConfig>): LocalAiConfig {
  const defaults = defaultLocalAiConfig();
  const normalized: LocalAiConfig = {
    ...defaults,
    ...config,
    timeoutMs: config.timeoutMs === 12000 || !config.timeoutMs ? defaults.timeoutMs : config.timeoutMs,
    endpoint: config.endpoint?.trim() || defaults.endpoint,
    modelPath: config.modelPath?.trim() || defaults.modelPath,
    serverPath: config.serverPath?.trim() || undefined,
    strictCuda: Boolean(config.strictCuda ?? defaults.strictCuda),
    tasks: {
      ...defaults.tasks,
      ...(config.tasks || {})
    }
  };
  return normalized;
}

export function loadLocalAiConfig(): LocalAiConfig {
  try {
    if (fs.existsSync(LOCAL_AI_CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_AI_CONFIG_PATH, "utf8"));
      return normalizeConfig(parsed);
    }
  } catch (error) {
    console.error("Failed to load local AI config:", error);
  }
  const defaults = defaultLocalAiConfig();
  saveLocalAiConfig(defaults);
  return defaults;
}

export function saveLocalAiConfig(config: LocalAiConfig): LocalAiConfig {
  const normalized = normalizeConfig(config);
  fs.writeFileSync(LOCAL_AI_CONFIG_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export function fileExists(filePath?: string): boolean {
  return Boolean(filePath && fs.existsSync(filePath));
}
