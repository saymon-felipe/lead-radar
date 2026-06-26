import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { defaultCpuServerPath, defaultCudaServerPath, defaultModelPath, workerRootDir } from "./config";

export const DEFAULT_MODEL_REPO = "bartowski/Llama-3.2-1B-Instruct-GGUF";
export const DEFAULT_MODEL_FILE = "Llama-3.2-1B-Instruct-Q4_K_M.gguf";
export const DEFAULT_MODEL_OUTPUT = "lead-radar-local.gguf";

const LLAMA_RELEASE_URL = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface SetupLog {
  level: "info" | "warn" | "error";
  message: string;
}

export interface LocalAiSetupResult {
  started: boolean;
  completed: boolean;
  cpuRuntimeFound: boolean;
  cudaRuntimeFound: boolean;
  modelFound: boolean;
  cpuServerPath: string;
  cudaServerPath: string;
  modelPath: string;
  logs: SetupLog[];
  error?: string;
}

type Logger = (level: SetupLog["level"], message: string) => void;

function paths() {
  const root = workerRootDir();
  return {
    root,
    cpuDir: path.join(root, "vendor", "llama.cpp", "cpu"),
    cudaDir: path.join(root, "vendor", "llama.cpp", "cuda"),
    modelsDir: path.join(root, "vendor", "models"),
    tmpDir: path.join(root, "vendor", "tmp"),
    modelPath: path.join(root, "vendor", "models", DEFAULT_MODEL_OUTPUT)
  };
}

async function ensureDirs() {
  const p = paths();
  await Promise.all([
    fs.promises.mkdir(p.cpuDir, { recursive: true }),
    fs.promises.mkdir(p.cudaDir, { recursive: true }),
    fs.promises.mkdir(p.modelsDir, { recursive: true }),
    fs.promises.mkdir(p.tmpDir, { recursive: true })
  ]);
  for (const dir of [p.cpuDir, p.cudaDir, p.modelsDir]) {
    const gitkeep = path.join(dir, ".gitkeep");
    if (!fs.existsSync(gitkeep)) await fs.promises.writeFile(gitkeep, "");
  }
}

async function fetchWithRetry(url: string, options: { headers?: Record<string, string> } = {}, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "lead-radar-worker-local-ai-setup",
          ...(options.headers || {})
        }
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function downloadFile(url: string, outputPath: string, log: Logger) {
  if (fs.existsSync(outputPath) && (await fs.promises.stat(outputPath)).size > 0) {
    log("info", `Ja existe, pulando download: ${outputPath}`);
    return;
  }
  log("info", `Baixando ${url}`);
  const response = await fetchWithRetry(url, {});
  if (!response.body) throw new Error(`Resposta sem corpo para ${url}`);

  const contentLength = Number(response.headers.get("content-length") || 0);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const partialPath = `${outputPath}.partial`;
  await fs.promises.rm(partialPath, { force: true });

  const writer = fs.createWriteStream(partialPath);
  const reader = response.body.getReader();

  let downloadedBytes = 0;
  let lastLoggedPercent = -10;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      writer.write(value);
      downloadedBytes += value.length;

      if (contentLength > 0) {
        const percent = Math.floor((downloadedBytes / contentLength) * 100);
        if (percent >= lastLoggedPercent + 10) {
          lastLoggedPercent = percent;
          log("info", `Progresso do download: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${(contentLength / 1024 / 1024).toFixed(1)} MB)`);
        }
      } else {
        const mb = Math.floor(downloadedBytes / 1024 / 1024);
        if (mb % 50 === 0 && mb > 0) {
          log("info", `Progresso do download: ${mb} MB baixados`);
        }
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      writer.end((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  await fs.promises.rename(partialPath, outputPath);
}

async function readLatestReleaseAssets(): Promise<ReleaseAsset[]> {
  const response = await fetchWithRetry(LLAMA_RELEASE_URL, {});
  const payload: any = await response.json();
  return Array.isArray(payload.assets) ? payload.assets : [];
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function assetScore(asset: ReleaseAsset, kind: "cpu" | "cuda" | "cuda-runtime"): number {
  const name = asset.name.toLowerCase();
  if (!name.endsWith(".zip")) return -1000;
  if (!hasAny(name, ["win", "windows"]) || !hasAny(name, ["x64", "amd64"])) return -1000;

  if (kind === "cpu") {
    let score = 0;
    if (name.includes("cpu")) score += 80;
    if (name.includes("bin")) score += 20;
    if (name.includes("llama")) score += 10;
    if (hasAny(name, ["cuda", "cudart", "vulkan", "rocm", "metal", "opencl"])) score -= 200;
    return score;
  }

  if (kind === "cuda") {
    let score = 0;
    if (name.includes("cuda")) score += 80;
    if (name.includes("bin")) score += 20;
    if (name.includes("llama")) score += 10;
    if (hasAny(name, ["cudart", "runtime", "dll"])) score -= 120;
    if (hasAny(name, ["vulkan", "rocm", "metal", "opencl"])) score -= 200;
    return score;
  }

  let score = 0;
  if (name.includes("cudart")) score += 100;
  if (name.includes("runtime")) score += 40;
  if (name.includes("dll")) score += 30;
  if (name.includes("cuda")) score += 20;
  if (name.includes("llama")) score += 5;
  return score;
}

function selectAsset(assets: ReleaseAsset[], kind: "cpu" | "cuda" | "cuda-runtime") {
  return assets
    .map((asset) => ({ asset, score: assetScore(asset, kind) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.asset;
}

async function runCommand(command: string, args: string[], timeoutMs: number) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        const detail = `${stderr || stdout}`.trim().slice(-1200);
        reject(new Error(`${command} exited with code ${code}${detail ? `: ${detail}` : ""}`));
      }
    });
  });
}

async function extractZip(zipPath: string, outputDir: string) {
  await fs.promises.rm(outputDir, { recursive: true, force: true });
  await fs.promises.mkdir(outputDir, { recursive: true });
  if (process.platform === "win32") {
    await runCommand("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command",
      "& { param($zipPath, $outputDir) Expand-Archive -LiteralPath $zipPath -DestinationPath $outputDir -Force }",
      zipPath,
      outputDir
    ], 120000);
    return;
  }
  await runCommand("unzip", ["-o", zipPath, "-d", outputDir], 120000);
}

async function findFiles(root: string, predicate: (fileName: string) => boolean): Promise<string[]> {
  const found: string[] = [];
  const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...await findFiles(fullPath, predicate));
    else if (predicate(entry.name)) found.push(fullPath);
  }
  return found;
}

async function copyRuntimeFromExtract(extractDir: string, targetDir: string, log: Logger): Promise<boolean> {
  const executableName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const serverPath = (await findFiles(extractDir, (fileName) => fileName.toLowerCase() === executableName))[0];
  if (!serverPath) return false;
  const sourceDir = path.dirname(serverPath);
  await fs.promises.mkdir(targetDir, { recursive: true });
  await fs.promises.cp(sourceDir, targetDir, { recursive: true, force: true });
  log("info", `Runtime copiado de ${sourceDir} para ${targetDir}`);
  return true;
}

async function copyDllsFromExtract(extractDir: string, targetDir: string, log: Logger) {
  const dlls = await findFiles(extractDir, (fileName) => fileName.toLowerCase().endsWith(".dll"));
  for (const dll of dlls) {
    const output = path.join(targetDir, path.basename(dll));
    await fs.promises.copyFile(dll, output);
  }
  if (dlls.length) log("info", `${dlls.length} DLL(s) CUDA copiadas para ${targetDir}`);
}

async function cudaRuntimeDllsFound(targetDir: string): Promise<boolean> {
  const entries = await fs.promises.readdir(targetDir).catch(() => []);
  return entries.some((entry) => /^cudart.*\.dll$/i.test(entry))
    && entries.some((entry) => /^cublas.*\.dll$/i.test(entry));
}

async function setupLlamaCpp(log: Logger) {
  const p = paths();
  const cpuReady = fs.existsSync(defaultCpuServerPath());
  const cudaReady = fs.existsSync(defaultCudaServerPath());
  const cudaRuntimeReady = await cudaRuntimeDllsFound(p.cudaDir);

  if (cpuReady && cudaReady && cudaRuntimeReady) {
    log("info", "Runtimes CPU/CUDA e DLLs CUDA ja estao preparados; pulando downloads e extracao.");
    return;
  }

  const assets = await readLatestReleaseAssets();
  const cpuAsset = selectAsset(assets, "cpu");
  const cudaAsset = selectAsset(assets, "cuda");
  const cudaRuntimeAsset = selectAsset(assets, "cuda-runtime");

  if (!cpuAsset) {
    throw new Error(`Asset CPU Windows x64 nao encontrado na latest release. Assets vistos: ${assets.map((asset) => asset.name).join(", ")}`);
  }
  if (!cudaAsset) {
    log("warn", `Asset CUDA Windows x64 nao encontrado na latest release. O setup continuara com CPU.`);
  }
  if (!cudaRuntimeAsset) {
    log("warn", "Pacote separado de DLL/runtime CUDA nao encontrado. Isso pode ser normal se as DLLs vierem no zip CUDA principal.");
  }
  log("info", `Asset CPU selecionado: ${cpuAsset.name}`);
  if (cudaAsset) log("info", `Asset CUDA selecionado: ${cudaAsset.name}`);
  if (cudaRuntimeAsset) log("info", `Asset runtime CUDA selecionado: ${cudaRuntimeAsset.name}`);

  const downloads = [
    ...(!cpuReady ? [{ asset: cpuAsset, targetDir: p.cpuDir, kind: "cpu" }] : []),
    ...(!cudaReady && cudaAsset ? [{ asset: cudaAsset, targetDir: p.cudaDir, kind: "cuda" }] : []),
    ...(!cudaRuntimeReady && cudaRuntimeAsset ? [{ asset: cudaRuntimeAsset, targetDir: p.cudaDir, kind: "cuda-runtime" }] : [])
  ];

  for (const item of downloads) {
    if (item.kind === "cpu" && fs.existsSync(defaultCpuServerPath())) {
      log("info", "Runtime CPU ja encontrado; pulando extracao.");
      continue;
    }
    if (item.kind === "cuda" && fs.existsSync(defaultCudaServerPath())) {
      log("info", "Runtime CUDA ja encontrado; pulando extracao.");
      continue;
    }
    if (item.kind === "cuda-runtime" && await cudaRuntimeDllsFound(item.targetDir)) {
      log("info", "DLLs CUDA ja encontradas; pulando extracao do runtime CUDA.");
      continue;
    }
    const zipPath = path.join(p.tmpDir, item.asset.name);
    const extractDir = path.join(p.tmpDir, item.asset.name.replace(/\.zip$/i, ""));
    await downloadFile(item.asset.browser_download_url, zipPath, log);
    log("info", `Extraindo ${item.asset.name}`);
    try {
      await extractZip(zipPath, extractDir);
    } catch (error: any) {
      log("warn", `Falha ao extrair ${item.asset.name}; removendo zip local e baixando novamente. Detalhe: ${error?.message || String(error)}`);
      await fs.promises.rm(zipPath, { force: true });
      await downloadFile(item.asset.browser_download_url, zipPath, log);
      await extractZip(zipPath, extractDir);
    }
    if (item.kind === "cuda-runtime") {
      await copyDllsFromExtract(extractDir, item.targetDir, log);
    } else {
      const copied = await copyRuntimeFromExtract(extractDir, item.targetDir, log);
      if (!copied) throw new Error(`llama-server nao encontrado dentro de ${item.asset.name}`);
    }
  }
}

async function setupModel(log: Logger): Promise<string | undefined> {
  const p = paths();
  const url = `https://huggingface.co/${DEFAULT_MODEL_REPO}/resolve/main/${DEFAULT_MODEL_FILE}`;
  try {
    await downloadFile(url, p.modelPath, log);
    return undefined;
  } catch (error: any) {
    const message = `Falha ao baixar modelo GGUF: ${error?.message || String(error)}`;
    log("error", message);
    return message;
  }
}

export async function setupLocalAi(onLog?: Logger): Promise<LocalAiSetupResult> {
  const logs: SetupLog[] = [];
  const log: Logger = (level, message) => {
    logs.push({ level, message });
    onLog?.(level, message);
  };
  const p = paths();

  log("info", "Preparando pastas da IA local.");
  await ensureDirs();

  let error: string | undefined;
  try {
    await setupLlamaCpp(log);
  } catch (setupError: any) {
    error = String(setupError?.message || setupError);
    log("error", error);
  }

  const modelError = await setupModel(log);
  if (modelError && !error) error = modelError;
  if (!fs.existsSync(defaultCpuServerPath()) && !error) {
    error = "Runtime CPU nao foi preparado.";
    log("error", error);
  }
  if (!fs.existsSync(defaultCudaServerPath()) && !error) {
    error = "Runtime CUDA nao foi preparado.";
    log("error", error);
  }

  return {
    started: true,
    completed: !error && fs.existsSync(defaultCpuServerPath()) && fs.existsSync(defaultCudaServerPath()) && fs.existsSync(defaultModelPath()),
    cpuRuntimeFound: fs.existsSync(defaultCpuServerPath()),
    cudaRuntimeFound: fs.existsSync(defaultCudaServerPath()),
    modelFound: fs.existsSync(defaultModelPath()),
    cpuServerPath: defaultCpuServerPath(),
    cudaServerPath: defaultCudaServerPath(),
    modelPath: p.modelPath,
    logs,
    error
  };
}

export interface SetupState {
  running: boolean;
  completed: boolean;
  error?: string;
  logs: SetupLog[];
}

let activeSetupState: SetupState = {
  running: false,
  completed: false,
  logs: []
};

export function getActiveSetupState(): SetupState {
  return activeSetupState;
}

export function runSetupLocalAiInBackground(onFinished?: (result: LocalAiSetupResult) => void) {
  if (activeSetupState.running) return;

  activeSetupState = {
    running: true,
    completed: false,
    logs: []
  };

  const onLog: Logger = (level, message) => {
    activeSetupState.logs.push({ level, message });
  };

  setupLocalAi(onLog)
    .then((result) => {
      activeSetupState.running = false;
      activeSetupState.completed = result.completed;
      activeSetupState.error = result.error;
      onFinished?.(result);
    })
    .catch((err) => {
      activeSetupState.running = false;
      activeSetupState.completed = false;
      activeSetupState.error = err.message || String(err);
      activeSetupState.logs.push({ level: "error", message: `Erro fatal no setup: ${activeSetupState.error}` });
      onFinished?.({
        started: true,
        completed: false,
        cpuRuntimeFound: false,
        cudaRuntimeFound: false,
        modelFound: false,
        cpuServerPath: defaultCpuServerPath(),
        cudaServerPath: defaultCudaServerPath(),
        modelPath: defaultModelPath(),
        logs: activeSetupState.logs,
        error: activeSetupState.error
      });
    });
}
