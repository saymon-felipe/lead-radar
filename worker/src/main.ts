import { app, Tray, Menu, shell, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import express from "express";
import cors from "cors";
import axios from "axios";
import { runDiscovery } from "./runner";
import { getLocalAiService } from "./local-ai/service";
import { stopLlamaCppServer } from "./local-ai/llamaCppClient";
import { renderWorkerPanelV2 } from "./panel";

// Configuration file path
const CONFIG_PATH = path.join(os.homedir(), ".lead-radar-worker.json");

interface WorkerConfig {
  deviceId: string;
  workerToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  apiBaseUrl: string;
  environment: "development" | "production";
  /**
   * Manual login gate: when the user explicitly clicks Login in the tray we allow
   * the browser UI to provision fresh tokens. If the user clicked Logout, this
   * flag is false and the UI must not silently re-authenticate the worker.
   */
  loginRequestedAt?: string;
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
const localAi = getLocalAiService();

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

function getFrontendUrl(): string {
  return config.environment === "development"
    ? "http://localhost:5173"
    : "https://lead-radar-lilac.vercel.app";
}

function beginManualLogin() {
  config.loginRequestedAt = new Date().toISOString();
  saveConfig();
  updateTrayMenu();
  shell.openExternal(`${getFrontendUrl()}/auth`);
}

function hasPendingManualLogin(): boolean {
  return Boolean(config.loginRequestedAt && !config.workerToken);
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
  if (!config.refreshToken) {
    if (force) {
      return false;
    }
    return Boolean(config.workerToken);
  }
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
    if (error.response?.status === 400 || error.response?.status === 401 || error.response?.status === 403) {
      logout();
    }
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
    { label: `Usuario: ${activeUserName || "Nenhum"}`, enabled: false },
    { type: "separator" },
    ...(isLogged
      ? [
          {
            label: "Logout",
            click: () => {
              logout();
            }
          }
        ]
      : [
          {
            label: "Login",
            click: () => {
              beginManualLogin();
            }
          }
        ]),
    {
      label: "Abrir painel do worker",
      click: () => {
        shell.openExternal("http://127.0.0.1:4004/");
      }
    },
    {
      label: "Alternar Ambiente",
      click: () => {
        config.environment = config.environment === "development" ? "production" : "development";
        config.apiBaseUrl = config.environment === "development" ? "http://localhost:3333" : "https://lead-radar-a4f3b681073a.herokuapp.com";
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
  config.loginRequestedAt = undefined;
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
    const isAuthError =
      error.message === "Worker não autenticado ou sessão expirada" ||
      error.response?.status === 401 ||
      error.response?.status === 403;

    if (isAuthError) {
      const refreshed = await refreshSessionIfNeeded(true);
      if (!refreshed) {
        logout();
      }
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


function renderWorkerPanel() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lead Radar Worker</title>
  <style>
    :root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#e5edf7;background:#08111f}body{margin:0;background:radial-gradient(circle at top left,#17345f,#08111f 45%,#04070d);min-height:100vh}.wrap{max-width:980px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.card{background:rgba(255,255,255,.075);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:16px;box-shadow:0 18px 50px rgba(0,0,0,.24);backdrop-filter:blur(12px)}h1{font-size:22px;margin:0 0 18px}.muted{color:#9fb0c8;font-size:13px}.row{display:flex;justify-content:space-between;gap:12px;margin:8px 0}.pill{padding:4px 9px;border-radius:999px;background:#163b71;color:#bcd7ff;font-size:12px}.ok{background:#0d5f43;color:#b8ffe4}.bad{background:#6a1c2b;color:#ffd0d7}.warn{background:#704c0f;color:#ffe7a3}button{border:0;border-radius:12px;padding:9px 12px;background:#2f80ed;color:white;font-weight:700;cursor:pointer}button.secondary{background:#253550}button.danger{background:#ad2d42}button:disabled{opacity:.6;cursor:not-allowed}input,select{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#0a1628;color:#e5edf7;padding:10px;margin-top:4px}input[type=checkbox]{width:auto;margin-right:8px}label{display:block;margin:10px 0;font-size:13px}.actions{display:flex;gap:8px;flex-wrap:wrap}pre{white-space:pre-wrap;background:#050b14;border-radius:12px;padding:12px;max-height:260px;overflow:auto}.tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}.tab{background:#13233d}.tab.active{background:#2f80ed}.hidden{display:none}.banner{margin:0 0 14px;padding:10px 12px;border-radius:14px;background:rgba(47,128,237,.14);border:1px solid rgba(47,128,237,.28);color:#cfe2ff}.error{background:rgba(173,45,66,.18);border-color:rgba(173,45,66,.35);color:#ffd9df}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Lead Radar Worker</h1>
    <div id="notice" class="banner hidden"></div>
    <div class="tabs">
      <button class="tab active" type="button" data-tab="status">Sessão</button>
      <button class="tab" type="button" data-tab="ai">IA local</button>
      <button class="tab" type="button" data-tab="telemetry">Telemetria</button>
      <button class="tab" type="button" data-tab="logs">Logs</button>
    </div>
    <section id="status" class="grid"></section>
    <section id="ai" class="grid hidden"></section>
    <section id="telemetry" class="grid hidden"></section>
    <section id="logs" class="hidden"><div class="card"><pre id="logbox">Carregando...</pre></div></section>
  </div>
<script>
(function(){
  var state = { activeTab: 'status', last: {} };
  function byId(id){ return document.getElementById(id); }
  function esc(value){ return String(value == null ? '' : value).replace(/[&<>\"']/g,function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]; }); }
  function row(label,value){ return '<div class="row"><span class="muted">'+esc(label)+'</span><strong>'+String(value == null ? '—' : value)+'</strong></div>'; }
  function badge(text,kind){ return '<span class="pill '+(kind||'')+'">'+esc(text)+'</span>'; }
  function showNotice(message,isError){ var el=byId('notice'); if(!message){ el.classList.add('hidden'); return; } el.textContent=message; el.classList.toggle('error',Boolean(isError)); el.classList.remove('hidden'); }
  function showTab(id){ state.activeTab=id; document.querySelectorAll('section').forEach(function(s){ s.classList.add('hidden'); }); byId(id).classList.remove('hidden'); document.querySelectorAll('.tab').forEach(function(b){ b.classList.toggle('active',b.getAttribute('data-tab')===id); }); }
  async function api(path,opts){ var options=opts||{}; var res=await fetch(path,Object.assign({headers:{'content-type':'application/json'}},options)); var text=await res.text(); var data=text?JSON.parse(text):{}; if(!res.ok){ throw new Error(data.error || data.message || ('HTTP '+res.status)); } return data; }
  async function saveAi(){
    var payload={
      enabled: byId('aiEnabled').checked,
      provider:'llama.cpp',
      endpoint: byId('endpoint').value,
      serverPath: byId('serverPath').value,
      modelPath: byId('modelPath').value,
      device: byId('device').value,
      strictCuda: byId('strictCuda').checked,
      autoStartServer: byId('autoStart').checked,
      tasks:{
        personName: byId('taskPerson').checked,
        serpClassification: byId('taskSerp').checked,
        queryRewrite: byId('taskQuery').checked,
        htmlCleaning: byId('taskHtml').checked
      }
    };
    var saved=await api('/v1/local-ai/config',{method:'POST',body:JSON.stringify(payload)});
    showNotice('Configuração de IA local salva'+(saved.status && saved.status.available?' e runtime disponível.':'.'),false);
    await refresh();
  }
  async function startRuntime(){
    showNotice('Iniciando/testando runtime local...',false);
    var result=await api('/v1/local-ai/start',{method:'POST'});
    showNotice(result.status && result.status.available ? 'Runtime local disponível.' : 'Runtime local indisponível. Verifique caminho do llama-server e modelo GGUF.', !(result.status && result.status.available));
    await refresh();
  }
  async function stopRuntime(){
    var result=await api('/v1/local-ai/stop',{method:'POST'});
    showNotice(result.status && !result.status.available ? 'Runtime local parado.' : 'Solicitacao de parada enviada.',false);
    await refresh();
  }
  async function setupRuntime(){
    showNotice('Preparando IA local. Downloads grandes podem levar alguns minutos...',false);
    var result=await api('/v1/local-ai/setup',{method:'POST'});
    showNotice(result.completed ? 'IA local preparada.' : ('Setup terminou com aviso/erro: '+(result.error||'ver logs')), !result.completed);
    await refresh();
  }
  async function testRuntime(){
    showNotice('Testando chamada curta no modelo local...',false);
    var result=await api('/v1/local-ai/test',{method:'POST'});
    showNotice(result.ok ? ('Teste OK em '+result.latencyMs+' ms') : ('Teste falhou: '+(result.error||'sem resposta')), !result.ok);
    await refresh();
  }
  async function login(){ await api('/v1/login-request',{method:'POST'}); showNotice('Login solicitado. Complete o login na janela do navegador.',false); await refresh(); }
  async function logout(){ await api('/v1/logout',{method:'POST'}); showNotice('Logout efetuado. O worker não fará login automático.',false); await refresh(); }
  function renderStatus(health){
    byId('status').innerHTML =
      '<div class="card"><h3>Sessão</h3>'+
      row('Status',health.isLogged?badge('Logado','ok'):badge('Desconectado','bad'))+
      row('Worker',esc(health.runStatus||'idle'))+
      row('API',esc(health.apiBaseUrl||'—'))+
      row('Usuário',esc(health.userName||'—'))+
      '<div class="actions"><button id="loginBtn" type="button">Login</button><button id="logoutBtn" class="danger" type="button">Logout</button></div></div>'+
      '<div class="card"><h3>Run atual</h3>'+row('Estado',esc(health.runStatus||'idle'))+row('Login solicitado',esc(String(Boolean(health.loginRequested))))+'</div>';
    byId('loginBtn').addEventListener('click',function(){ login().catch(function(e){ showNotice(e.message,true); }); });
    byId('logoutBtn').addEventListener('click',function(){ logout().catch(function(e){ showNotice(e.message,true); }); });
  }
  function renderAi(ai){
    var c=ai.config||{}; var tasks=c.tasks||{}; var status=ai.status||{}; var diag=ai.diagnostics||{};
    var messages=(diag.messages||[]).map(function(message){return '<li>'+esc(message)+'</li>';}).join('');
    byId('ai').innerHTML =
      '<div class="card"><h3>Configuração IA local</h3>'+
      '<label><input id="aiEnabled" type="checkbox" '+(c.enabled?'checked':'')+'> Ativar IA local</label>'+
      '<label>Endpoint<input id="endpoint" value="'+esc(c.endpoint||'')+'"></label>'+
      '<label>Servidor llama.cpp<input id="serverPath" value="'+esc(c.serverPath||'')+'"></label>'+
      '<label>Modelo GGUF<input id="modelPath" value="'+esc(c.modelPath||'')+'"></label>'+
      '<label>Dispositivo<select id="device"><option value="auto">auto</option><option value="cpu">cpu</option><option value="cuda">cuda</option><option value="vulkan">vulkan</option></select></label>'+
      '<label><input id="strictCuda" type="checkbox" '+(c.strictCuda?'checked':'')+'> exigir CUDA sem fallback</label>'+
      '<label><input id="autoStart" type="checkbox" '+(c.autoStartServer?'checked':'')+'> iniciar llama-server automaticamente</label>'+
      '<div class="actions"><button id="saveAiBtn" type="button">Salvar</button><button id="setupRuntimeBtn" class="secondary" type="button">Preparar IA local</button><button id="startRuntimeBtn" class="secondary" type="button">Iniciar runtime</button><button id="testRuntimeBtn" class="secondary" type="button">Testar runtime</button><button id="stopRuntimeBtn" class="danger" type="button">Parar</button></div></div>'+
      '<div class="card"><h3>Tarefas</h3>'+
      '<label><input id="taskPerson" type="checkbox" '+(tasks.personName?'checked':'')+'> Validar nome de pessoa</label>'+
      '<label><input id="taskSerp" type="checkbox" '+(tasks.serpClassification?'checked':'')+'> Classificar SERP</label>'+
      '<label><input id="taskQuery" type="checkbox" '+(tasks.queryRewrite?'checked':'')+'> Reescrever queries zeradas</label>'+
      '<label><input id="taskHtml" type="checkbox" '+(tasks.htmlCleaning?'checked':'')+'> Limpeza inteligente de HTML</label></div>'+
      '<div class="card"><h3>Runtime</h3>'+
      row('Disponível',status.available?badge('sim','ok'):badge('não','bad'))+
      row('Provider',esc(status.provider||'—'))+
      row('CPU runtime',status.cpuRuntimeFound?badge('encontrado','ok'):badge('não encontrado','bad'))+
      row('CUDA runtime',status.cudaRuntimeFound?badge('encontrado','ok'):badge('não encontrado','bad'))+
      row('Modelo GGUF',status.modelFileExists?badge('encontrado','ok'):badge('não encontrado','bad'))+
      row('NVIDIA detectada',status.nvidiaDetected?badge('sim','ok'):badge('não','warn'))+
      row('Runtime selecionado',esc(status.selectedRuntime||'nenhum'))+
      row('Servidor usado',esc(status.serverPath||'—'))+
      row('Modelo usado',esc(status.modelPath||'—'))+
      row('Endpoint ativo',esc(status.endpoint||'—'))+
      row('Último fallback',esc(status.lastFallbackReason||'—'))+
      row('Auto-start possível',status.canAutoStart?badge('sim','ok'):badge('não','warn'))+
      row('Erro',esc(status.lastError||'—'))+
      (messages?'<div class="muted"><ul>'+messages+'</ul></div>':'')+
      '<p class="muted">Caminhos padrao: CPU em '+esc(status.cpuServerPath||'')+', CUDA em '+esc(status.cudaServerPath||'')+'. Campo manual vazio usa auto-select.</p>'+
      '</div>';
    byId('device').value=c.device||'auto';
    byId('saveAiBtn').addEventListener('click',function(){ saveAi().catch(function(e){ showNotice(e.message,true); }); });
    byId('setupRuntimeBtn').addEventListener('click',function(){ setupRuntime().catch(function(e){ showNotice(e.message,true); }); });
    byId('startRuntimeBtn').addEventListener('click',function(){ startRuntime().catch(function(e){ showNotice(e.message,true); }); });
    byId('testRuntimeBtn').addEventListener('click',function(){ testRuntime().catch(function(e){ showNotice(e.message,true); }); });
    byId('stopRuntimeBtn').addEventListener('click',function(){ stopRuntime().catch(function(e){ showNotice(e.message,true); }); });
  }
  function renderTelemetry(telemetry){
    var system=telemetry.system||{}; var gpu=system.gpu;
    byId('telemetry').innerHTML =
      '<div class="card"><h3>Uso</h3>'+row('Chamadas',telemetry.calls||0)+row('OK',telemetry.ok||0)+row('Erros',telemetry.errors||0)+row('Tokens entrada estim.',telemetry.estimatedInputTokens||0)+row('Tokens saída estim.',telemetry.estimatedOutputTokens||0)+row('Latência média',(telemetry.averageLatencyMs||0)+' ms')+'</div>'+
      '<div class="card"><h3>Sistema</h3>'+row('CPU cores',system.cpuCount||'—')+row('RAM',(system.memoryUsedMb||0)+' / '+(system.memoryTotalMb||0)+' MB')+row('Processo',(system.processMemoryMb||0)+' MB')+row('GPU',gpu?esc(gpu.name):'não detectada')+row('VRAM',gpu?((gpu.memoryUsedMb||0)+' / '+(gpu.memoryTotalMb||0)+' MB'):'—')+'</div>';
    byId('logbox').textContent=JSON.stringify(telemetry.lastMetrics||[],null,2);
  }
  async function refresh(){
    try{
      var all=await Promise.all([api('/v1/health'),api('/v1/local-ai/status'),api('/v1/local-ai/telemetry')]);
      state.last={health:all[0],ai:all[1],telemetry:all[2]};
      renderStatus(all[0]); renderAi(all[1]); renderTelemetry(all[2]); showTab(state.activeTab);
    }catch(e){ showNotice('Falha ao atualizar painel: '+e.message,true); }
  }
  document.querySelectorAll('[data-tab]').forEach(function(btn){ btn.addEventListener('click',function(){ showTab(btn.getAttribute('data-tab')); }); });
  window.LeadRadarWorkerPanel={refresh:refresh,showTab:showTab};
  refresh();
  setInterval(refresh,5000);
})();
</script>
</body>
</html>`;
}


// Start Express Server
function startExpressServer() {
  const server = express();
  server.use(cors({ origin: "*" }));
  server.use(express.json());

  server.get("/", (req, res) => {
    res.type("html").send(renderWorkerPanelV2());
  });

  server.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
  });

  server.get("/v1/local-ai/status", async (req, res) => {
    const [status, diagnostics] = await Promise.all([localAi.status(), localAi.diagnostics()]);
    res.json({ ...status, config: localAi.getConfig(), status, diagnostics });
  });

  server.post("/v1/local-ai/start", async (req, res) => {
    const status = await localAi.startRuntime();
    const diagnostics = await localAi.diagnostics();
    res.json({ ...status, config: localAi.getConfig(), status, diagnostics });
  });

  server.post("/v1/local-ai/stop", async (req, res) => {
    const status = await localAi.stopRuntime();
    const diagnostics = await localAi.diagnostics();
    res.json({ ...status, config: localAi.getConfig(), status, diagnostics });
  });

  server.post("/v1/local-ai/setup", async (req, res) => {
    const result = await localAi.setupRuntime();
    res.json(result);
  });

  server.get("/v1/local-ai/setup", (req, res) => {
    res.json(localAi.getSetupState());
  });

  server.post("/v1/local-ai/test", async (req, res) => {
    const result = await localAi.testRuntime();
    res.status(result.ok ? 200 : 503).json(result);
  });

  server.get("/v1/local-ai/telemetry", async (req, res) => {
    res.json(await localAi.telemetry());
  });

  server.post("/v1/local-ai/config", async (req, res) => {
    const config = localAi.setConfig(req.body || {});
    const [status, diagnostics] = await Promise.all([localAi.status(), localAi.diagnostics()]);
    res.json({ ...status, config, status, diagnostics });
  });

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
      loginRequested: hasPendingManualLogin(),
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
      loginRequested: hasPendingManualLogin(),
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
        logout();
        throw new Error(`Nenhuma API do Lead Radar respondeu para o worker: ${describeAxiosError(lastError)}`);
      }

      config.workerToken = workerToken;
      config.refreshToken = refreshToken;
      config.expiresAt = expiresAt;
      config.loginRequestedAt = undefined;
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

  server.post("/v1/login-request", (req, res) => {
    beginManualLogin();
    res.json({ success: true, loginRequested: true });
  });

  server.post("/v1/logout", (req, res) => {
    logout();
    res.json({ success: true, isLogged: false, loginRequested: false });
  });

  server.post("/v1/runs", async (req, res) => {
    try {
      const { runId, commandToken, level, apiBaseUrl, options } = req.body;

      const sessionReady = await refreshSessionIfNeeded(false);
      if (!sessionReady || !config.workerToken) {
        return res.status(401).json({ error: "Worker não autenticado. Faça login no worker antes de iniciar a campanha." });
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
  stopLlamaCppServer();
});
