# Lead Radar

Lead Radar e uma ferramenta interna de inteligencia comercial B2B para encontrar, qualificar, priorizar e abordar leads locais com baixa presenca digital.

O MVP implementado aqui cobre a etapa operacional inicial, analise de presenca digital, embeddings/similaridade, descoberta semi-automatica, otimizacao comercial e validacao operacional: campanhas, leads, importacao CSV, score objetivo, snapshots de site/social, analises IA, embeddings, descoberta de candidatos, relatorios comerciais, geracao de mensagens, interacoes comerciais, dashboard e exportacao CSV.

## Stack

- Backend: Node.js, TypeScript, Fastify.
- Banco planejado: MySQL/MariaDB com Prisma.
- Frontend: Vue 3 com Options API e Vite.
- IA: OpenAI com cache, hash de input, prompt versionado e fallback local quando nao ha chave configurada.

## Estrutura

```txt
backend/
  src/
    modules/
      ai/
      campaigns/
      dashboard/
      discovery/
      embeddings/
      exports/
      interactions/
      leads/
      reports/
      scoring/
      socialAnalysis/
      websiteAnalysis/
    shared/
  prisma/
frontend/
  src/
    views/
    services/
    router/
plan/
```

## Rodando localmente

Instale as dependencias:

```bash
npm install
```

Copie o arquivo de ambiente do backend:

```bash
cp backend/.env.example backend/.env
```

Suba o backend:

```bash
npm run dev:backend
```

Em outro terminal, suba o frontend:

```bash
npm run dev:frontend
```

URLs padrao:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3333`
- Healthcheck: `http://localhost:3333/health`

## MySQL com Docker

O projeto agora inclui [docker-compose.yml](D:/Workspace/ws-sonusprime/lead-radar/docker-compose.yml:1) para subir um MySQL local em `localhost:3306`.

Subir o banco:

```bash
docker compose up -d
```

Parar o banco:

```bash
docker compose down
```

Credenciais para MySQL Workbench:

- Hostname: `127.0.0.1`
- Port: `3306`
- Username: `lead_radar`
- Password: `lead_radar`
- Default schema: `lead_radar`

Usuario root, se precisar:

- Username: `root`
- Password: `root`

## Persistencia

O MVP roda com armazenamento em memoria para validar rapidamente o fluxo operacional.

O schema Prisma e a migration inicial estao em `backend/prisma/` para a proxima etapa de persistencia em MySQL/MariaDB.

Para gerar o client Prisma:

```bash
npm run prisma:generate
```

Para aplicar migrations em um banco configurado no `DATABASE_URL`:

```bash
npm run prisma:migrate --workspace backend
```

## IA

Se `OPENAI_API_KEY` estiver vazia, o backend usa fallback local para analise comercial e mensagem. Isso mantem o sistema funcional sem IA, como definido no plano.

Quando a chave estiver configurada, as chamadas usam:

- input estruturado e compacto;
- hash SHA-256 do input;
- prompt versionado;
- validacao de schema;
- cache por entidade, tipo de analise, modelo, versao de prompt e hash.

## Analise de presenca digital

O backend implementa:

- `POST /api/leads/:id/analyze-website`
- `GET /api/leads/:id/website-snapshots`
- `POST /api/campaigns/:id/analyze-websites`
- `POST /api/leads/:id/analyze-social`
- `GET /api/leads/:id/social-snapshots`
- `POST /api/campaigns/:id/analyze-socials`

O snapshot de site extrai status HTTP, SSL, tempo de resposta, title, meta description, H1, headings, resumo textual, plataforma provavel, CTA, WhatsApp, formulario, localizacao, servicos, depoimentos e problemas detectados.

O snapshot social usa apenas sinais publicos e compactos de perfis ja associados ao lead. Nao ha login, coleta privada, crawling agressivo ou contorno de bloqueios.

HTML bruto nao e salvo nem enviado para IA. A IA recebe apenas JSON estruturado e resumido.

## Embeddings e similaridade

O backend implementa:

- `POST /api/leads/:id/embeddings`
- `POST /api/campaigns/:id/embeddings/rebuild`
- `GET /api/leads/:id/similar`

Quando `OPENAI_API_KEY` estiver configurada, os embeddings usam `OPENAI_EMBEDDING_MODEL` ou `text-embedding-3-small`. Sem chave, o MVP usa um vetor local deterministico para manter o fluxo funcional.

O perfil ideal inicial para psicologos e gerado automaticamente e comparado ao perfil resumido do lead. O `embedding_similarity_score` entra no score final quando disponivel.

## Descoberta semi-automatica

O backend implementa:

- `POST /api/campaigns/:id/discover`
- `POST /api/discovery/review-candidates`
- `POST /api/ai/review-search-candidates`
- `GET /api/campaigns/:id/discovery-candidates`

A descoberta coleta candidatos publicos por nicho/cidade, aplica filtros programaticos, revisa lotes compactos com IA ou fallback local, deduplica e cria leads promissores. A rotina nao faz login, nao contorna bloqueios e nao executa crawling infinito.

## Relatorios e validacao

O backend implementa:

- `GET /api/reports/commercial`
- `GET /api/campaigns/:id/report`
- `GET /api/campaigns/:id/validation`
- `POST /api/reports/score-calibration`
- `GET /api/reports/score-calibration`

Os relatorios consolidam conversao por nicho, cidade, faixa de score, oferta, canal e temperatura. A validacao compara a campanha com a meta inicial: 300 leads coletados, 50 hot/warm revisados, 50 contatos manuais, 1 venda minima e 2 vendas como canal forte.

As sugestoes de peso de score sao versionadas e auditaveis. No MVP elas sao sugestoes operacionais; a aplicacao automatica de pesos fica para a etapa seguinte de persistencia e calibracao controlada.

## CSV de leads

A importacao aceita cabecalhos como:

```csv
businessName,niche,city,state,whatsapp,websiteUrl,instagramUrl
Dra Ana Silva,Psicologos,Londrina,PR,5543999999999,,https://instagram.com/exemplo
```

Tambem ha aliases em portugues para alguns campos: `nome`, `nicho`, `cidade`, `estado`, `telefone`, `site`, `instagram` e `registro`.

## Fluxo recomendado

1. Criar campanha.
2. Cadastrar ou importar leads.
3. Filtrar por cidade, temperatura e score.
4. Abrir detalhe do lead.
5. Recalcular score se necessario.
6. Rodar analise IA final.
7. Analisar site e social quando houver links publicos.
8. Gerar embeddings e revisar leads similares.
9. Rodar descoberta semi-automatica quando precisar abastecer a campanha.
10. Gerar mensagem consultiva.
11. Fazer contato humano.
12. Registrar interacao comercial.
13. Revisar relatorio e validacao da campanha.
14. Ajustar nicho, oferta, mensagem ou scoring conforme decisao recomendada.
15. Exportar CSV da campanha quando necessario.
