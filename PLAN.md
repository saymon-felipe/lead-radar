# Lead Radar - Plano de Migracao do Scraper para Worker Local

## Objetivo

Mover toda a execucao pesada de scraping, navegacao com browser e coleta semi-automatica para um worker Windows instalado localmente como `.exe`, acessivel pelo tray. A API continua sendo a fonte de verdade do sistema, dona da autenticacao, organizacao, campanhas, persistencia, IA, cache de IA, logs e regras comerciais.

O usuario deve continuar clicando em uma campanha e rodando a descoberta do mesmo jeito no frontend. A diferenca interna e que o frontend/API passam a acionar o worker local, o worker abre o navegador de scraping na maquina do usuario e envia resultados estruturados para a API. Nenhuma chave da OpenAI ou segredo sensivel deve ficar no worker.

## Principios nao negociaveis

- O fluxo existente deve continuar funcionando 100%.
- Nenhuma funcionalidade atual pode ser perdida: descoberta, parada, status ao vivo, logs, revisao IA, criacao de leads, score, snapshots, analise de site/social, embeddings, relatorios e exportacao.
- A API continua aplicando multiempresa/RBAC. Todo trabalho do worker fica vinculado ao usuario autenticado e a empresa proprietaria da campanha.
- O worker nunca chama OpenAI diretamente e nunca recebe `OPENAI_API_KEY`.
- O worker pode executar validacoes locais que nao dependem de IA nem de banco, mas a decisao final, persistencia e tratativas existentes continuam na API.
- Deve funcionar em desenvolvimento local e em producao na Heroku.

## Estado atual relevante

- O frontend chama `POST /api/campaigns/:id/discover?level=...` a partir da tela de campanhas.
- A API autentica rotas `/api/*` com Bearer JWT e resolve `organizationId` no contexto.
- A descoberta atual roda dentro do backend em `backend/src/modules/discovery/discovery.service.ts`.
- O backend hoje abre Playwright, consulta fontes, extrai candidatos, enriquece profissionais, chama IA, analisa site/social, salva candidatos/leads e atualiza status.
- O frontend consulta `GET /api/campaigns/:id/discovery-status` para acompanhar a execucao e chama `POST /api/campaigns/:id/discover/stop` para parar.

## Arquitetura alvo

### Componentes

1. Frontend web
   - Continua sendo a interface principal.
   - Detecta se o worker local esta instalado, logado e pronto.
   - Ao iniciar uma campanha, solicita a API um comando de execucao e entrega esse comando ao worker local.
   - Continua mostrando status, eventos e resultados pela API.

2. API backend
   - Continua autenticando usuario e organizacao.
   - Continua validando campanha, permissoes, limites, deduplicacao, score e persistencia.
   - Continua chamando IA e mantendo cache, prompt versionado, hash de input, custo e logs.
   - Recebe eventos, candidatos, snapshots compactos e resultados do worker.
   - Orquestra runs e conserva os endpoints atuais.

3. Worker local Windows
   - Instalavel `.exe` com tray.
   - Abre no tray com estados: desconectado, logado, pronto, rodando, erro.
   - Tem botao "Fazer login".
   - No login abre uma aba do navegador apontando para localhost/desenvolvimento ou Heroku/producao.
   - Depois do login, recebe callback de volta no desktop por deep link `leadradar://auth/callback` ou por loopback `http://127.0.0.1:<porta>/auth/callback`.
   - Mantem token do worker guardado via Windows Credential Manager/DPAPI.
   - Sobe um servidor local apenas em `127.0.0.1` para receber comandos do frontend.
   - Executa Playwright/browser, coleta HTML publico, screenshots locais, metadados, contatos e evidencias.
   - Faz filtros locais deterministicos e envia pacotes compactos para a API.

## Fronteira de responsabilidades

### Worker local pode fazer

- Abrir e controlar navegador de scraping.
- Buscar paginas publicas, respeitando timeouts, limites e parada.
- Extrair HTML, texto compacto, links, contatos, imagens/screenshot local e metricas visuais.
- Classificar regras deterministicas simples: dominio bloqueado, duplicata local no lote, URL invalida, marketplace, diretorio, artigo, vaga, login/captcha/bloqueio.
- Normalizar telefones, e-mails, URLs e sinais de contato.
- Enviar eventos incrementais para a API.
- Receber comando de parada e encerrar browser/processos filhos.
- Manter logs locais tecnicos para suporte.

### Worker local nao pode fazer

- Guardar ou usar chave OpenAI.
- Decidir sozinho criar leads definitivos sem API.
- Ignorar permissoes, organizacao ou estado da campanha.
- Persistir dados finais fora da API.
- Contornar login, captcha, bloqueios ou coletar dados privados.
- Rodar campanha de outra empresa/usuario sem comando assinado pela API.

### API deve fazer

- Autenticar usuario e worker.
- Vincular worker a usuario, organizacao e ambiente.
- Validar acesso a campanha antes de gerar qualquer comando.
- Criar e controlar `discoveryRun`.
- Receber eventos e payloads compactos do worker.
- Fazer todas as chamadas de IA.
- Aplicar tratativas existentes: cache de IA, dedupe global, lead final, score, snapshots, logs, relatorios.
- Expor status atual para o frontend com o mesmo formato ou um formato retrocompativel.
- Encaminhar parada/cancelamento para o worker e marcar run como cancelado se o worker sumir.

## Ambientes

O worker deve ter um seletor de ambiente:

- Desenvolvimento: API `http://localhost:3333`, frontend `http://localhost:5173`.
- Producao: API Heroku `https://<app>.herokuapp.com`, frontend de producao configurado por env.

Regras:

- O ambiente ativo fica visivel no tray.
- Tokens de dev e prod devem ser separados.
- O login sempre abre a URL do ambiente selecionado.
- O frontend deve descobrir o worker local em `http://127.0.0.1:<porta>` e confirmar se ele esta pareado com o mesmo `apiBaseUrl`.

## Fluxo de autenticacao do worker

1. Usuario abre o tray e clica em "Fazer login".
2. Worker gera `deviceId`, `state`, `codeVerifier` e abre:
   - dev: `http://localhost:5173/worker/login?...`
   - prod: URL publica do frontend/API.
3. Usuario faz login normalmente na web.
4. API valida usuario, organizacao e permissao minima.
5. API cria uma autorizacao curta para o worker, vinculada a:
   - `userId`
   - `organizationId`
   - `role`
   - `deviceId`
   - `environment`
6. Navegador redireciona para:
   - preferencial: `leadradar://auth/callback?code=...&state=...`
   - fallback: `http://127.0.0.1:<porta>/auth/callback?code=...&state=...`
7. Worker troca `code + codeVerifier` por uma sessao de worker na API.
8. Worker guarda refresh token com DPAPI/Credential Manager.
9. Worker chama heartbeat periodico e aparece como pronto.

Token recomendado:

- Access token curto: 15 minutos.
- Refresh token rotacionavel: 30 dias.
- Revogacao por usuario/empresa/dispositivo.
- Escopos: `worker:heartbeat`, `worker:run`, `worker:events`, `worker:results`.

## Comunicacao local frontend -> worker

O worker deve expor HTTP local apenas em loopback:

- `GET /v1/health`
- `GET /v1/session`
- `POST /v1/login`
- `POST /v1/runs`
- `POST /v1/runs/:runId/stop`

CORS permitido apenas para:

- `http://localhost:5173`
- origem de producao configurada
- outras origens explicitamente configuradas no worker

Seguranca local:

- Rejeitar qualquer Host que nao seja `127.0.0.1`, `localhost` ou `[::1]`.
- Exigir `commandToken` curto assinado pela API para iniciar run.
- O frontend nunca envia credenciais do usuario diretamente ao worker.
- O worker valida o comando na API antes de executar.

Fallback se o navegador bloquear chamada para localhost:

- Usar deep link `leadradar://run?commandToken=...`.
- O worker abre/recebe o comando e valida na API do mesmo jeito.

## Fluxo para iniciar descoberta

Fluxo externo para o usuario continua igual:

1. Usuario escolhe nivel da busca na campanha.
2. Usuario clica em "Buscar".
3. Frontend verifica worker local:
   - se nao instalado: mostra acao para instalar/abrir worker.
   - se instalado mas sem login: pede login pelo tray ou aciona `/v1/login`.
   - se logado em outro ambiente/empresa: mostra erro claro.
4. Frontend chama API para preparar a run:
   - `POST /api/campaigns/:id/discover`
   - ou rota nova interna `POST /api/campaigns/:id/discovery-runs`
5. API valida campanha, usuario, empresa, role e cria `discoveryRun`.
6. API retorna `runId`, `commandToken`, `apiBaseUrl`, `campaignId`, `level`, limites e configuracoes.
7. Frontend chama `POST http://127.0.0.1:<porta>/v1/runs` com o comando.
8. Worker valida `commandToken` na API.
9. Worker inicia browser local e streama eventos/resultados para a API.
10. Frontend continua lendo `GET /api/campaigns/:id/discovery-status`.

O endpoint atual `POST /api/campaigns/:id/discover` deve continuar existindo. Durante a migracao ele pode:

- Em modo novo: criar run e devolver comando para worker.
- Em modo legado: rodar `discoverCampaign` no backend atras de feature flag.
- Em modo hibrido: tentar worker e permitir fallback controlado para backend apenas em dev/admin.

## Fluxo de dados worker -> API

Endpoints novos sugeridos:

- `POST /api/workers/register`
- `POST /api/workers/heartbeat`
- `GET /api/workers/me`
- `POST /api/workers/runs/:runId/claim`
- `POST /api/workers/runs/:runId/events`
- `POST /api/workers/runs/:runId/candidates`
- `POST /api/workers/runs/:runId/snapshots/website`
- `POST /api/workers/runs/:runId/snapshots/social`
- `POST /api/workers/runs/:runId/complete`
- `POST /api/workers/runs/:runId/fail`

Eventos devem ser append-only:

```json
{
  "eventId": "uuid",
  "sequence": 12,
  "kind": "search_results",
  "title": "Resultados iniciais",
  "leadName": "Nome do profissional",
  "url": "https://exemplo.com",
  "payload": {},
  "createdAt": "2026-06-23T12:00:00.000Z"
}
```

Payload de candidato compacto:

```json
{
  "externalId": "uuid-local-do-worker",
  "title": "Nome do profissional",
  "url": "https://exemplo.com",
  "snippet": "Resumo curto",
  "source": "duckduckgo|site|instagram|directory",
  "evidence": {},
  "localSignals": {
    "hasPhone": true,
    "hasWhatsapp": true,
    "hasEmail": false,
    "looksLikeDirectory": false,
    "looksLikeMarketplace": false,
    "looksLikeJobPost": false
  }
}
```

Snapshot de site compacto:

```json
{
  "leadExternalId": "uuid-local-do-worker",
  "url": "https://exemplo.com",
  "httpStatus": 200,
  "title": "Titulo",
  "metaDescription": "Descricao",
  "h1": "H1",
  "headings": [],
  "textSample": "Texto compacto",
  "contacts": {},
  "visualMetrics": {},
  "screenshot": {
    "storedLocally": true,
    "uploadId": "opcional"
  }
}
```

O worker nao deve enviar HTML bruto para IA. A API pode guardar artefatos tecnicos se necessario, mas a regra padrao continua sendo snapshot compacto.

## Mudancas no backend

1. Criar modelo de worker/dispositivo.
   - `WorkerDevice`
   - `WorkerSession`
   - `WorkerHeartbeat`
   - campos: usuario, organizacao, ambiente, versao do app, hostname opcional, status, ultimo heartbeat.

2. Criar modelo de run duravel.
   - `DiscoveryRun`
   - `DiscoveryRunEvent`
   - `DiscoveryRunArtifact`
   - status: `queued`, `claimed`, `running`, `stopping`, `completed`, `cancelled`, `failed`, `expired`.

3. Separar discovery em camadas.
   - `discovery-orchestrator.service.ts`: cria run, valida campanha, status, stop.
   - `discovery-worker-ingest.service.ts`: recebe eventos/resultados do worker.
   - `discovery-ai.service.ts`: revisoes IA e gates finais.
   - `discovery-legacy.service.ts`: codigo atual enquanto existir fallback.

4. Extrair regras compartilhaveis.
   - Normalizacao de URL.
   - Classificacao deterministica.
   - Validacao de contatos.
   - Dedupe.
   - Schemas Zod de eventos, candidatos e snapshots.

5. Manter endpoints atuais.
   - `POST /api/campaigns/:id/discover`
   - `POST /api/campaigns/:id/discover/stop`
   - `GET /api/campaigns/:id/discovery-status`
   - `GET /api/campaigns/:id/discovery-candidates`

6. Adicionar endpoints de worker com auth propria.
   - Bearer do worker separado do Bearer web.
   - Escopos limitados.
   - Auditoria de usuario/organizacao/run em toda escrita.

7. Garantir que IA continua server-side.
   - Worker envia lote compacto.
   - API chama OpenAI/fallback local.
   - API grava cache, hash, prompt version e custo.

## Mudancas no frontend

1. Criar `workerClient`.
   - Detectar `http://127.0.0.1:<porta>/v1/health`.
   - Ler estado de sessao do worker.
   - Iniciar login local.
   - Enviar comando de run.
   - Enviar stop local quando aplicavel.

2. Ajustar tela de campanhas sem mudar o fluxo principal.
   - Botao "Buscar" continua no mesmo lugar.
   - Antes de buscar, validar worker instalado/logado.
   - Mostrar estados: worker nao encontrado, login necessario, ambiente divergente, versao antiga, pronto.

3. Preservar monitor atual.
   - `DiscoveryMonitor` continua lendo status da API.
   - Eventos vindos do worker devem aparecer no mesmo formato visual.

4. Fallback de UX.
   - Link para instalar/abrir worker.
   - Botao para login.
   - Mensagem objetiva quando o worker esta offline durante uma run.

## Worker instalavel

Stack sugerida:

- Node.js + TypeScript empacotado com Electron, Tauri ou Neutralino, ou .NET com Playwright.
- Tray nativo.
- Auto-update assinado quando possivel.
- Instalador Windows com registro de protocolo `leadradar://`.
- Playwright browser instalado junto ou baixado no primeiro uso controlado.

Requisitos do tray:

- Status atual.
- Ambiente ativo.
- Usuario/empresa logados.
- Botao "Fazer login".
- Botao "Abrir Lead Radar".
- Botao "Parar execucao atual".
- Botao "Sair".
- Link para logs locais.

Requisitos de execucao:

- Apenas uma run ativa por worker no MVP.
- Controle de concorrencia por perfil `nano`, `quick`, `medium`, `deep`.
- Timeouts e retry limitados.
- Abort controller para parar rapido.
- Heartbeat durante execucao.
- Logs locais rotativos.
- Sanitizacao antes de enviar dados para API.

## Compatibilidade com Heroku

- A API na Heroku deve aceitar eventos do worker por HTTPS.
- WebSocket nao e obrigatorio; preferir HTTP idempotente e polling para reduzir risco.
- Upload de screenshot, se necessario, deve usar storage externo no futuro. No MVP, preferir nao subir screenshot bruto; enviar metricas e texto compacto.
- Runs longas nao devem depender de request HTTP aberta no Heroku.
- O frontend acompanha status por polling da API.

## Plano de migracao por fases

### Fase 0 - Congelar comportamento atual

- Adicionar testes/fixtures para o contrato de discovery atual.
- Documentar payloads atuais de status, eventos, candidatos e leads.
- Criar feature flags:
  - `DISCOVERY_EXECUTION_MODE=legacy|worker|hybrid`
  - `WORKER_AUTH_ENABLED=true|false`
  - `WORKER_LOCAL_CONTROL_ENABLED=true|false`

Aceite:

- Fluxo atual continua rodando sem worker em modo `legacy`.
- Nenhum endpoint existente e removido.

### Fase 1 - Modelo de runs e status duravel

- Criar tabelas de `DiscoveryRun` e `DiscoveryRunEvent`.
- Fazer o discovery legado gravar eventos nesse modelo.
- Adaptar `GET /discovery-status` para ler do modelo novo mantendo resposta retrocompativel.

Aceite:

- Monitor atual continua funcionando.
- Status sobrevive a restart parcial do backend quando o banco esta persistente.

### Fase 2 - Autenticacao do worker

- Implementar fluxo de login por navegador com callback para desktop.
- Registrar worker/dispositivo.
- Implementar heartbeat e revogacao.
- Separar tokens web e tokens worker.

Aceite:

- Worker dev loga contra localhost.
- Worker prod loga contra Heroku.
- API sabe qual usuario/empresa esta vinculada ao worker.

### Fase 3 - Comando local e handshake frontend-worker

- Criar servidor local do worker em loopback.
- Criar `workerClient` no frontend.
- Criar comando assinado pela API para iniciar run.
- Implementar deteccao de worker e estados de erro.

Aceite:

- Clicar "Buscar" chama worker local quando ele esta pronto.
- Usuario recebe mensagem clara quando worker nao esta instalado/logado.
- Nenhum token web e enviado ao worker.

### Fase 4 - Ingestao de eventos e candidatos

- Worker executa uma versao minima da coleta.
- Worker envia eventos e candidatos compactos para API.
- API revisa candidatos com IA/fallback e salva `DiscoveryCandidate`.
- API mantem dedupe e organizacao.

Aceite:

- Uma campanha `nano` gera candidatos pelo worker.
- Eventos aparecem no monitor.
- IA continua chamada apenas pela API.

### Fase 5 - Paridade com discovery atual

- Migrar navegacao Playwright, enriquecimento, analise de site/social e screenshots para o worker.
- API recebe snapshots compactos e aplica as tratativas atuais.
- Comparar resultados worker vs legado em campanhas controladas.

Aceite:

- `quick`, `medium` e `deep` funcionam via worker.
- Stop funciona.
- Relatorios, leads, scores e exportacao continuam iguais.
- Nenhuma regressao funcional conhecida.

### Fase 6 - Hardening e instalador

- Criar instalador Windows.
- Registrar protocolo `leadradar://`.
- Guardar credenciais com DPAPI/Credential Manager.
- Assinar executavel quando possivel.
- Adicionar auto-update ou aviso de versao antiga.

Aceite:

- Usuario nao tecnico instala e faz login.
- Worker inicia no tray.
- Worker recupera sessao apos reiniciar Windows.

### Fase 7 - Remover peso do backend

- Desativar Playwright pesado no backend em producao.
- Manter fallback legado apenas para dev/admin por periodo curto.
- Remover dependencias de scraping pesado da API quando a paridade estiver comprovada.

Aceite:

- API Heroku nao executa browser de scraping.
- Worker local e o caminho padrao.
- Fluxo antigo so existe como fallback controlado ou e removido apos decisao.

## Criterios de aceite finais

- Usuario consegue instalar o worker, abrir pelo tray, fazer login e ver empresa vinculada.
- Login funciona em localhost e producao.
- Ao clicar em "Buscar" em uma campanha, o worker local inicia o navegador de scraping.
- API valida que a campanha pertence a empresa do usuario autenticado.
- Toda chamada de IA acontece na API.
- `OPENAI_API_KEY` nunca aparece no worker, instalador, logs locais ou trafego para o worker.
- Worker faz validacoes locais deterministicas e envia dados compactos para a API.
- API executa as tratativas ja existentes e salva leads/candidatos/scores/snapshots.
- Monitor, stop, relatorios, exportacao e detalhes do lead continuam funcionando.
- Falha do worker nao corrompe campanha nem cria lead parcial sem auditoria.
- Heroku nao precisa manter request longa nem browser aberto.

## Riscos e mitigacoes

- Browser web chamando localhost pode sofrer restricao de seguranca.
  - Mitigar com loopback marcado como origem confiavel, CORS restrito e fallback por `leadradar://run`.

- Worker offline durante run.
  - Mitigar com heartbeat, timeout de run, status `failed`/`expired` e retomada futura.

- Divergencia entre filtros locais e filtros da API.
  - Mitigar mantendo schemas compartilhados e a API como decisao final.

- Vazamento de dados sensiveis em logs locais.
  - Mitigar com redacao, logs rotativos e sem tokens em texto puro.

- Quebra de fluxo atual.
  - Mitigar com feature flags, modo legado e testes de contrato antes da troca.

- Heroku com limites de request.
  - Mitigar com runs duraveis, eventos curtos e polling.

## Perguntas em aberto

- Qual stack sera usada para o `.exe`: Electron, Tauri, Neutralino ou .NET?
- O worker deve suportar auto-update desde a primeira versao ou apenas aviso de atualizacao?
- Screenshots devem ficar apenas locais, ser enviados sob demanda, ou ir para storage externo?
- Quantos workers por usuario/empresa podem ficar ativos ao mesmo tempo?
- O usuario podera trocar de empresa no worker ou o worker sempre segue a empresa ativa do login web?
- O modo legado deve ficar disponivel em producao durante a migracao ou apenas em desenvolvimento?

