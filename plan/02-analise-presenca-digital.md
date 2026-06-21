# Etapa 2 - Analise de Presenca Digital

## Objetivo

Adicionar diagnostico programatico de site e redes sociais publicas, sempre enviando para IA apenas snapshots compactos e estruturados. A etapa melhora o score e recomenda ofertas com base em dores digitais reais.

## Entregaveis

- Modulo `websiteAnalysis`.
- Modulo `socialAnalysis`.
- Tabela `lead_digital_presence`.
- Tabela `lead_website_snapshots`.
- Tabela `lead_social_snapshots`.
- Analise IA de website snapshot.
- Analise IA de social snapshot.
- Score de presenca digital.
- Atualizacao da tela de detalhe do lead.

## Website snapshot programatico

Extrair:

- HTTP status.
- SSL.
- Tempo de resposta.
- Title.
- Meta description.
- H1.
- Headings.
- Texto principal resumido.
- Links principais.
- Plataforma provavel.
- Presenca de WhatsApp.
- Presenca de CTA.
- Presenca de formulario.
- Presenca de endereco.
- Presenca de telefone.
- Presenca de e-mail.
- Presenca de servicos.
- Presenca de depoimentos.
- Sinais basicos de SEO.
- Sinais de responsividade quando possivel.

Nao salvar HTML completo por padrao e nunca enviar HTML completo para IA.

## Analise IA do site

Entrada: snapshot compacto do site mais dados basicos do lead.

Saida esperada:

- `websiteQualityScore`
- `commercialOpportunity`
- `problems`
- `strengths`
- `salesAngle`
- `confidence`

Oportunidades aceitas:

- `none`
- `landing_page`
- `redesign`
- `seo_local`
- `maintenance`

## Social snapshot programatico

Extrair somente sinais publicos e compactos:

- Plataforma.
- URL do perfil.
- Bio.
- Link externo.
- Tem WhatsApp.
- Tem link de site.
- Estimativa de quantidade de posts, se disponivel.
- Sinal de atividade recente, se disponivel.
- Sinais de conteudo.
- Se depende apenas da rede social.

Nao fazer scraping invasivo, nao coletar dados privados e nao contornar login.

## Analise IA social

Entrada: snapshot social compacto.

Saida esperada:

- `socialPresenceScore`
- `dependsOnlyOnSocialMedia`
- `opportunity`
- `problems`
- `strengths`
- `salesAngle`
- `confidence`

## Endpoints

- `POST /api/leads/:id/analyze-website`
- `GET /api/leads/:id/website-snapshots`
- `POST /api/campaigns/:id/analyze-websites`
- `POST /api/leads/:id/analyze-social`
- `GET /api/leads/:id/social-snapshots`
- `POST /api/campaigns/:id/analyze-socials`

## Atualizacao do score

Criar `digital_presence_score` como media entre qualidade do site e presenca social quando ambos existirem.

Recalcular proporcionalmente quando algum componente estiver ausente.

## Criterios de aceite

- Analisar site de um lead por snapshot estruturado.
- Receber analise IA do site sem enviar HTML completo.
- Persistir snapshot e resultado IA.
- Analisar presenca social publica por snapshot estruturado.
- Atualizar `lead_digital_presence`.
- Atualizar score final com componente de presenca digital.
- Exibir diagnostico de site e social no detalhe do lead.

