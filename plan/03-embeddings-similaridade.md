# Etapa 3 - Embeddings e Similaridade

## Objetivo

Usar embeddings para melhorar ranking, reduzir retrabalho e criar memoria comercial. O MVP deve comecar simples: gerar vetores, salvar no banco e comparar leads com perfil ideal, leads ganhos e leads perdidos.

## Entregaveis

- Modulo `embeddings`.
- Tabela `lead_embeddings`.
- Perfil ideal por nicho.
- Embedding do perfil resumido do lead.
- Embedding do website summary.
- Embedding do social summary.
- Similaridade com perfil ideal.
- Similaridade com leads ganhos.
- Similaridade com leads perdidos.
- Atualizacao do score final.

## Textos que podem virar embedding

- Perfil resumido do lead.
- Snippet de resultado de busca.
- Resumo estruturado do site.
- Resumo de rede social.
- Diagnostico comercial curto.
- Mensagens que converteram.
- Leads ganhos.
- Leads perdidos.
- Perfil ideal por nicho.

Nao gerar embeddings de HTML bruto.

## Perfil ideal inicial

Para psicologos:

> Psicologo local com Instagram ativo, WhatsApp publico, atuacao clara, sem site proprio e presenca digital fragmentada.

Leads semanticamente proximos desse perfil recebem aumento no `embedding_similarity_score`.

## Banco

No MVP, manter embeddings em MySQL/MariaDB como JSON ou BLOB e calcular similaridade na aplicacao.

Campos principais:

- `lead_id`
- `embedding_type`
- `source_text`
- `embedding_vector`
- `model`
- `created_at`

Tipos:

- `search_result`
- `website_summary`
- `social_summary`
- `lead_profile`
- `conversion_profile`
- `lost_profile`
- `sales_message`
- `ideal_profile`

## Score final

Formula inicial completa:

```txt
final_score =
  objective_score * 0.50
  + ai_commercial_score * 0.30
  + digital_presence_score * 0.10
  + embedding_similarity_score * 0.10
```

Sem embeddings:

```txt
final_score =
  objective_score * 0.60
  + ai_commercial_score * 0.30
  + digital_presence_score * 0.10
```

Sem IA:

```txt
final_score = objective_score
```

## Endpoints

- `POST /api/leads/:id/embeddings`
- `POST /api/campaigns/:id/embeddings/rebuild`
- `GET /api/leads/:id/similar`

## Criterios de aceite

- Gerar embedding basico do perfil do lead.
- Gerar embedding para perfil ideal do nicho.
- Comparar lead com perfil ideal.
- Persistir vetores e texto fonte.
- Exibir similaridade no detalhe do lead.
- Usar similaridade no score final quando disponivel.
- Registrar leads ganhos e perdidos como memoria comercial futura.

