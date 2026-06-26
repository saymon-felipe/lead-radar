import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface NvidiaInfo {
  detected: boolean;
  name?: string;
  memoryUsedMb?: number;
  memoryTotalMb?: number;
  utilizationPct?: number;
  raw?: string;
}

export async function detectNvidia(timeoutMs = 1800): Promise<NvidiaInfo> {
  if (process.platform !== "win32" && process.platform !== "linux") return { detected: false };
  try {
    const { stdout } = await execFileAsync("nvidia-smi", [
      "--query-gpu=name,memory.used,memory.total,utilization.gpu",
      "--format=csv,noheader,nounits"
    ], { timeout: timeoutMs });
    const first = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
    if (!first) return { detected: false };
    const [name, used, total, utilization] = first.split(",").map((value) => value.trim());
    return {
      detected: true,
      name,
      memoryUsedMb: Number(used) || undefined,
      memoryTotalMb: Number(total) || undefined,
      utilizationPct: Number(utilization) || undefined,
      raw: first
    };
  } catch {
    return { detected: false };
  }
}

