import axios from "axios";
import { ChildProcess, execFile, execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import {
  defaultCpuServerPath,
  defaultCudaServerPath,
  defaultModelPath
} from "./config";
import { detectNvidia } from "./runtime";
import { updateLocalAiRuntimeTelemetry } from "./telemetry";
import { LocalAiConfig, LocalAiDiagnostics, LocalAiRuntimeStatus } from "./types";

let serverProcess: ChildProcess | null = null;
let lastError: string | undefined;
let lastFallbackReason: string | undefined;
let startedByWorker = false;
let selectedRuntime: "cpu" | "cuda" | undefined;
let selectedServerPath: string | undefined;
let externalServerPid: number | undefined;

const execFileAsync = promisify(execFile);

function endpointBase(endpoint: string) {
  return endpoint.replace(/\/$/, "");
}

function fileExists(filePath?: string): boolean {
  return Boolean(filePath && fs.existsSync(filePath));
}

function effectiveModelPath(config: LocalAiConfig): string {
  if (fileExists(config.modelPath)) return config.modelPath!;
  return defaultModelPath();
}

function runtimeArgs(runtime: "cpu" | "cuda"): string[] {
  if (runtime === "cpu") return ["-ngl", "0"];
  // A moderate offload keeps older 4 GB GPUs usable while still selecting CUDA.
  return ["-ngl", "16"];
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function endpointPort(endpoint: string): string {
  try {
    return new URL(endpoint).port || "41114";
  } catch {
    return "41114";
  }
}

function isSevereLlamaLog(text: string): boolean {
  return /\b(error|failed|exception|fatal|traceback)\b/i.test(text)
    && !/\b(W srv|stop: cancel task|Chat format:|load_tensors|llama_model_loader)\b/i.test(text);
}

async function findWindowsProcessOnPort(port: string): Promise<{ pid: number; executablePath?: string; commandLine?: string } | undefined> {
  if (process.platform !== "win32") return undefined;
  const script = [
    "& { param($port)",
    "$line = netstat -ano | Select-String (':' + $port + '\\s+0.0.0.0:0\\s+LISTENING') | Select-Object -First 1",
    "if (-not $line) { exit 0 }",
    "if ($line.Line -match '\\s+(\\d+)\\s*$') {",
    "  $proc = Get-CimInstance Win32_Process -Filter \"ProcessId=$($Matches[1])\"",
    "  if ($proc) {",
    "    [pscustomobject]@{ pid = [int]$proc.ProcessId; executablePath = $proc.ExecutablePath; commandLine = $proc.CommandLine } | ConvertTo-Json -Compress",
    "  }",
    "}",
    "}"
  ].join("; ");
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script, port], { timeout: 2500 });
    const trimmed = stdout.trim();
    if (!trimmed) return undefined;
    const parsed = JSON.parse(trimmed);
    return {
      pid: Number(parsed.pid),
      executablePath: parsed.executablePath,
      commandLine: parsed.commandLine
    };
  } catch {
    return undefined;
  }
}

interface RuntimeCandidate {
  runtime: "cpu" | "cuda";
  serverPath: string;
  manual: boolean;
}

export class LlamaCppClient {
  constructor(private config: LocalAiConfig) {}

  updateConfig(config: LocalAiConfig) {
    this.config = config;
  }

  private async runtimeSnapshot(available = false): Promise<LocalAiRuntimeStatus> {
    if (available) await this.syncExternalRuntime();
    const cpuServerPath = defaultCpuServerPath();
    const cudaServerPath = defaultCudaServerPath();
    const manualServerPath = fileExists(this.config.serverPath) ? this.config.serverPath : undefined;
    const modelPath = effectiveModelPath(this.config);
    const nvidia = await detectNvidia();
    const serverPath = manualServerPath || selectedServerPath || (
      this.config.device === "cuda" && fileExists(cudaServerPath) ? cudaServerPath : cpuServerPath
    );
    const serverFileExists = fileExists(serverPath);
    const modelFileExists = fileExists(modelPath);
    const runtime = selectedRuntime || (
      manualServerPath
        ? (manualServerPath.toLowerCase().includes(`${path.sep}cuda${path.sep}`) ? "cuda" : "cpu")
        : undefined
    );

    return {
      enabled: this.config.enabled,
      provider: this.config.provider,
      available,
      endpoint: this.config.endpoint,
      modelPath,
      serverPath,
      cpuServerPath,
      cudaServerPath,
      selectedRuntime: runtime,
      cpuRuntimeFound: fileExists(cpuServerPath),
      cudaRuntimeFound: fileExists(cudaServerPath),
      nvidiaDetected: nvidia.detected,
      device: this.config.device,
      serverStartedByWorker: startedByWorker,
      serverFileExists,
      modelFileExists,
      canAutoStart: Boolean(this.config.enabled && this.config.autoStartServer && serverFileExists && modelFileExists),
      lastError,
      lastFallbackReason,
      serverPid: serverProcess?.pid || externalServerPid
    };
  }

  async runtimeStatus(available = false): Promise<LocalAiRuntimeStatus> {
    const status = await this.runtimeSnapshot(available);
    status.telemetry = undefined;
    return status;
  }

  async diagnostics(available = false): Promise<LocalAiDiagnostics> {
    const status = await this.runtimeSnapshot(available);
    const messages: string[] = [];
    if (!this.config.enabled) messages.push("IA local esta desativada.");
    if (!status.cpuRuntimeFound) messages.push(`Runtime CPU nao encontrado: ${status.cpuServerPath}`);
    if (!status.cudaRuntimeFound) messages.push(`Runtime CUDA nao encontrado: ${status.cudaServerPath}`);
    if (!status.modelFileExists) messages.push(`Modelo GGUF nao encontrado: ${status.modelPath || "nao configurado"}`);
    if (this.config.device === "cuda" && !status.nvidiaDetected) messages.push("CUDA solicitado, mas nvidia-smi nao detectou GPU NVIDIA.");
    if (this.config.enabled && status.serverFileExists && status.modelFileExists && !available) {
      messages.push("Runtime ainda nao respondeu. Clique em Iniciar/Testar runtime ou execute uma tarefa de IA local.");
    }
    if (lastFallbackReason) messages.push(lastFallbackReason);
    if (lastError) messages.push(lastError);
    return {
      ok: Boolean(this.config.enabled && status.serverFileExists && status.modelFileExists),
      available,
      selectedRuntime: status.selectedRuntime,
      cpuRuntimeFound: status.cpuRuntimeFound,
      cudaRuntimeFound: status.cudaRuntimeFound,
      nvidiaDetected: status.nvidiaDetected,
      serverFileExists: status.serverFileExists,
      modelFileExists: status.modelFileExists,
      serverPath: status.serverPath,
      cpuServerPath: status.cpuServerPath,
      cudaServerPath: status.cudaServerPath,
      modelPath: status.modelPath,
      endpoint: status.endpoint,
      device: status.device,
      messages
    };
  }

  async health(): Promise<boolean> {
    if (this.config.provider !== "llama.cpp") return false;
    try {
      await axios.get(`${endpointBase(this.config.endpoint)}/health`, { timeout: 1200 });
      return true;
    } catch {
      try {
        await axios.get(`${endpointBase(this.config.endpoint)}/props`, { timeout: 1200 });
        return true;
      } catch {
        return false;
      }
    }
  }

  private async syncExternalRuntime() {
    if (serverProcess) return;
    const info = await findWindowsProcessOnPort(endpointPort(this.config.endpoint));
    if (!info?.pid) return;
    externalServerPid = info.pid;
    const executablePath = info.executablePath || "";
    if (executablePath) selectedServerPath = executablePath;
    const normalized = executablePath.toLowerCase();
    if (normalized.includes(`${path.sep}cuda${path.sep}`.toLowerCase())) selectedRuntime = "cuda";
    else if (normalized.includes(`${path.sep}cpu${path.sep}`.toLowerCase())) selectedRuntime = "cpu";
    updateLocalAiRuntimeTelemetry({
      selectedRuntime,
      modelPath: effectiveModelPath(this.config),
      serverPid: externalServerPid
    });
  }

  private async buildCandidates(): Promise<RuntimeCandidate[]> {
    const manualServerPath = fileExists(this.config.serverPath) ? this.config.serverPath : undefined;
    if (manualServerPath) {
      return [{
        runtime: manualServerPath.toLowerCase().includes(`${path.sep}cuda${path.sep}`) ? "cuda" : "cpu",
        serverPath: manualServerPath,
        manual: true
      }];
    }

    const candidates: RuntimeCandidate[] = [];
    const cpuServerPath = defaultCpuServerPath();
    const cudaServerPath = defaultCudaServerPath();
    const nvidia = await detectNvidia();

    if ((this.config.device === "auto" || this.config.device === "cuda") && nvidia.detected && fileExists(cudaServerPath)) {
      candidates.push({ runtime: "cuda", serverPath: cudaServerPath, manual: false });
    } else if (this.config.device === "cuda" && !nvidia.detected) {
      lastFallbackReason = "CUDA solicitado, mas NVIDIA nao foi detectada; usando CPU.";
    } else if (this.config.device === "cuda" && !fileExists(cudaServerPath)) {
      lastFallbackReason = "CUDA solicitado, mas runtime CUDA nao foi encontrado; usando CPU.";
    }

    if (this.config.device === "vulkan") {
      lastFallbackReason = "Runtime Vulkan nao esta embutido; usando CPU.";
    }

    if (this.config.device !== "cuda" || !this.config.strictCuda) {
      candidates.push({ runtime: "cpu", serverPath: cpuServerPath, manual: false });
    }

    return candidates;
  }

  private async startCandidate(candidate: RuntimeCandidate, modelPath: string): Promise<boolean> {
    if (!fileExists(candidate.serverPath)) {
      lastError = `llama.cpp server not found: ${candidate.serverPath}`;
      return false;
    }
    if (!fileExists(modelPath)) {
      lastError = `GGUF model not found: ${modelPath}`;
      return false;
    }

    try {
      const port = new URL(this.config.endpoint).port || "41114";
      const args = [
        "-m", modelPath,
        "--host", "127.0.0.1",
        "--port", port,
        "-c", String(this.config.contextSize),
        ...runtimeArgs(candidate.runtime)
      ];

      serverProcess = spawn(candidate.serverPath, args, {
        cwd: path.dirname(candidate.serverPath),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      startedByWorker = true;
      selectedRuntime = candidate.runtime;
      selectedServerPath = candidate.serverPath;
      updateLocalAiRuntimeTelemetry({ selectedRuntime, modelPath, serverPid: serverProcess.pid });

      serverProcess.stderr?.on("data", (chunk) => {
        const text = String(chunk).trim();
        if (text && isSevereLlamaLog(text)) lastError = text.slice(-800);
      });
      serverProcess.stdout?.on("data", (chunk) => {
        const text = String(chunk).trim();
        if (text && isSevereLlamaLog(text)) lastError = text.slice(-800);
      });
      serverProcess.on("exit", (code) => {
        if (code && code !== 0) lastError = lastError || `llama.cpp server exited with code ${code}`;
        serverProcess = null;
        startedByWorker = false;
        externalServerPid = undefined;
        updateLocalAiRuntimeTelemetry({ serverPid: undefined });
      });

      for (let i = 0; i < 30; i += 1) {
        await sleep(350);
        if (await this.health()) {
          lastError = undefined;
          return true;
        }
        if (!serverProcess) break;
      }

      lastError = `${candidate.runtime.toUpperCase()} llama.cpp server did not become healthy in time`;
      stopLlamaCppServer();
      return false;
    } catch (error: any) {
      lastError = error?.message || String(error);
      stopLlamaCppServer();
      return false;
    }
  }

  async ensureReady(): Promise<boolean> {
    if (this.config.provider !== "llama.cpp") return false;
    if (await this.health()) {
      await this.syncExternalRuntime();
      return true;
    }
    if (!this.config.autoStartServer) return false;
    if (serverProcess) return false;

    const modelPath = effectiveModelPath(this.config);
    const candidates = await this.buildCandidates();
    if (!candidates.length) {
      lastError = "Nenhum runtime llama.cpp disponivel para iniciar.";
      return false;
    }

    for (const candidate of candidates) {
      const ok = await this.startCandidate(candidate, modelPath);
      if (ok) return true;
      if (candidate.runtime === "cuda" && !candidate.manual && (!this.config.strictCuda || this.config.device === "auto")) {
        lastFallbackReason = "CUDA falhou, usando CPU.";
        continue;
      }
      if (candidate.runtime === "cuda" && this.config.strictCuda) return false;
    }

    return false;
  }

  async complete(prompt: string, maxTokens?: number): Promise<string | undefined> {
    const ready = await this.ensureReady();
    if (!ready) return undefined;
    const started = Date.now();
    try {
      let shouldFallbackToLegacyCompletion = false;
      try {
        const chatResponse = await axios.post(`${endpointBase(this.config.endpoint)}/v1/chat/completions`, {
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: maxTokens ?? this.config.maxTokens
        }, { timeout: this.config.timeoutMs });
        const content = chatResponse.data?.choices?.[0]?.message?.content;
        if (content != null) {
          updateLocalAiRuntimeTelemetry({
            selectedRuntime,
            modelPath: effectiveModelPath(this.config),
            serverPid: serverProcess?.pid
          });
          return String(content).trim();
        }
      } catch (chatError: any) {
        const status = chatError?.response?.status;
        shouldFallbackToLegacyCompletion = status === 404 || status === 405;
        if (!shouldFallbackToLegacyCompletion) {
          lastError = chatError?.response?.data?.error?.message
            || chatError?.response?.data?.error
            || chatError?.message
            || String(chatError);
          return undefined;
        }
      }

      if (!shouldFallbackToLegacyCompletion) return undefined;
      const response = await axios.post(`${endpointBase(this.config.endpoint)}/completion`, {
        prompt,
        n_predict: maxTokens ?? this.config.maxTokens,
        stop: ["\n\n\n"]
      }, { timeout: this.config.timeoutMs });
      updateLocalAiRuntimeTelemetry({
        selectedRuntime,
        modelPath: effectiveModelPath(this.config),
        serverPid: serverProcess?.pid
      });
      return String(response.data?.content ?? response.data?.response ?? "").trim();
    } catch (error: any) {
      lastError = error?.response?.data?.error || error?.message || String(error);
      console.error(`Local AI completion failed after ${Date.now() - started}ms:`, lastError);
      return undefined;
    }
  }

  async stopServer() {
    await this.syncExternalRuntime();
    stopLlamaCppServer();
  }
}

export function stopLlamaCppServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (!serverProcess && externalServerPid && process.platform === "win32") {
    try {
      const exe = selectedServerPath || "";
      const workerRuntimeRoot = path.dirname(path.dirname(defaultCpuServerPath()));
      if (exe.toLowerCase().includes(path.normalize(workerRuntimeRoot).toLowerCase())) {
        execFileSync("taskkill.exe", ["/PID", String(externalServerPid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      }
    } catch {
      // best effort only
    }
  }
  startedByWorker = false;
  selectedRuntime = undefined;
  selectedServerPath = undefined;
  externalServerPid = undefined;
  updateLocalAiRuntimeTelemetry({ selectedRuntime: undefined, serverPid: undefined });
}
