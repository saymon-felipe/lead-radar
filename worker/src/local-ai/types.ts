export type LocalAiProvider = "llama.cpp" | "disabled";
export type LocalAiDevice = "auto" | "cpu" | "cuda" | "vulkan";

export type LocalAiTaskName =
  | "personName"
  | "serpClassification"
  | "queryRewrite"
  | "htmlCleaning";

export interface LocalAiTaskFlags {
  personName: boolean;
  serpClassification: boolean;
  queryRewrite: boolean;
  htmlCleaning: boolean;
}

export interface LocalAiConfig {
  enabled: boolean;
  provider: LocalAiProvider;
  endpoint: string;
  modelPath?: string;
  /**
   * Manual llama-server path. When empty or invalid, the worker auto-selects
   * the bundled CPU/CUDA runtime paths.
   */
  serverPath?: string;
  device: LocalAiDevice;
  strictCuda?: boolean;
  contextSize: number;
  maxTokens: number;
  timeoutMs: number;
  autoStartServer: boolean;
  tasks: LocalAiTaskFlags;
}

export interface LocalAiRuntimeStatus {
  enabled: boolean;
  provider: LocalAiProvider;
  available: boolean;
  endpoint: string;
  modelPath?: string;
  serverPath?: string;
  cpuServerPath: string;
  cudaServerPath: string;
  selectedRuntime?: "cpu" | "cuda";
  cpuRuntimeFound: boolean;
  cudaRuntimeFound: boolean;
  nvidiaDetected: boolean;
  device: LocalAiDevice;
  serverStartedByWorker: boolean;
  serverFileExists: boolean;
  modelFileExists: boolean;
  canAutoStart: boolean;
  lastError?: string;
  lastFallbackReason?: string;
  serverPid?: number;
  telemetry?: LocalAiTelemetry;
}

export interface LocalAiDiagnostics {
  ok: boolean;
  available: boolean;
  selectedRuntime?: "cpu" | "cuda";
  cpuRuntimeFound: boolean;
  cudaRuntimeFound: boolean;
  nvidiaDetected: boolean;
  serverFileExists: boolean;
  modelFileExists: boolean;
  serverPath?: string;
  cpuServerPath: string;
  cudaServerPath: string;
  modelPath?: string;
  endpoint: string;
  device: LocalAiDevice;
  messages: string[];
}

export interface LocalAiUsageMetric {
  timestamp: string;
  task: LocalAiTaskName;
  ok: boolean;
  inputChars: number;
  outputChars: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  elapsedMs: number;
  model?: string;
  error?: string;
}

export interface LocalAiTelemetry {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  calls: number;
  ok: number;
  errors: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  totalElapsedMs: number;
  averageLatencyMs: number;
  lastLatencyMs: number;
  selectedRuntime?: "cpu" | "cuda";
  modelPath?: string;
  serverPid?: number;
  lastMetrics: LocalAiUsageMetric[];
  system: {
    cpuCount: number;
    loadAverage: number[];
    memoryUsedMb: number;
    memoryTotalMb: number;
    processMemoryMb: number;
    gpu?: {
      name?: string;
      memoryUsedMb?: number;
      memoryTotalMb?: number;
      utilizationPct?: number;
      raw?: string;
    };
  };
}

export interface PersonNameCheckInput {
  name: string;
  evidence?: string;
  city?: string;
  niche?: string;
}

export interface PersonNameCheckResult {
  isPerson: boolean;
  confidence: number;
  cleanedName?: string;
  entityType?: "person" | "organization" | "location" | "ui_text" | "specialty" | "unknown";
  reasonCode?: string;
}

export interface SerpClassificationInput {
  title: string;
  url: string;
  snippet?: string;
  expectedName?: string;
  city?: string;
  niche?: string;
}

export interface SerpClassificationResult {
  type: "professional" | "instagram" | "directory" | "own_website" | "contact_candidate" | "noise";
  confidence: number;
  shouldInspect: boolean;
  reasonCode?: string;
}

export interface QueryRewriteInput {
  originalQuery: string;
  professionalName?: string;
  city?: string;
  state?: string;
  niche?: string;
  missing: Array<"instagram" | "phone" | "website" | "crp">;
  failedQueries?: string[];
}

export interface QueryRewriteResult {
  queries: string[];
  confidence: number;
}

export interface HtmlCleaningInput {
  url: string;
  title?: string;
  text: string;
  purpose: "card_extraction" | "contact_extraction" | "profile_validation";
  expectedName?: string;
}

export interface HtmlCleaningResult {
  relevantText: string;
  names?: string[];
  phones?: string[];
  instagramHandles?: string[];
  confidence: number;
}
