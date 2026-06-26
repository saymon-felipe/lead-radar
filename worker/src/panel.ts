export function renderWorkerPanelV2() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lead Radar Worker</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0d10;
      --surface: #15191f;
      --surface-2: #1d232b;
      --line: #2d3642;
      --text: #eef2f6;
      --muted: #9eaab8;
      --soft: #c7d0da;
      --blue: #4f8cff;
      --green: #32b67a;
      --yellow: #d7a83d;
      --red: #e15c64;
      --focus: rgba(79,140,255,.34);
      font-family: Inter, "Segoe UI", Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, rgba(79,140,255,.08), transparent 240px),
        var(--bg);
      color: var(--text);
    }
    button, input, select { font: inherit; }
    button {
      border: 1px solid transparent;
      border-radius: 8px;
      min-height: 38px;
      padding: 0 13px;
      background: var(--surface-2);
      color: var(--text);
      font-weight: 650;
      cursor: pointer;
      transition: transform .15s ease, border-color .15s ease, background .15s ease, opacity .15s ease;
    }
    button:hover { transform: translateY(-1px); border-color: #435265; }
    button:active { transform: translateY(0); }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
    button[disabled] { opacity: .55; cursor: wait; transform: none; }
    .btn-primary { background: var(--blue); color: #06101f; }
    .btn-danger { background: rgba(225,92,100,.16); border-color: rgba(225,92,100,.35); color: #ffc9cd; }
    .btn-ghost { background: transparent; border-color: var(--line); color: var(--soft); }
    .app {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 22px 0 32px;
    }
    .shell {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr);
      gap: 18px;
      align-items: start;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 18px;
      padding: 4px 0 18px;
    }
    h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
    h2 { margin: 0 0 14px; font-size: 15px; letter-spacing: 0; }
    h3 { margin: 0; font-size: 13px; color: var(--muted); font-weight: 650; }
    .subtitle { margin: 5px 0 0; color: var(--muted); font-size: 13px; }
    .side {
      position: sticky;
      top: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(21,25,31,.86);
      padding: 10px;
    }
    .nav-btn {
      width: 100%;
      justify-content: flex-start;
      display: flex;
      align-items: center;
      gap: 9px;
      margin: 3px 0;
      color: var(--soft);
      background: transparent;
      border-color: transparent;
    }
    .nav-btn.active {
      background: rgba(79,140,255,.13);
      border-color: rgba(79,140,255,.38);
      color: #dce8ff;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--muted);
      flex: 0 0 auto;
    }
    .dot.ok { background: var(--green); box-shadow: 0 0 0 4px rgba(50,182,122,.12); }
    .dot.bad { background: var(--red); box-shadow: 0 0 0 4px rgba(225,92,100,.12); }
    .dot.warn { background: var(--yellow); box-shadow: 0 0 0 4px rgba(215,168,61,.12); }
    .notice {
      min-height: 42px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--soft);
      padding: 11px 12px;
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity .18s ease, transform .18s ease;
    }
    .notice.show { opacity: 1; transform: translateY(0); }
    .notice.error { border-color: rgba(225,92,100,.45); background: rgba(225,92,100,.12); color: #ffd6d9; }
    .notice.success { border-color: rgba(50,182,122,.45); background: rgba(50,182,122,.11); color: #d6ffee; }
    .panel { display: none; animation: panelIn .18s ease both; }
    .panel.active { display: block; }
    @keyframes panelIn { from { opacity: .2; transform: translateY(5px); } to { opacity: 1; transform: none; } }
    .section {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(21,25,31,.92);
      margin-bottom: 14px;
      overflow: hidden;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      background: rgba(255,255,255,.018);
    }
    .section-body { padding: 16px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: var(--surface);
      min-height: 76px;
    }
    .metric strong {
      display: block;
      margin-top: 7px;
      font-size: 18px;
      overflow-wrap: anywhere;
    }
    .grid-2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .field { margin-bottom: 12px; }
    .field label, .check label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
      font-weight: 650;
    }
    input, select {
      width: 100%;
      min-height: 38px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #101419;
      color: var(--text);
      padding: 8px 10px;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 38px;
      padding: 8px 0;
      color: var(--soft);
    }
    .check input { width: 16px; min-height: 16px; accent-color: var(--blue); }
    .check label { margin: 0; color: var(--soft); font-size: 13px; font-weight: 520; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .status-list { display: grid; gap: 8px; }
    .status-row {
      display: grid;
      grid-template-columns: 190px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      padding: 9px 0;
      border-bottom: 1px solid rgba(45,54,66,.58);
    }
    .status-row:last-child { border-bottom: 0; }
    .label { color: var(--muted); font-size: 13px; }
    .value { color: var(--text); font-weight: 620; overflow-wrap: anywhere; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 24px;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--surface-2);
      color: var(--soft);
      font-size: 12px;
      font-weight: 720;
      width: fit-content;
    }
    .badge.ok { border-color: rgba(50,182,122,.45); background: rgba(50,182,122,.13); color: #cffff0; }
    .badge.bad { border-color: rgba(225,92,100,.45); background: rgba(225,92,100,.13); color: #ffd1d5; }
    .badge.warn { border-color: rgba(215,168,61,.48); background: rgba(215,168,61,.13); color: #ffe9b0; }
    .hint { color: var(--muted); font-size: 12px; line-height: 1.45; margin: 8px 0 0; }
    .logs {
      white-space: pre-wrap;
      overflow: auto;
      max-height: 300px;
      margin: 0;
      padding: 12px;
      border-radius: 8px;
      background: #080a0d;
      border: 1px solid var(--line);
      color: #cbd5df;
      font-size: 12px;
    }
    .skeleton {
      position: relative;
      overflow: hidden;
      color: transparent;
    }
    .skeleton::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent);
      animation: shimmer 1.15s infinite;
    }
    @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
    @media (max-width: 860px) {
      .app { width: min(100vw - 20px, 1180px); padding-top: 14px; }
      .shell { grid-template-columns: 1fr; }
      .side { position: static; display: flex; gap: 6px; overflow-x: auto; }
      .nav-btn { width: auto; white-space: nowrap; }
      header { flex-direction: column; }
      .summary, .grid-2, .grid-3 { grid-template-columns: 1fr; }
      .status-row { grid-template-columns: 1fr; gap: 4px; }
      .actions button { flex: 1 1 180px; }
    }
  </style>
</head>
<body>
  <main class="app">
    <header>
      <div>
        <h1>Lead Radar Worker</h1>
        <p class="subtitle">Sessao, execucao e IA local em um painel unico.</p>
      </div>
      <div id="notice" class="notice" role="status"></div>
    </header>
    <div class="shell">
      <nav class="side" aria-label="Navegacao do worker">
        <button class="nav-btn active" type="button" data-panel="overview"><span id="navOverviewDot" class="dot warn"></span>Visao geral</button>
        <button class="nav-btn" type="button" data-panel="ai"><span id="navAiDot" class="dot warn"></span>IA local</button>
        <button class="nav-btn" type="button" data-panel="telemetry"><span class="dot"></span>Telemetria</button>
        <button class="nav-btn" type="button" data-panel="logs"><span class="dot"></span>Logs</button>
      </nav>
      <div>
        <section id="overview" class="panel active"></section>
        <section id="ai" class="panel"></section>
        <section id="telemetry" class="panel"></section>
        <section id="logs" class="panel"></section>
      </div>
    </div>
  </main>
<script>
(function(){
  var state = { panel: 'overview', health: null, ai: null, telemetry: null, setup: null, busy: null, dirty: false, message: null };
  function byId(id){ return document.getElementById(id); }
  function esc(value){ return String(value == null ? '' : value).replace(/[&<>"']/g,function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]; }); }
  function valueText(value){ return value == null || value === '' ? '-' : esc(value); }
  function badge(text, kind){ return '<span class="badge '+(kind||'')+'"><span class="dot '+(kind||'')+'"></span>'+esc(text)+'</span>'; }
  function yesNo(value){ return value ? badge('sim','ok') : badge('nao','bad'); }
  function maybe(value){ return value ? badge('sim','ok') : badge('nao','warn'); }
  function row(label, value){ return '<div class="status-row"><div class="label">'+esc(label)+'</div><div class="value">'+value+'</div></div>'; }
  function metric(label, value, kind){ return '<div class="metric"><h3>'+esc(label)+'</h3><strong>'+(kind ? badge(value, kind) : valueText(value))+'</strong></div>'; }
  function section(title, actionHtml, bodyHtml){ return '<div class="section"><div class="section-head"><h2>'+esc(title)+'</h2><div class="actions">'+(actionHtml||'')+'</div></div><div class="section-body">'+bodyHtml+'</div></div>'; }
  function setNotice(message, kind){
    var el = byId('notice');
    el.textContent = message || '';
    el.className = 'notice' + (message ? ' show' : '') + (kind ? ' '+kind : '');
  }
  function setBusy(name, isBusy){
    state.busy = isBusy ? name : null;
    render();
  }
  async function api(path, opts){
    var res = await fetch(path, Object.assign({headers:{'content-type':'application/json'}}, opts || {}));
    var text = await res.text();
    var data = text ? JSON.parse(text) : {};
    if(!res.ok){
      var err = new Error(data.error || data.message || ('HTTP '+res.status));
      err.data = data;
      throw err;
    }
    return data;
  }
  async function action(name, message, fn){
    setBusy(name, true);
    setNotice(message, '');
    try {
      var result = await fn();
      await refresh(false);
      return result;
    } catch (error) {
      setNotice(error.message || String(error), 'error');
      await refresh(false);
      return error.data || null;
    } finally {
      setBusy(name, false);
    }
  }
  function button(id, label, cls){
    var busy = state.busy === id;
    return '<button id="'+id+'" type="button" class="'+(cls||'')+'" '+(state.busy && !busy ? 'disabled' : '')+'>'+esc(busy ? 'Aguarde...' : label)+'</button>';
  }
  function switchPanel(id){
    state.panel = id;
    document.querySelectorAll('.nav-btn').forEach(function(btn){ btn.classList.toggle('active', btn.getAttribute('data-panel') === id); });
    document.querySelectorAll('.panel').forEach(function(panel){ panel.classList.toggle('active', panel.id === id); });
  }
  function isEditingAiForm(){
    var el = document.activeElement;
    return Boolean(el && el.closest && el.closest('#ai') && el.matches && el.matches('input, select'));
  }
  function configPayload(){
    return {
      enabled: byId('aiEnabled').checked,
      provider: 'llama.cpp',
      endpoint: byId('endpoint').value.trim(),
      serverPath: byId('serverPath').value.trim(),
      modelPath: byId('modelPath').value.trim(),
      device: byId('device').value,
      strictCuda: byId('strictCuda').checked,
      autoStartServer: byId('autoStart').checked,
      tasks: {
        personName: byId('taskPerson').checked,
        serpClassification: byId('taskSerp').checked,
        queryRewrite: byId('taskQuery').checked,
        htmlCleaning: byId('taskHtml').checked
      }
    };
  }
  async function saveAi(){
    var payload = configPayload();
    state.busy = 'saveAiBtn';
    render();
    setNotice('Salvando configuracao da IA local...', '');
    try {
      await api('/v1/local-ai/config', { method:'POST', body: JSON.stringify(payload) });
      state.dirty = false;
      await refresh(false);
      setNotice('Configuracao salva.', 'success');
    } catch (error) {
      setNotice(error.message || String(error), 'error');
    } finally {
      state.busy = null;
      render();
    }
  }
  async function setupRuntime(){
    try {
      setBusy('setupRuntimeBtn', true);
      setNotice('Iniciando preparacao da IA local...', '');
      var result = await api('/v1/local-ai/setup', { method:'POST' });
      state.setup = result;
      render();
      await refresh(false);
    } catch (error) {
      setBusy('setupRuntimeBtn', false);
      setNotice(error.message || String(error), 'error');
    }
  }
  async function startRuntime(){
    var result = await action('startRuntimeBtn','Iniciando runtime local...', function(){
      return api('/v1/local-ai/start', { method:'POST' });
    });
    if(result) setNotice(result.status && result.status.available ? 'Runtime local disponivel.' : 'Runtime local ainda indisponivel.', result.status && result.status.available ? 'success' : 'error');
  }
  async function stopRuntime(){
    await action('stopRuntimeBtn','Parando runtime local...', function(){ return api('/v1/local-ai/stop', { method:'POST' }); });
    setNotice('Runtime local parado.', 'success');
  }
  async function testRuntime(){
    var result = await action('testRuntimeBtn','Testando chamada curta no modelo local...', function(){ return api('/v1/local-ai/test', { method:'POST' }); });
    if(result) setNotice(result.ok ? ('Teste OK em '+result.latencyMs+' ms.') : ('Teste falhou: '+(result.error || 'sem resposta')), result.ok ? 'success' : 'error');
  }
  async function login(){ await action('loginBtn','Abrindo login no navegador...', function(){ return api('/v1/login-request', { method:'POST' }); }); }
  async function logout(){ await action('logoutBtn','Encerrando sessao local...', function(){ return api('/v1/logout', { method:'POST' }); }); }
  function renderOverview(){
    var h = state.health || {};
    var a = (state.ai && state.ai.status) || {};
    byId('overview').innerHTML =
      section('Resumo', '',
        '<div class="summary">'+
          metric('Sessao', h.isLogged ? 'logado' : 'desconectado', h.isLogged ? 'ok' : 'bad')+
          metric('Worker', h.runStatus || 'idle', h.runStatus === 'running' ? 'warn' : 'ok')+
          metric('IA local', a.available ? 'disponivel' : 'indisponivel', a.available ? 'ok' : 'warn')+
          metric('Runtime', a.selectedRuntime || 'nenhum', a.selectedRuntime ? 'ok' : 'warn')+
        '</div>'
      )+
      section('Sessao do worker',
        button('loginBtn','Login','btn-primary')+button('logoutBtn','Logout','btn-danger'),
        '<div class="status-list">'+
          row('API', valueText(h.apiBaseUrl))+
          row('Usuario', valueText(h.userName))+
          row('Organizacao', valueText(h.orgName))+
          row('Login solicitado', maybe(Boolean(h.loginRequested)))+
          row('Token saudavel', maybe(Boolean(h.authHealthy)))+
        '</div>'
      );
  }
  function renderAi(){
    var ai = state.ai || {};
    var c = ai.config || {};
    var s = ai.status || {};
    var d = ai.diagnostics || {};
    var tasks = c.tasks || {};
    var setupLogs = state.setup && state.setup.logs ? state.setup.logs.map(function(item){ return '['+item.level+'] '+item.message; }).join('\\n') : 'Nenhum setup executado nesta sessao.';
    byId('ai').innerHTML =
      section('Saude da IA local',
        button('setupRuntimeBtn','Preparar arquivos','btn-primary')+button('startRuntimeBtn','Iniciar runtime','')+button('testRuntimeBtn','Testar modelo','')+button('stopRuntimeBtn','Parar','btn-danger'),
        '<div class="summary">'+
          metric('CPU runtime', s.cpuRuntimeFound ? 'encontrado' : 'ausente', s.cpuRuntimeFound ? 'ok' : 'bad')+
          metric('CUDA runtime', s.cudaRuntimeFound ? 'encontrado' : 'ausente', s.cudaRuntimeFound ? 'ok' : 'warn')+
          metric('Modelo GGUF', s.modelFileExists ? 'encontrado' : 'ausente', s.modelFileExists ? 'ok' : 'bad')+
          metric('NVIDIA', s.nvidiaDetected ? 'detectada' : 'nao detectada', s.nvidiaDetected ? 'ok' : 'warn')+
        '</div>'+
        '<div class="status-list" style="margin-top:14px">'+
          row('Runtime selecionado', valueText(s.selectedRuntime || 'nenhum'))+
          row('Disponivel', yesNo(Boolean(s.available)))+
          row('Fallback', valueText(s.lastFallbackReason))+
          row('Ultimo erro', valueText(s.lastError))+
          row('Endpoint', valueText(s.endpoint))+
          row('Servidor usado', valueText(s.serverPath))+
          row('Modelo usado', valueText(s.modelPath))+
        '</div>'
      )+
      section('Configuracao',
        button('saveAiBtn','Salvar configuracao','btn-primary'),
        '<div class="grid-2">'+
          '<div>'+
            '<div class="check"><input id="aiEnabled" type="checkbox" '+(c.enabled?'checked':'')+'><label for="aiEnabled">Ativar IA local no pipeline</label></div>'+
            '<div class="check"><input id="autoStart" type="checkbox" '+(c.autoStartServer?'checked':'')+'><label for="autoStart">Iniciar llama-server automaticamente</label></div>'+
            '<div class="check"><input id="strictCuda" type="checkbox" '+(c.strictCuda?'checked':'')+'><label for="strictCuda">Exigir CUDA sem fallback</label></div>'+
            '<div class="field"><label for="device">Dispositivo preferido</label><select id="device"><option value="auto">auto</option><option value="cpu">cpu</option><option value="cuda">cuda</option><option value="vulkan">vulkan</option></select></div>'+
          '</div>'+
          '<div>'+
            '<div class="field"><label for="endpoint">Endpoint local</label><input id="endpoint" value="'+esc(c.endpoint || '')+'"></div>'+
            '<div class="field"><label for="serverPath">Caminho manual do llama-server</label><input id="serverPath" value="'+esc(c.serverPath || '')+'" placeholder="Vazio usa CPU/CUDA automatico"></div>'+
            '<div class="field"><label for="modelPath">Caminho do modelo GGUF</label><input id="modelPath" value="'+esc(c.modelPath || '')+'"></div>'+
          '</div>'+
        '</div>'+
        '<p class="hint">Padroes: CPU em '+valueText(s.cpuServerPath)+'. CUDA em '+valueText(s.cudaServerPath)+'. O campo manual so e usado quando aponta para um arquivo valido.</p>'
      )+
      section('Tarefas auxiliares', '',
        '<div class="grid-2">'+
          '<div class="check"><input id="taskPerson" type="checkbox" '+(tasks.personName?'checked':'')+'><label for="taskPerson">Validar nome de pessoa</label></div>'+
          '<div class="check"><input id="taskSerp" type="checkbox" '+(tasks.serpClassification?'checked':'')+'><label for="taskSerp">Classificar resultado de busca</label></div>'+
          '<div class="check"><input id="taskQuery" type="checkbox" '+(tasks.queryRewrite?'checked':'')+'><label for="taskQuery">Reescrever query sem resultado</label></div>'+
          '<div class="check"><input id="taskHtml" type="checkbox" '+(tasks.htmlCleaning?'checked':'')+'><label for="taskHtml">Limpar HTML com IA local</label></div>'+
        '</div>'
      )+
      section('Logs do ultimo setup', '', '<pre class="logs">'+esc(setupLogs)+'</pre>');
    byId('device').value = c.device || 'auto';
    (d.messages || []).forEach(function(){});
  }
  function renderTelemetry(){
    var t = state.telemetry || {};
    var sys = t.system || {};
    var gpu = sys.gpu;
    byId('telemetry').innerHTML =
      section('Uso da IA local', '',
        '<div class="summary">'+
          metric('Chamadas', t.totalCalls || t.calls || 0)+
          metric('Sucesso', t.successfulCalls || t.ok || 0)+
          metric('Falhas', t.failedCalls || t.errors || 0)+
          metric('Latencia media', (t.averageLatencyMs || 0)+' ms')+
        '</div>'+
        '<div class="status-list" style="margin-top:14px">'+
          row('Ultima latencia', valueText((t.lastLatencyMs || 0)+' ms'))+
          row('Tokens entrada estim.', valueText(t.estimatedInputTokens || 0))+
          row('Tokens saida estim.', valueText(t.estimatedOutputTokens || 0))+
          row('PID servidor', valueText(t.serverPid))+
        '</div>'
      )+
      section('Sistema', '',
        '<div class="status-list">'+
          row('CPU cores', valueText(sys.cpuCount))+
          row('RAM', valueText((sys.memoryUsedMb || 0)+' / '+(sys.memoryTotalMb || 0)+' MB'))+
          row('Processo', valueText((sys.processMemoryMb || 0)+' MB'))+
          row('GPU', valueText(gpu && gpu.name ? gpu.name : 'nao detectada'))+
          row('VRAM', valueText(gpu ? ((gpu.memoryUsedMb || 0)+' / '+(gpu.memoryTotalMb || 0)+' MB') : '-'))+
        '</div>'
      );
  }
  function renderLogs(){
    var t = state.telemetry || {};
    byId('logs').innerHTML = section('Eventos recentes da IA local','<button id="refreshLogsBtn" type="button" class="btn-ghost">Atualizar</button>','<pre class="logs">'+esc(JSON.stringify(t.lastMetrics || [], null, 2))+'</pre>');
  }
  function bind(){
    var map = {
      saveAiBtn: saveAi,
      setupRuntimeBtn: setupRuntime,
      startRuntimeBtn: startRuntime,
      stopRuntimeBtn: stopRuntime,
      testRuntimeBtn: testRuntime,
      loginBtn: login,
      logoutBtn: logout,
      refreshLogsBtn: function(){ refresh(true); }
    };
    Object.keys(map).forEach(function(id){
      var el = byId(id);
      if(el) el.addEventListener('click', function(){ map[id](); });
    });
    document.querySelectorAll('#ai input, #ai select').forEach(function(el){
      el.addEventListener('input', function(){ state.dirty = true; });
      el.addEventListener('change', function(){ state.dirty = true; });
    });
  }
  function render(){
    renderOverview();
    renderAi();
    renderTelemetry();
    renderLogs();
    byId('navOverviewDot').className = 'dot ' + (state.health && state.health.isLogged ? 'ok' : 'bad');
    var s = state.ai && state.ai.status;
    byId('navAiDot').className = 'dot ' + (s && s.available ? 'ok' : s && (s.cpuRuntimeFound || s.modelFileExists) ? 'warn' : 'bad');
    bind();
    switchPanel(state.panel);
  }
  async function refresh(announce){
    try {
      var data = await Promise.all([
        api('/v1/health'),
        api('/v1/local-ai/status'),
        api('/v1/local-ai/telemetry'),
        api('/v1/local-ai/setup')
      ]);
      state.health = data[0];
      state.ai = data[1];
      state.telemetry = data[2];
      state.setup = data[3];

      if (state.setup.running && !state.pollingSetup) {
        state.pollingSetup = true;
        setBusy('setupRuntimeBtn', true);
        var pollTimer = setInterval(async function() {
          try {
            var current = await api('/v1/local-ai/setup', { method:'GET' });
            state.setup = current;
            render();

            if (!current.running) {
              clearInterval(pollTimer);
              state.pollingSetup = false;
              setBusy('setupRuntimeBtn', false);
              setNotice(current.completed ? 'IA local preparada.' : 'Setup terminou com pendencias. Veja os logs abaixo.', current.completed ? 'success' : 'error');
              await refresh(false);
            }
          } catch (pollErr) {
            clearInterval(pollTimer);
            state.pollingSetup = false;
            setBusy('setupRuntimeBtn', false);
            setNotice('Erro ao obter progresso: ' + pollErr.message, 'error');
            render();
          }
        }, 1000);
      }

      if (state.dirty || isEditingAiForm()) {
        if(announce) setNotice('Dados recebidos. Termine de salvar suas alteracoes para atualizar a tela.', '');
        return;
      }
      render();
      if(announce) setNotice('Dados atualizados.', 'success');
    } catch (error) {
      setNotice('Falha ao atualizar painel: '+(error.message || error), 'error');
    }
  }
  document.querySelectorAll('.nav-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ switchPanel(btn.getAttribute('data-panel')); });
  });
  render();
  refresh(false);
  setInterval(function(){ if(!state.busy && !state.dirty) refresh(false); }, 7000);
})();
</script>
</body>
</html>`;
}
