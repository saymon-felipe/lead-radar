# Lead Radar - Plano de Implementacao

Este diretorio transforma o plano de negocio do PDF em etapas executaveis para construir o Lead Radar como ferramenta interna de aquisicao comercial.

## Norte estrategico

- O Lead Radar nasce como ferramenta interna, nao como SaaS publico.
- O objetivo inicial e gerar caixa vendendo servicos digitais: landing pages, sites, redesign, SEO local, Google Meu Negocio, organizacao de presenca digital e manutencao.
- A regra operacional central e: programacao filtra, IA interpreta, humano vende.
- O sistema nao deve disparar mensagens automaticamente.
- O MVP deve provar que conseguimos encontrar bons leads, priorizar oportunidades, gerar mensagens uteis e registrar resultado comercial.

## Stack recomendada

- Backend: Node.js, TypeScript, Fastify.
- Banco: MySQL ou MariaDB com Prisma.
- Frontend: Vue 3 com Options API.
- Coleta: Axios, Cheerio, Playwright quando necessario, controle de concorrencia.
- IA: OpenAI com prompts versionados, JSON schema, cache obrigatorio, registro de tokens e custo.
- Embeddings: salvar no MySQL/MariaDB como JSON ou BLOB no MVP e calcular similaridade na aplicacao.

## Ordem das etapas

1. [MVP operacional](./01-mvp-operacional.md)
2. [Analise de presenca digital](./02-analise-presenca-digital.md)
3. [Embeddings e similaridade](./03-embeddings-similaridade.md)
4. [Descoberta semi-automatica](./04-descoberta-semi-automatica.md)
5. [Otimizacao comercial](./05-otimizacao-comercial.md)
6. [Validacao comercial e operacao](./06-validacao-comercial-e-operacao.md)

## Escopo do MVP

Obrigatorio:

- Monorepo com backend e frontend.
- CRUD de campanhas.
- CRUD de leads.
- Importacao manual ou CSV.
- Score objetivo.
- Cache de IA.
- Cliente OpenAI.
- Analise final de lead com IA.
- Geracao de mensagem com IA.
- Painel Vue com dashboard, campanhas, leads e detalhe do lead.
- Registro de interacoes comerciais.
- Exportacao CSV.
- Website snapshot programatico.
- Analise IA do website snapshot.
- Embedding basico do perfil do lead.
- Similaridade com perfil ideal.

Fora do MVP:

- Envio automatico de WhatsApp ou e-mail em massa.
- CRM complexo.
- Multiempresa.
- Billing ou assinatura.
- SaaS publico.
- Mobile app.
- Scraping agressivo.
- Rede social scraping invasivo.
- Contorno de autenticacao ou bloqueios.
- Envio de HTML completo para IA.

## Criterios gerais de aceite

- O sistema funciona mesmo sem IA, usando score objetivo.
- Nenhuma chave sensivel fica hardcoded.
- Toda chamada de IA possui input estruturado, hash, prompt versionado, cache e validacao de schema.
- Toda pontuacao tem breakdown auditavel.
- O usuario consegue criar campanha, importar/cadastrar leads, filtrar, abrir detalhes, calcular score, gerar mensagem, registrar contato e exportar CSV.
- O contato comercial permanece humano, individual e consultivo.

