# Etapa 6 - Validacao Comercial e Operacao

## Objetivo

Executar a primeira campanha real para provar se o Lead Radar gera oportunidades comerciais acionaveis. Esta etapa mede se o canal funciona antes de pensar em automacao avancada ou SaaS.

## Campanha inicial

- Nicho: Psicologos.
- Cidades: Londrina/PR, Cambe/PR, Maringa/PR.
- Meta de coleta: 300 leads.
- Meta de revisao: 50 leads hot ou warm.
- Meta de contato: 50 contatos manuais.
- Oferta principal: Landing Page Express.
- Preco: R$ 597 a vista ou 10x de R$ 59,70.
- Meta minima: 1 venda.
- Meta boa: 2 ou mais vendas.

## Interpretacao dos resultados

- 1 venda a cada 100 contatos qualificados: canal potencialmente viavel.
- 2 ou mais vendas a cada 100 contatos qualificados: canal forte.
- 0 vendas em 300 contatos: revisar nicho, oferta, mensagem ou scoring.
- Muitas respostas sem venda: problema na oferta ou preco.
- Poucas respostas: problema na abordagem ou qualidade dos leads.
- Leads sem dor real: problema no scoring.

## Mensagem base

```txt
Ola, [Nome]. Vi que voce atende em [Cidade] e encontrei seu perfil profissional.

Notei que voce tem presenca online, mas nao encontrei um site proprio com suas informacoes, servicos e contato centralizados.

Trabalho com paginas profissionais para psicologos, focadas em transmitir confianca, organizar sua apresentacao e facilitar o contato pelo WhatsApp.

Posso te enviar uma analise rapida de como ficaria uma pagina profissional para seu atendimento?
```

## Regras de contato

- Contato humano, individual e consultivo.
- Sem envio automatico.
- Sem promessa de resultado.
- Sem mencionar scraping, IA ou automacao.
- Personalizar com base na dor real detectada.
- Registrar status e observacoes apos cada contato.

## Status comerciais

- `not_contacted`
- `contacted`
- `replied`
- `interested`
- `meeting_scheduled`
- `proposal_sent`
- `won`
- `lost`
- `no_response`
- `invalid_contact`

## Rotina operacional

1. Criar campanha.
2. Importar ou descobrir leads.
3. Deduplicar.
4. Calcular score.
5. Revisar leads hot e warm.
6. Gerar mensagem personalizada.
7. Fazer contato humano.
8. Registrar status.
9. Registrar resposta, perda ou venda.
10. Revisar metricas da campanha.
11. Ajustar oferta, mensagem ou score.

## Criterios de aceite

- 300 leads coletados ou importados.
- 50 melhores leads revisados.
- 50 contatos manuais registrados.
- Respostas e vendas registradas no sistema.
- Relatorio com taxa de resposta, taxa de conversao e receita estimada.
- Decisao documentada: continuar nicho, ajustar nicho, ajustar oferta ou ajustar abordagem.

