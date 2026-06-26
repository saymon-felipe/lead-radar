import os from "os";
import { LocalAiTelemetry, LocalAiUsageMetric, LocalAiTaskName } from "./types";
import { detectNvidia } from "./runtime";

const MAX_METRICS = 120;
const metrics: LocalAiUsageMetric[] = [];
let runtimeTelemetry: {
  selectedRuntime?: "cpu" | "cuda";
  modelPath?: string;
  serverPid?: number;
} = {};

function estimateTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

export function recordLocalAiMetric(input: {
  task: LocalAiTaskName;
  ok: boolean;
  inputChars: number;
  outputChars: number;
  elapsedMs: number;
  model?: string;
  error?: string;
}) {
  metrics.push({
    timestamp: new Date().toISOString(),
    task: input.task,
    ok: input.ok,
    inputChars: input.inputChars,
    outputChars: input.outputChars,
    estimatedInputTokens: estimateTokens(input.inputChars),
    estimatedOutputTokens: estimateTokens(input.outputChars),
    elapsedMs: input.elapsedMs,
    model: input.model,
    error: input.error
  });
  while (metrics.length > MAX_METRICS) metrics.shift();
}

export function updateLocalAiRuntimeTelemetry(input: {
  selectedRuntime?: "cpu" | "cuda";
  modelPath?: string;
  serverPid?: number;
}) {
  runtimeTelemetry = { ...runtimeTelemetry, ...input };
}

export async function getLocalAiTelemetry(): Promise<LocalAiTelemetry> {
  const calls = metrics.length;
  const ok = metrics.filter((metric) => metric.ok).length;
  const errors = calls - ok;
  const estimatedInputTokens = metrics.reduce((sum, metric) => sum + metric.estimatedInputTokens, 0);
  const estimatedOutputTokens = metrics.reduce((sum, metric) => sum + metric.estimatedOutputTokens, 0);
  const totalElapsedMs = metrics.reduce((sum, metric) => sum + metric.elapsedMs, 0);
  const lastLatencyMs = metrics[metrics.length - 1]?.elapsedMs ?? 0;
  const memoryTotal = os.totalmem();
  const memoryFree = os.freemem();
  const processMemory = process.memoryUsage().rss;
  const gpu = await detectNvidia(2500);

  return {
    totalCalls: calls,
    successfulCalls: ok,
    failedCalls: errors,
    calls,
    ok,
    errors,
    estimatedInputTokens,
    estimatedOutputTokens,
    totalElapsedMs,
    averageLatencyMs: calls ? Math.round(totalElapsedMs / calls) : 0,
    lastLatencyMs,
    selectedRuntime: runtimeTelemetry.selectedRuntime,
    modelPath: runtimeTelemetry.modelPath,
    serverPid: runtimeTelemetry.serverPid,
    lastMetrics: metrics.slice(-30).reverse(),
    system: {
      cpuCount: os.cpus().length,
      loadAverage: os.loadavg(),
      memoryUsedMb: Math.round((memoryTotal - memoryFree) / 1024 / 1024),
      memoryTotalMb: Math.round(memoryTotal / 1024 / 1024),
      processMemoryMb: Math.round(processMemory / 1024 / 1024),
      gpu: gpu.detected ? {
        name: gpu.name,
        memoryUsedMb: gpu.memoryUsedMb,
        memoryTotalMb: gpu.memoryTotalMb,
        utilizationPct: gpu.utilizationPct,
        raw: gpu.raw
      } : undefined
    }
  };
}
