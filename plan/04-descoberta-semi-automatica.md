# Etapa 4 - Descoberta Semi-Automatica

## Objetivo

Automatizar parte da coleta de candidatos por nicho e cidade, mantendo filtros programaticos antes da IA. A etapa deve inserir apenas leads promissores e evitar diretorios, marketplaces, artigos, vagas e resultados irrelevantes.

## Entregaveis

- Modulo `discovery`.
- Modulo `scraping`.
- Busca por nicho e cidade.
- Coleta de candidatos com title, URL, snippet e source.
- Filtro programatico inicial.
- Revisao de candidatos por IA em lotes compactos.
- Deduplicacao.
- Insercao automatica de leads promissores.

## Fluxo

1. Usuario inicia descoberta em uma campanha.
2. Sistema coleta candidatos brutos.
3. Sistema remove duplicados.
4. Sistema aplica filtros programaticos.
5. Sistema envia lote compacto para IA revisar candidatos.
6. Sistema salva candidatos aprovados como leads.
7. Sistema calcula score objetivo inicial.
8. Usuario revisa os leads antes de qualquer contato.

## Filtros antes da IA

Antes de chamar IA, verificar:

- Nicho bate com campanha.
- Cidade ou regiao bate.
- Tem algum canal de contato ou indicio de contato.
- Parece negocio ou profissional real.
- Nao e duplicado.
- Nao e diretorio generico.
- Nao e marketplace.
- Nao e artigo.
- Nao e vaga de emprego.
- Nao e resultado irrelevante.

## Revisao IA de candidatos

Entrada:

- `targetNiche`
- `targetCity`
- Lista compacta de resultados com `title`, `url`, `snippet` e `source`

Saida:

- `index`
- `isPotentialLead`
- `priority`
- `reason`

Prioridades:

- `high`
- `medium`
- `low`
- `discard`

## Endpoints

- `POST /api/campaigns/:id/discover`
- `POST /api/discovery/review-candidates`
- `POST /api/ai/review-search-candidates`

## Cuidados operacionais

- Controlar concorrencia.
- Definir timeouts.
- Fazer retry limitado.
- Respeitar dados publicos.
- Nao contornar bloqueios.
- Nao fazer crawling infinito.
- Nao chamar IA para tudo.
- Registrar fonte e evidencias de cada lead.

## Criterios de aceite

- Rodar descoberta por campanha.
- Coletar candidatos por nicho e cidade.
- Filtrar resultados obviamente invalidos sem IA.
- Enviar apenas lotes compactos para IA.
- Deduplicar candidatos.
- Criar leads promissores automaticamente.
- Registrar motivo de inclusao ou descarte.
- Manter usuario no controle antes do contato comercial.

