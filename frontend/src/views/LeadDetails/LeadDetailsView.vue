<template>
  <section class="fade-in-up">
    <!-- Header Inteligente -->
    <header class="page-header" style="flex-wrap: wrap; gap: 16px;">
      <div>
        <p class="topbar-kicker"><i class="ri-arrow-right-line"></i> Painel de Prospecção</p>
        <h1 style="font-size: 28px;">{{ lead?.businessName ?? "Carregando Lead..." }}</h1>
        <p v-if="lead" style="font-size: 14px;" class="muted">
          <i class="ri-briefcase-line"></i> {{ lead.niche }} em <i class="ri-map-pin-line"></i> {{ lead.city }}/{{ lead.state }}
        </p>
      </div>
      <div class="actions" style="gap: 8px;">
        <button class="secondary" @click="$router.back()"><i class="ri-arrow-left-line"></i> Voltar</button>
        <button class="secondary" @click="scoreLead" title="Recalcular pontuação comercial"><i class="ri-refresh-line"></i> Recalcular Score</button>
        <button class="secondary" @click="analyzeWebsite" title="Disparar robô de análise de conteúdo do site"><i class="ri-global-line"></i> Analisar Site</button>
        <button class="secondary" @click="analyzeSocial" title="Disparar robô de análise de rede social do lead"><i class="ri-instagram-line"></i> Analisar Social</button>
        <button class="secondary" @click="rebuildEmbeddings" title="Recalcular vetores de similaridade IA"><i class="ri-brain-line"></i> Embeddings</button>
        <button @click="reviewLead" title="Gerar parecer técnico da IA sobre o negócio"><i class="ri-magic-line"></i> Análise IA</button>
        <button @click="generateMessage" title="Gerar mensagens sugestivas personalizadas para abordagem"><i class="ri-message-2-line"></i> Gerar Abordagem</button>
      </div>
    </header>

    <p v-if="error" class="error"><i class="ri-error-warning-line"></i> {{ error }}</p>

    <!-- Navegação de Abas -->
    <div v-if="lead" class="tabs-navigation" style="display: flex; gap: 12px; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; overflow-x: auto; white-space: nowrap;">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'overview' }"
        @click="activeTab = 'overview'"
        title="Visualizar dados do lead e registrar histórico no CRM"
      >
        <i class="ri-user-shared-line"></i> Visão Geral & CRM
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'presence' }"
        @click="activeTab = 'presence'"
        title="Visualizar sinais coletados do website e redes sociais"
      >
        <i class="ri-global-line"></i> Presença Digital
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'sales_ia' }"
        @click="activeTab = 'sales_ia'"
        title="Visualizar sugestões de mensagens de vendas e similaridade IA"
      >
        <i class="ri-message-3-line"></i> Abordagem & Similaridade
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'logs' }"
        @click="activeTab = 'logs'"
        title="Visualizar logs de análise estruturada da IA"
      >
        <i class="ri-code-box-line"></i> Logs da IA
      </button>
    </div>

    <!-- Conteúdo com Transição Animada -->
    <Transition name="tab" mode="out-in" v-if="lead">
      <!-- Aba: Visão Geral & CRM -->
      <div v-if="activeTab === 'overview'" key="overview" class="tab-pane">
        <!-- Linha Superior: Dados Básicos e Score lado a lado -->
        <div class="grid cols-2" style="align-items: start; gap: 24px; margin-bottom: 24px;">
          <!-- Dados Básicos -->
          <div class="panel" style="margin-bottom: 0; height: 100%;">
            <h2><i class="ri-profile-line"></i> Dados Básicos</h2>
            <div style="display: grid; gap: 14px; font-size: 14px;">
              <p><strong>Nome Comercial:</strong> <span class="text-highlight">{{ lead.businessName }}</span></p>
              <p><strong>Responsável:</strong> {{ lead.personName ?? "-" }}</p>
              <p><strong>WhatsApp:</strong> <span v-if="lead.whatsapp" style="color: #38bdf8; font-weight: 700;">{{ lead.whatsapp }}</span><span v-else class="muted">-</span></p>
              <p><strong>E-mail:</strong> <span v-if="lead.email" class="text-highlight">{{ lead.email }}</span><span v-else class="muted">-</span></p>
              <p>
                <strong>Site Oficial:</strong>
                <a v-if="lead.websiteUrl" :href="lead.websiteUrl" target="_blank" style="color: var(--primary-hover); word-break: break-all;">
                  <i class="ri-external-link-line"></i> {{ lead.websiteUrl }}
                </a>
                <span v-else class="muted">-</span>
              </p>
              <p>
                <strong>Instagram:</strong>
                <a v-if="lead.instagramUrl" :href="lead.instagramUrl" target="_blank" style="color: var(--primary-hover); word-break: break-all;">
                  <i class="ri-instagram-line"></i> Perfil
                </a>
                <span v-else class="muted">-</span>
              </p>
            </div>
          </div>

          <!-- Score & Temperatura -->
          <div class="panel" style="margin-bottom: 0; height: 100%;">
            <h2><i class="ri-line-chart-line"></i> Avaliação do Score</h2>
            <template v-if="lead.score">
              <div class="score-gauge-container">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <span class="badge" :class="lead.score.temperature">
                    {{ formatTemperature(lead.score.temperature) }}
                  </span>
                  <strong style="font-size: 22px; color: var(--text-highlight);">{{ lead.score.finalScore }} pts</strong>
                </div>
                <div class="score-bar-wrapper" style="height: 10px; margin-bottom: 16px;">
                  <div class="score-bar-fill" :class="lead.score.temperature" :style="{ width: lead.score.finalScore + '%' }"></div>
                </div>
              </div>

              <div style="display: grid; gap: 8px; font-size: 13px; margin-bottom: 16px;">
                <p><strong>Oferta Comercial Recomendada:</strong></p>
                <p class="text-highlight" style="font-weight: 700; font-size: 14px; color: var(--accent-warm);">
                  <i class="ri-gift-line"></i> {{ formatOffer(lead.score.recommendedOffer) }}
                </p>
                <p><strong>Presença Digital Geral:</strong> <span class="text-highlight">{{ lead.score.digitalPresenceScore ?? "-" }} / 100</span></p>
              </div>

              <h3 style="font-size: 12px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">Detalhamento da Pontuação</h3>
              <div class="table-responsive">
                <table style="font-size: 12px;">
                  <tbody>
                    <tr v-for="item in lead.score.scoreBreakdownJson" :key="item.key">
                      <td>{{ item.label }}</td>
                      <td style="text-align: right; font-weight: 700;">
                        <span v-if="item.applied" style="color: var(--accent-green);">+{{ item.points }}</span>
                        <span v-else class="muted">-</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <p v-else class="muted">Nenhuma pontuação calculada.</p>
          </div>
        </div>

        <!-- Linha Inferior: Registrar Interação (largura total) e Linha do Tempo Comercial (largura total) abaixo -->
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <!-- Registrar Contato Comercial -->
          <form class="panel" style="margin-bottom: 0;" @submit.prevent="createInteraction">
            <h2><i class="ri-user-follow-line"></i> Registrar Nova Interação</h2>
            <div class="grid cols-3" style="gap: 16px;">
              <label>
                Novo Status Comercial
                <select v-model="interaction.status">
                  <option value="contacted">Contatado</option>
                  <option value="replied">Respondeu</option>
                  <option value="interested">Interessado</option>
                  <option value="meeting_scheduled">Reunião Agendada</option>
                  <option value="proposal_sent">Proposta Enviada</option>
                  <option value="won">Ganho (Fechou Contrato)</option>
                  <option value="lost">Perdido</option>
                  <option value="no_response">Sem Resposta</option>
                  <option value="invalid_contact">Contato Inválido</option>
                </select>
              </label>
              <label>
                Canal Utilizado
                <input v-model="interaction.contactChannel" placeholder="Ex: whatsapp, instagram, ligação" />
              </label>
              <label>
                Notas do Contato
                <textarea v-model="interaction.notes" placeholder="Descreva o contato comercial..." style="height: 38px; min-height: 38px;"></textarea>
              </label>
            </div>
            <div class="actions mt-3" style="margin-top: 16px; justify-content: flex-end;">
              <button type="submit" style="min-width: 200px;"><i class="ri-chat-follow-up-line"></i> Salvar Interação</button>
            </div>
          </form>

          <!-- Histórico Comercial (Timeline) -->
          <div class="panel" style="margin-bottom: 0;">
            <h2><i class="ri-history-line"></i> Linha do Tempo Comercial</h2>
            <div class="timeline mt-1" style="max-height: 480px; overflow-y: auto; padding-right: 8px;">
              <div v-for="item in lead.interactions" :key="item.id" class="timeline-item">
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span class="badge" style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); color: #93c5fd; padding: 4px 8px; font-size: 11px;">
                      {{ formatInteractionStatus(item.status) }}
                    </span>
                    <span v-if="item.contactedAt" style="font-size: 11px;" class="muted">
                      {{ new Date(item.contactedAt).toLocaleDateString('pt-BR') }}
                    </span>
                  </div>
                  <p style="font-size: 13px; font-weight: 700; margin-bottom: 4px;" class="text-highlight">
                    Canal: {{ item.contactChannel ?? "-" }}
                  </p>
                  <p style="font-size: 13px; line-height: 1.5; margin: 0;">{{ item.notes ?? "Sem observações adicionais." }}</p>
                </div>
              </div>
              <div v-if="!lead.interactions?.length" style="text-align: center; padding: 40px 0;" class="muted">
                Nenhuma interação registrada. Dê início à prospecção registrando um contato!
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Aba: Presença Digital -->
      <div v-else-if="activeTab === 'presence'" key="presence" class="tab-pane">
        <div class="grid cols-2" style="align-items: start; gap: 24px;">
          <!-- Site Snapshot -->
          <div class="panel" style="margin-bottom: 0;">
            <h2><i class="ri-global-line"></i> Sinais de Presença na Web</h2>
            <template v-if="latestWebsite">
              <div class="grid cols-2" style="gap: 16px; margin-bottom: 16px;">
                <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-md);">
                  <span class="muted" style="font-size: 10px; font-weight: 700; text-transform: uppercase;">Informações Gerais</span>
                  <div style="margin-top: 8px; display: grid; gap: 6px; font-size: 13px;">
                    <p><strong>Status HTTP:</strong> <span class="badge" style="background: rgba(16, 185, 129, 0.08); color: #34d399; padding: 2px 6px;">{{ latestWebsite.httpStatus ?? "-" }}</span></p>
                    <p><strong>Segurança SSL:</strong> {{ latestWebsite.hasSsl ? "Sim (Ativo)" : "Não (Inseguro)" }}</p>
                    <p><strong>Tempo de Resposta:</strong> {{ latestWebsite.loadTimeMs ?? "-" }} ms</p>
                    <p><strong>CMS / Plataforma:</strong> {{ formatPlatform(latestWebsite.platform) }}</p>
                  </div>
                </div>

                <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-md);">
                  <span class="muted" style="font-size: 10px; font-weight: 700; text-transform: uppercase;">Elementos Relevantes</span>
                  <div style="margin-top: 8px; display: grid; gap: 6px; font-size: 13px;">
                    <p><strong>Botão CTA (Chamada de Ação):</strong> {{ latestWebsite.hasCta ? "Sim" : "Não" }}</p>
                    <p><strong>Botão de WhatsApp:</strong> {{ latestWebsite.hasWhatsapp ? "Sim" : "Não" }}</p>
                    <p><strong>Formulário de Contato:</strong> {{ latestWebsite.hasContactForm ? "Sim" : "Não" }}</p>
                    <p><strong>Título da Página:</strong> <span class="text-highlight" style="font-size: 12px; font-style: italic;">{{ latestWebsite.title ?? "-" }}</span></p>
                  </div>
                </div>
              </div>

              <div v-if="latestWebsite.aiReview" class="message-box" style="border-left: 3px solid var(--primary-hover);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <strong style="color: var(--text-highlight);">Análise do Site (Qualidade: {{ latestWebsite.aiReview.websiteQualityScore }}/100)</strong>
                  <span class="badge warm" style="font-size: 10px;">{{ formatOffer(latestWebsite.aiReview.commercialOpportunity) }}</span>
                </div>
                <p style="font-size: 13px; line-height: 1.6; color: var(--text-main); margin-bottom: 8px;"><strong>Ângulo de Vendas:</strong> {{ latestWebsite.aiReview.salesAngle }}</p>

                <div v-if="latestWebsite.aiReview.problems?.length" class="mt-2">
                  <span style="font-size: 11px; font-weight: 700; color: var(--accent-hot); text-transform: uppercase;">Problemas Detectados:</span>
                  <p class="muted" style="font-size: 12px; line-height: 1.4; margin-top: 2px;">{{ latestWebsite.aiReview.problems.join(", ") }}</p>
                </div>
                <div v-if="latestWebsite.aiReview.strengths?.length" class="mt-2">
                  <span style="font-size: 11px; font-weight: 700; color: var(--accent-green); text-transform: uppercase;">Pontos Fortes:</span>
                  <p class="muted" style="font-size: 12px; line-height: 1.4; margin-top: 2px;">{{ latestWebsite.aiReview.strengths.join(", ") }}</p>
                </div>
              </div>
            </template>
            <p v-else class="muted">Nenhum snapshot de site registrado para este lead.</p>
          </div>

          <!-- Social Snapshot -->
          <div class="panel" style="margin-bottom: 0;">
            <h2><i class="ri-instagram-line"></i> Sinais de Redes Sociais</h2>
            <template v-if="latestSocial">
              <div class="grid cols-2" style="gap: 16px; margin-bottom: 16px;">
                <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-md);">
                  <span class="muted" style="font-size: 10px; font-weight: 700; text-transform: uppercase;">Metadados do Perfil</span>
                  <div style="margin-top: 8px; display: grid; gap: 6px; font-size: 13px;">
                    <p><strong>Rede Social:</strong> {{ formatPlatform(latestSocial.platform) }}</p>
                    <p><strong>Link do Perfil:</strong> <a :href="latestSocial.profileUrl" target="_blank" style="color: var(--primary-hover);">Acessar Canal</a></p>
                    <p><strong>WhatsApp Visível:</strong> {{ latestSocial.hasWhatsapp ? "Sim" : "Não" }}</p>
                    <p><strong>Website no Perfil:</strong> {{ latestSocial.hasWebsiteLink ? "Sim" : "Não" }}</p>
                  </div>
                </div>

                <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-md);">
                  <span class="muted" style="font-size: 10px; font-weight: 700; text-transform: uppercase;">Apresentação & Biografia</span>
                  <p style="margin-top: 8px; font-size: 12px; line-height: 1.5;" class="text-highlight">
                    {{ latestSocial.bioText ?? "Biografia vazia ou não extraída." }}
                  </p>
                </div>
              </div>

              <div v-if="latestSocial.aiReview" class="message-box" style="border-left: 3px solid var(--primary-hover);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <strong style="color: var(--text-highlight);">Análise Social (Pontuação: {{ latestSocial.aiReview.socialPresenceScore }}/100)</strong>
                  <span class="badge warm" style="font-size: 10px;">{{ formatOffer(latestSocial.aiReview.opportunity) }}</span>
                </div>
                <p style="font-size: 13px; line-height: 1.6; color: var(--text-main); margin-bottom: 8px;"><strong>Ângulo de Vendas:</strong> {{ latestSocial.aiReview.salesAngle }}</p>

                <div v-if="latestSocial.aiReview.problems?.length" class="mt-2">
                  <span style="font-size: 11px; font-weight: 700; color: var(--accent-hot); text-transform: uppercase;">Problemas no Perfil:</span>
                  <p class="muted" style="font-size: 12px; line-height: 1.4; margin-top: 2px;">{{ latestSocial.aiReview.problems.join(", ") }}</p>
                </div>
              </div>
            </template>
            <p v-else class="muted">Nenhum snapshot social registrado para este lead.</p>
          </div>
        </div>
      </div>

      <!-- Aba: Abordagem & Similaridade -->
      <div v-else-if="activeTab === 'sales_ia'" key="sales_ia" class="tab-pane">
        <div class="grid cols-2" style="align-items: start; gap: 24px;">
          <!-- Mensagens de Abordagem Sugeridas -->
          <div class="panel" style="margin-bottom: 0;">
            <h2><i class="ri-message-3-line"></i> Abordagens de Venda Sugeridas</h2>
            <div v-if="lead.messages?.length">
              <div v-for="message in lead.messages" :key="message.id" class="message-box" style="margin-bottom: 12px; padding-right: 50px; position: relative;">
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 6px; font-weight: 700; text-transform: uppercase;">Canal: {{ message.channel }} · Tom: {{ message.tone }}</p>
                <p style="margin: 0; line-height: 1.6; font-size: 14px; font-family: var(--font-sans);">{{ message.content }}</p>

                <button
                  type="button"
                  class="message-box-copy"
                  @click="copyMessageText(message.content, message.id)"
                  :title="copiedMessageId === message.id ? 'Copiado!' : 'Copiar Abordagem'"
                >
                  <i v-if="copiedMessageId === message.id" class="ri-check-line" style="color: var(--accent-green)"></i>
                  <i v-else class="ri-file-copy-2-line"></i>
                </button>
              </div>
            </div>
            <p v-else class="muted">Nenhuma abordagem sugerida. Clique em "Gerar Abordagem" na barra superior.</p>
          </div>

          <!-- Embeddings e Leads Similares -->
          <div class="panel" style="margin-bottom: 0; display: flex; flex-direction: column; gap: 16px;">
            <h2><i class="ri-compasses-line"></i> Matriz de Similaridade IA</h2>
            <div class="grid cols-2" style="gap: 16px;">
              <div>
                <span class="muted" style="font-size: 11px; font-weight: 700; text-transform: uppercase;">Compatibilidade Perfil Ideal</span>
                <strong style="font-size: 24px; display: block; margin-top: 6px; color: var(--text-highlight);">{{ idealSimilarity }}</strong>
              </div>
              <div>
                <span class="muted" style="font-size: 11px; font-weight: 700; text-transform: uppercase;">Vetores Cadastrados</span>
                <strong style="font-size: 24px; display: block; margin-top: 6px;">{{ lead.embeddings?.length ?? 0 }} registros</strong>
              </div>
            </div>

            <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
              <h3 class="mb-2" style="font-size: 13px; text-transform: uppercase; color: var(--text-muted);"><i class="ri-team-line"></i> Leads com Padrão Semântico Similar</h3>
              <div v-if="similar.length" style="display: flex; flex-direction: column; gap: 10px;">
                <div v-for="item in similar" :key="item.embeddingId" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
                  <RouterLink v-if="item.lead" :to="`/leads/${item.lead.id}`" style="color: #38bdf8; font-weight: 600; text-decoration: none; font-size: 13px;">
                    {{ item.lead.businessName }}
                  </RouterLink>
                  <span v-else class="muted" style="font-size: 13px;">{{ formatEmbeddingType(item.embeddingType) }}</span>

                  <div class="flex-row-center">
                    <span style="font-size: 12px; font-weight: 700;">{{ Math.round(item.similarity * 100) }}%</span>
                    <div class="score-bar-wrapper" style="width: 50px; height: 6px;">
                      <div class="score-bar-fill" :style="{ width: Math.round(item.similarity * 100) + '%' }"></div>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="muted" style="font-size: 13px;">Nenhum lead similar calculado.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Aba: Logs da IA -->
      <div v-else-if="activeTab === 'logs'" key="logs" class="tab-pane">
        <div class="panel" style="margin-bottom: 0;">
          <h2><i class="ri-code-box-line"></i> Logs de Análise Estruturada da IA</h2>
          <div v-if="lead.aiReviews?.length" style="display: flex; flex-direction: column; gap: 16px; width: 100%;">
            <div v-for="review in lead.aiReviews" :key="review.id" class="message-box" style="font-family: var(--font-mono); font-size: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); max-height: 480px; overflow-y: auto; width: 100%;">
              <strong style="color: var(--text-highlight); font-family: var(--font-sans); display: block; margin-bottom: 8px;"><i class="ri-cpu-line" style="color: var(--primary-hover); margin-right: 6px;"></i>{{ formatAnalysisType(review.analysisType) }}</strong>
              <pre>{{ JSON.stringify(review.outputJson, null, 2) }}</pre>
            </div>
          </div>
          <p v-else class="muted">Nenhum log estruturado registrado.</p>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  api,
  formatAnalysisTypeLabel,
  formatEmbeddingTypeLabel,
  formatInteractionStatusLabel,
  formatOfferLabel,
  formatPlatformLabel,
  formatTemperatureLabel,
  type Lead,
  type SimilarLead
} from "../../services/api";

export default defineComponent({
  name: "LeadDetailsView",
  props: {
    id: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      activeTab: "overview",
      lead: undefined as Lead | undefined,
      interaction: {
        status: "contacted",
        contactChannel: "whatsapp",
        notes: ""
      },
      similar: [] as SimilarLead[],
      error: "",
      copiedMessageId: null as number | null
    };
  },
  mounted() {
    void this.load();
  },
  methods: {
    leadId(): number {
      return Number(this.id);
    },
    async load() {
      this.lead = await api.lead(this.leadId());
      this.similar = await api.similarLeads(this.leadId()).catch(() => []);
    },
    async scoreLead() {
      await api.scoreLead(this.leadId());
      await this.load();
    },
    async analyzeWebsite() {
      try {
        this.error = "";
        await api.analyzeWebsite(this.leadId());
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao analisar site";
      }
    },
    async analyzeSocial() {
      try {
        this.error = "";
        await api.analyzeSocial(this.leadId());
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao analisar social";
      }
    },
    async rebuildEmbeddings() {
      try {
        this.error = "";
        await api.rebuildLeadEmbeddings(this.leadId());
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao gerar embeddings";
      }
    },
    async reviewLead() {
      try {
        this.error = "";
        await api.reviewLead(this.leadId());
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha na análise IA";
      }
    },
    async generateMessage() {
      try {
        this.error = "";
        await api.generateMessage(this.leadId());
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao gerar mensagem";
      }
    },
    async createInteraction() {
      await api.createInteraction(this.leadId(), this.interaction);
      this.interaction.notes = "";
      await this.load();
    },
    copyMessageText(text: string, id: number) {
      navigator.clipboard.writeText(text).then(() => {
        this.copiedMessageId = id;
        setTimeout(() => {
          this.copiedMessageId = null;
        }, 1500);
      });
    },
    formatTemperature(value?: string) {
      return formatTemperatureLabel(value);
    },
    formatOffer(value?: string) {
      return formatOfferLabel(value);
    },
    formatInteractionStatus(value?: string) {
      return formatInteractionStatusLabel(value);
    },
    formatAnalysisType(value?: string) {
      return formatAnalysisTypeLabel(value);
    },
    formatEmbeddingType(value?: string) {
      return formatEmbeddingTypeLabel(value);
    },
    formatPlatform(value?: string) {
      return formatPlatformLabel(value);
    }
  },
  computed: {
    latestWebsite() {
      return this.lead?.websiteSnapshots?.slice().sort((a, b) => b.id - a.id)[0];
    },
    latestSocial() {
      return this.lead?.socialSnapshots?.slice().sort((a, b) => b.id - a.id)[0];
    },
    idealSimilarity() {
      const profile = this.lead?.embeddings
        ?.filter((embedding) => embedding.embeddingType === "lead_profile")
        .sort((a, b) => b.id - a.id)[0];
      const score = profile?.metadataJson?.idealSimilarityScore;
      return typeof score === "number" ? `${score}%` : "-";
    }
  }
});
</script>

<style scoped>
.tab-btn {
  background: transparent;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 700;
  padding: 10px 20px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all var(--transition-fast);
  margin-bottom: -13px;
}

.tab-btn:hover {
  color: var(--text-highlight);
  background: rgba(255, 255, 255, 0.02);
}

.tab-btn.active {
  color: #38bdf8;
  border-bottom: 2px solid #38bdf8;
  background: rgba(14, 165, 233, 0.05);
}

.tab-btn i {
  font-size: 16px;
}

/* Transitions de Aba */
.tab-enter-active,
.tab-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.tab-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.tab-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
