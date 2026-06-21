# Etapa 1 - MVP Operacional

## Objetivo

Validar o fluxo comercial antes de automatizar descoberta e scraping completo. Esta etapa deve permitir cadastrar ou importar leads, priorizar com score objetivo, usar IA apenas na revisao final e gerar mensagens para contato humano.

## Entregaveis

- Estrutura inicial do monorepo `lead-radar/`.
- Backend Node.js + TypeScript + Fastify.
- Prisma configurado com MySQL/MariaDB.
- Schema inicial e migrations.
- CRUD de campanhas.
- CRUD de leads.
- Importacao CSV.
- Score objetivo.
- Modulo de cache de IA.
- Cliente OpenAI.
- Validacao de resposta IA por JSON schema.
- Analise final de lead com IA.
- Geracao de mensagem com IA.
- Frontend Vue 3 Options API.
- Dashboard basico.
- Tela de campanhas.
- Tela de leads.
- Tela de detalhe do lead.
- Registro de interacoes comerciais.
- Exportacao CSV.

## Modelos de dados minimos

- `users`
- `search_campaigns`
- `leads`
- `lead_scores`
- `lead_ai_reviews`
- `ai_analysis_cache`
- `commercial_interactions`
- `generated_messages`

## Backend

Tarefas:

- Criar `backend/src/server.ts` com Fastify, healthcheck e tratamento padrao de erro.
- Criar estrutura modular em `backend/src/modules`.
- Configurar Prisma em `backend/prisma/schema.prisma`.
- Criar variaveis em `.env.example`, incluindo `DATABASE_URL` e `OPENAI_API_KEY`.
- Implementar rotas REST:
  - `GET /api/campaigns`
  - `POST /api/campaigns`
  - `GET /api/campaigns/:id`
  - `PUT /api/campaigns/:id`
  - `DELETE /api/campaigns/:id`
  - `GET /api/leads`
  - `POST /api/leads`
  - `POST /api/leads/import`
  - `GET /api/leads/:id`
  - `PUT /api/leads/:id`
  - `DELETE /api/leads/:id`
  - `GET /api/campaigns/:id/leads`
  - `POST /api/leads/:id/score`
  - `GET /api/leads/:id/score`
  - `POST /api/ai/review-lead`
  - `POST /api/ai/generate-message`
  - `GET /api/leads/:id/interactions`
  - `POST /api/leads/:id/interactions`
  - `PUT /api/interactions/:id`
  - `GET /api/campaigns/:id/export/csv`

## Score objetivo inicial

Usar criterios verificaveis, limitando a 100:

- CNPJ ativo: +25
- Registro profissional encontrado: +15
- Sem site proprio: +25
- Tem apenas Instagram ou Linktree: +10
- Aparece no Google Maps: +10
- WhatsApp publico encontrado: +10
- Site ruim, lento ou desatualizado: +15
- Site sem SSL: +5
- Site sem CTA claro: +10
- Site sem WhatsApp visivel: +10
- Site sem meta title ou description: +5
- Regiao estrategica: +5

Regra importante: nao somar criterios incompativeis cegamente. Se nao ha site, pontuar ausencia de site. Se ha site, pontuar problemas do site.

## IA no MVP

Usar IA apenas depois dos filtros programaticos basicos.

Analise final do lead:

- Entrada compacta com dados basicos, score objetivo, presenca digital conhecida e historico se existir.
- Saida em JSON com `aiCommercialScore`, `temperature`, `recommendedOffer`, `summary`, `salesAngle`, `riskFactors`, `bestContactStrategy` e `confidence`.

Geracao de mensagem:

- Mensagem curta, personalizada, consultiva e sem tom de spam.
- Nunca mencionar scraping, IA ou automacao.
- Mensagem e sugestao para contato humano, nao disparo automatico.

## Frontend

Telas:

- Dashboard com total de campanhas, leads, hot, warm, contatados, respondidos, vendas, receita potencial, taxa de resposta e conversao.
- Campanhas com status, cidade, nicho, leads encontrados, leads hot/warm e acoes.
- Leads com filtros por campanha, nicho, cidade, temperatura, oferta, site, WhatsApp, Instagram, status comercial e faixa de score.
- Detalhe do lead com dados basicos, score, analise IA, oferta recomendada, mensagens e historico comercial.

## Fora de escopo

- Descoberta automatica de candidatos.
- Website snapshot completo.
- Social snapshot.
- Embeddings.
- Ajuste automatico de pesos por conversao.
- Envio automatico de mensagens.

## Criterios de aceite

- Criar campanha.
- Cadastrar lead manualmente.
- Importar leads por CSV.
- Ver lista de leads.
- Filtrar leads.
- Abrir detalhe de lead.
- Calcular score objetivo.
- Rodar analise IA final.
- Gerar mensagem personalizada.
- Registrar contato.
- Alterar status comercial.
- Exportar CSV.
- Ver dashboard basico.
