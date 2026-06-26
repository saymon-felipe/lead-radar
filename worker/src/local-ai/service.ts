import { loadLocalAiConfig, saveLocalAiConfig } from "./config";
import { safeParseJson, truncate } from "./json";
import { LlamaCppClient } from "./llamaCppClient";
import { setupLocalAi } from "./setup";
import { recordLocalAiMetric, getLocalAiTelemetry } from "./telemetry";
import {
  HtmlCleaningInput,
  HtmlCleaningResult,
  LocalAiConfig,
  LocalAiDiagnostics,
  LocalAiRuntimeStatus,
  LocalAiTaskName,
  PersonNameCheckInput,
  PersonNameCheckResult,
  QueryRewriteInput,
  QueryRewriteResult,
  SerpClassificationInput,
  SerpClassificationResult
} from "./types";

const disabledPersonName: PersonNameCheckResult = { isPerson: true, confidence: 0, entityType: "unknown", reasonCode: "local_ai_disabled" };
const MAX_FAILURE_STREAK = 2;
const taskFailureStreaks = new Map<LocalAiTaskName, number>();

export class LocalAiService {
  private config: LocalAiConfig;
  private llama: LlamaCppClient;

  constructor() {
    this.config = loadLocalAiConfig();
    this.llama = new LlamaCppClient(this.config);
  }

  getConfig() {
    return this.config;
  }

  setConfig(update: Partial<LocalAiConfig>) {
    this.config = saveLocalAiConfig({ ...this.config, ...update, tasks: { ...this.config.tasks, ...(update.tasks || {}) } });
    this.llama.updateConfig(this.config);
    return this.config;
  }

  async status(): Promise<LocalAiRuntimeStatus> {
    const available = await this.llama.health();
    const status = await this.llama.runtimeStatus(available);
    status.telemetry = await getLocalAiTelemetry();
    return status;
  }

  async diagnostics(): Promise<LocalAiDiagnostics> {
    const available = await this.llama.health();
    return this.llama.diagnostics(available);
  }

  async startRuntime(): Promise<LocalAiRuntimeStatus> {
    const available = await this.llama.ensureReady();
    const status = await this.llama.runtimeStatus(available);
    status.telemetry = await getLocalAiTelemetry();
    return status;
  }

  async stopRuntime(): Promise<LocalAiRuntimeStatus> {
    await this.llama.stopServer();
    const status = await this.llama.runtimeStatus(false);
    status.telemetry = await getLocalAiTelemetry();
    return status;
  }

  async setupRuntime() {
    return setupLocalAi((level, message) => {
      const prefix = level === "error" ? "[local-ai setup error]" : level === "warn" ? "[local-ai setup warn]" : "[local-ai setup]";
      console.log(prefix, message);
    });
  }

  async telemetry() {
    return getLocalAiTelemetry();
  }

  async testRuntime() {
    const prompt = [
      "Voce e um classificador de nomes pessoais.",
      "Exemplos:",
      "{\"input\":\"Clinica Vida\",\"isPerson\":false}",
      "{\"input\":\"Maria Fernanda Souza\",\"isPerson\":true}",
      "Agora classifique exatamente este texto: Danilo Mulari",
      "Responda somente JSON minificado neste formato:",
      "{\"isPerson\":true,\"confidence\":0.99,\"reasonCode\":\"personal_name\"}"
    ].join("\n");
    const started = Date.now();
    const raw = await this.llama.complete(prompt, 64);
    const latencyMs = Date.now() - started;
    if (!raw) {
      recordLocalAiMetric({ task: "personName", ok: false, inputChars: prompt.length, outputChars: 0, elapsedMs: latencyMs, error: "test_failed" });
      return { ok: false, latencyMs, text: "", error: "Runtime local indisponivel ou sem resposta." };
    }
    recordLocalAiMetric({ task: "personName", ok: true, inputChars: prompt.length, outputChars: raw.length, elapsedMs: latencyMs, model: this.config.modelPath });
    return { ok: true, latencyMs, text: raw, parsed: safeParseJson(raw, undefined) };
  }

  private async completeJson<T>(task: LocalAiTaskName, prompt: string, fallback: T, maxTokens?: number): Promise<T> {
    if (!this.config.enabled || !this.config.tasks[task]) return fallback;
    if ((taskFailureStreaks.get(task) || 0) >= MAX_FAILURE_STREAK) {
      recordLocalAiMetric({ task, ok: false, inputChars: prompt.length, outputChars: 0, elapsedMs: 0, error: "task_circuit_open" });
      return fallback;
    }
    const started = Date.now();
    const raw = await this.llama.complete(prompt, maxTokens);
    const elapsedMs = Date.now() - started;
    if (!raw) {
      taskFailureStreaks.set(task, (taskFailureStreaks.get(task) || 0) + 1);
      recordLocalAiMetric({ task, ok: false, inputChars: prompt.length, outputChars: 0, elapsedMs, error: "empty_or_unavailable" });
      return fallback;
    }
    const parsed = safeParseJson(raw, fallback);
    taskFailureStreaks.set(task, 0);
    recordLocalAiMetric({ task, ok: true, inputChars: prompt.length, outputChars: raw.length, elapsedMs, model: this.config.modelPath });
    return parsed;
  }

  async checkPersonName(input: PersonNameCheckInput): Promise<PersonNameCheckResult> {
    const prompt = `<json>\nVocÃª Ã© um filtro local do Lead Radar. Classifique se o texto Ã© nome de profissional individual humano.\nRejeite empresas, clÃ­nicas, diretÃ³rios, bairros, cidades, endereÃ§os, botÃµes, menus, especialidades e textos de interface.\nRetorne apenas JSON minificado: {"isPerson":boolean,"confidence":0-1,"cleanedName":"...","entityType":"person|organization|location|ui_text|specialty|unknown","reasonCode":"..."}\nEntrada:${JSON.stringify({
      name: input.name,
      evidence: truncate(input.evidence || "", 600),
      city: input.city,
      niche: input.niche
    })}\n</json>`;
    return this.completeJson("personName", prompt, disabledPersonName, 128);
  }

  async classifySerp(input: SerpClassificationInput): Promise<SerpClassificationResult> {
    const fallback: SerpClassificationResult = { type: "noise", confidence: 0, shouldInspect: false, reasonCode: "local_ai_disabled" };
    const prompt = `<json>\nClassifique um resultado de busca para prospecÃ§Ã£o de psicÃ³logos.\nTipos: professional, instagram, directory, own_website, contact_candidate, noise.\nRetorne apenas JSON minificado: {"type":"...","confidence":0-1,"shouldInspect":boolean,"reasonCode":"..."}\nRejeite anÃºncios, LinkedIn, Facebook, notÃ­cias, diretÃ³rios genÃ©ricos sem nome e textos fora do nicho.\nEntrada:${JSON.stringify({
      title: truncate(input.title, 240),
      url: input.url,
      snippet: truncate(input.snippet || "", 500),
      expectedName: input.expectedName,
      city: input.city,
      niche: input.niche
    })}\n</json>`;
    return this.completeJson("serpClassification", prompt, fallback, 96);
  }

  async rewriteQueries(input: QueryRewriteInput): Promise<QueryRewriteResult> {
    const fallback: QueryRewriteResult = { queries: [], confidence: 0 };
    const prompt = `<json>\nGere atÃ© 3 buscas melhores em portuguÃªs para encontrar dados faltantes de um psicÃ³logo.\nUse aspas no nome quando houver nome. NÃ£o gere consultas amplas demais.\nRetorne apenas JSON minificado: {"queries":["..."],"confidence":0-1}\nEntrada:${JSON.stringify({
      originalQuery: input.originalQuery,
      professionalName: input.professionalName,
      city: input.city,
      state: input.state,
      niche: input.niche,
      missing: input.missing,
      failedQueries: input.failedQueries?.slice(0, 4)
    })}\n</json>`;
    return this.completeJson("queryRewrite", prompt, fallback, 160);
  }

  async cleanHtmlText(input: HtmlCleaningInput): Promise<HtmlCleaningResult> {
    const fallback: HtmlCleaningResult = { relevantText: truncate(input.text, 1800), confidence: 0 };
    if (input.text.length > 1600) {
      recordLocalAiMetric({ task: "htmlCleaning", ok: false, inputChars: input.text.length, outputChars: 0, elapsedMs: 0, error: "html_too_large_for_local_ai" });
      return fallback;
    }
    const prompt = `<json>\nExtraia sÃ³ o texto Ãºtil para ${input.purpose}. Remova menu, footer, LGPD, anÃºncios, repetiÃ§Ã£o e navegaÃ§Ã£o.\nRetorne apenas JSON minificado: {"relevantText":"...","names":["..."],"phones":["..."],"instagramHandles":["..."],"confidence":0-1}\nEntrada:${JSON.stringify({
      url: input.url,
      title: input.title,
      expectedName: input.expectedName,
      text: truncate(input.text, 1400)
    })}\n</json>`;
    return this.completeJson("htmlCleaning", prompt, fallback, 96);
  }
}

let singleton: LocalAiService | undefined;

export function getLocalAiService(): LocalAiService {
  if (!singleton) singleton = new LocalAiService();
  return singleton;
}

