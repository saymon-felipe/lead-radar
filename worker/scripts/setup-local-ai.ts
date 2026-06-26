import { setupLocalAi } from "../src/local-ai/setup";

async function main() {
  const result = await setupLocalAi((level, message) => {
    const prefix = level === "error" ? "[erro]" : level === "warn" ? "[aviso]" : "[info]";
    console.log(`${prefix} ${message}`);
  });

  console.log(JSON.stringify({
    completed: result.completed,
    cpuRuntimeFound: result.cpuRuntimeFound,
    cudaRuntimeFound: result.cudaRuntimeFound,
    modelFound: result.modelFound,
    cpuServerPath: result.cpuServerPath,
    cudaServerPath: result.cudaServerPath,
    modelPath: result.modelPath,
    error: result.error
  }, null, 2));

  if (!result.completed) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[erro]", error?.message || String(error));
  process.exitCode = 1;
});

