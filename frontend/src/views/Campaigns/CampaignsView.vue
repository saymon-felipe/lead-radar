<template>
  <section class="fade-in-up">
    <header class="page-header">
      <div>
        <h1>Campanhas</h1>
        <p>Crie campanhas por nicho e cidade para organizar a prospecção.</p>
      </div>
      <button class="secondary" @click="load" title="Recarregar dados das campanhas">
        <i class="ri-refresh-line"></i> Atualizar
      </button>
    </header>

    <!-- Nova Campanha (Horizontal, no topo) -->
    <form class="panel" style="margin-bottom: 24px;" @submit.prevent="create">
      <h2><i class="ri-add-circle-line"></i> Nova Campanha</h2>
      <div class="grid cols-4" style="gap: 16px;">
        <label>
          Nome da Campanha
          <input v-model="form.name" required placeholder="Psicólogos Londrina" />
        </label>
        <label>
          Nicho de Atuação
          <input v-model="form.niche" required placeholder="Psicólogos" />
        </label>
        <label>
          Cidade
          <input v-model="form.city" required placeholder="Londrina" />
        </label>
        <label>
          Estado (UF)
          <input v-model="form.state" required placeholder="PR" />
        </label>
      </div>
      <div class="actions" style="margin-top: 16px;">
        <button type="submit" title="Salvar e criar nova campanha no sistema"><i class="ri-save-line"></i> Criar Campanha</button>
      </div>
      <p v-if="error" class="error mt-2"><i class="ri-error-warning-line"></i> {{ error }}</p>
      <p v-if="lastResult" class="muted mt-2" style="font-size: 13px;"><i class="ri-checkbox-circle-line" style="color: var(--accent-green)"></i> {{ lastResult }}</p>
    </form>

    <!-- Lista de Campanhas (Abaixo da criação) -->
    <div class="panel" style="margin-bottom: 24px; position: relative;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <h2><i class="ri-list-check-2"></i> Campanhas Ativas</h2>
        
        <!-- Meta Ads Style Contextual Toolbar -->
        <div v-if="hasSelection" class="fade-in" style="display: flex; align-items: center; gap: 12px; background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(14, 165, 233, 0.2); padding: 6px 16px; border-radius: var(--radius-md);">
          <span style="font-size: 13px; font-weight: 700; color: #38bdf8; display: inline-flex; align-items: center; gap: 4px;">
            <i class="ri-checkbox-line"></i> {{ selectedCount }} selecionada(s)
          </span>
          <div style="height: 18px; width: 1px; background: rgba(255, 255, 255, 0.15);"></div>
          
          <button type="button" class="secondary" style="min-height: 28px; padding: 0 10px; border-radius: 6px; font-size: 12px; gap: 4px;" @click="bulkStart" title="Iniciar campanhas selecionadas">
            <i class="ri-play-fill" style="color: var(--accent-green)"></i> Iniciar
          </button>
          <button type="button" class="secondary" style="min-height: 28px; padding: 0 10px; border-radius: 6px; font-size: 12px; gap: 4px;" @click="bulkPause" title="Pausar campanhas selecionadas">
            <i class="ri-pause-fill" style="color: var(--accent-warm)"></i> Pausar
          </button>
          <button type="button" class="secondary" style="min-height: 28px; padding: 0 10px; border-radius: 6px; font-size: 12px; gap: 4px;" @click="bulkEmbeddings" title="Recalcular embeddings das campanhas selecionadas">
            <i class="ri-brain-line"></i> Vetores
          </button>
          <button type="button" class="secondary" style="min-height: 28px; padding: 0 10px; border-radius: 6px; font-size: 12px; gap: 4px;" :disabled="selectedCount !== 1" @click="bulkValidate" title="Validar metas comerciais da campanha selecionada">
            <i class="ri-checkbox-circle-line"></i> Validar
          </button>
          <button type="button" class="secondary" style="min-height: 28px; padding: 0 10px; border-radius: 6px; font-size: 12px; gap: 4px;" @click="bulkDownloadCsv" title="Exportar base de leads das campanhas selecionadas em CSV">
            <i class="ri-download-2-line"></i> CSV
          </button>
          
          <button type="button" class="secondary" style="min-height: 28px; padding: 0 6px; border-radius: 6px; font-size: 12px; border-color: transparent; background: transparent;" @click="clearSelection" title="Limpar seleção de campanhas">
            <i class="ri-close-line"></i>
          </button>
        </div>
      </div>

      <div class="table-responsive">
        <GenericGrid
          :data="campaigns"
          :columns="campaignColumns"
          :selectable="true"
          v-model:selectedMap="selectedCampaigns"
          row-key="id"
        >
          <template #name="{ row }">
            <span class="text-highlight"><strong>{{ row.name }}</strong></span>
          </template>
          <template #city="{ row }">
            {{ row.city }}/{{ row.state }}
          </template>
          <template #status="{ row }">
            <span class="badge" :class="row.status === 'running' ? 'hot' : row.status === 'completed' ? 'medium' : 'cold'">
              {{ formatCampaignStatus(row.status) }}
            </span>
          </template>
          <template #leads="{ row }">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <strong>{{ row.metrics?.leadsFound ?? 0 }}</strong>
              <span style="font-size: 11px;" class="muted">
                🔥{{ row.metrics?.hotLeads ?? 0 }} / ⚡{{ row.metrics?.warmLeads ?? 0 }}
              </span>
            </div>
          </template>
          <template #actions="{ row }">
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
              <RouterLink :to="`/leads?campaignId=${row.id}`" class="channel-tag active" title="Visualizar lista completa de leads desta campanha" style="text-decoration: none; padding: 6px 12px; display: inline-flex; align-items: center; min-height: auto; margin: 0;">
                <i class="ri-eye-line" style="margin-right: 4px;"></i> Ver Leads
              </RouterLink>

              <select
                v-model="discoveryLevels[row.id]"
                :disabled="isDiscovering(row.id)"
                title="Nível da busca"
                style="min-height: 32px; width: 105px; padding: 2px 6px; border-radius: 8px; font-size: 12px; margin: 0;"
              >
                <option value="nano">Nano (5 leads)</option>
                <option value="quick">Quick (10 leads)</option>
                <option value="medium">Medium (30 leads)</option>
                <option value="deep">Deep (60 leads)</option>
              </select>

              <button type="button" :disabled="isDiscovering(row.id)" style="min-height: 32px; padding: 0 12px; border-radius: 8px; font-size: 12px;" @click="discover(row.id, selectedDiscoveryLevel(row.id))" title="Disparar busca automática por novos leads nesta campanha">
                <i class="ri-radar-line"></i> Buscar
              </button>
              <button
                type="button"
                class="danger"
                :disabled="!isDiscovering(row.id)"
                style="min-height: 32px; padding: 0 12px; border-radius: 8px; font-size: 12px;"
                @click="stopDiscovery(row.id)"
                title="Interromper busca automática em andamento"
              >
                <i class="ri-stop-circle-line"></i> Parar
              </button>
            </div>
          </template>
        </GenericGrid>
      </div>
    </div>

    <!-- Monitor da Automação (Real-Time Scraper Monitor) -->
    <div v-if="liveDiscovery" class="panel fade-in" style="margin-bottom: 24px;">
      <div class="page-header" style="margin-bottom: 16px;">
        <div>
          <h2><i class="ri-terminal-box-line"></i> Monitor da Automação em Tempo Real</h2>
          <p>
            {{ liveDiscovery.running ? "Executando varredura" : "Última execução finalizada" }}
            <span v-if="liveDiscovery.currentProfessional" style="color: var(--primary-hover);"> · Foco: {{ liveDiscovery.currentProfessional }}</span>
          </p>
        </div>
        <button
          v-if="watchingCampaignId"
          class="secondary"
          @click="refreshDiscoveryStatus(watchingCampaignId)"
          title="Forçar a atualização instantânea do monitor de status e logs"
        >
          <i class="ri-refresh-line"></i> Atualizar Monitor
        </button>
      </div>

      <div class="grid cols-4" style="margin-bottom: 20px;">
        <div class="metric">
          <span>Etapa Atual</span>
          <strong style="font-size: 15px; color: var(--primary-hover); margin-top: 8px;">{{ liveDiscovery.currentStep ?? "-" }}</strong>
        </div>
        <div class="metric">
          <span>Coletados (Scraper)</span>
          <strong>{{ liveDiscovery.stats.collected }}</strong>
        </div>
        <div class="metric">
          <span>Extraídos (Filtro)</span>
          <strong>{{ liveDiscovery.stats.extractedProfessionals }}</strong>
        </div>
        <div class="metric">
          <span>Leads Inseridos</span>
          <strong style="color: var(--accent-green)">{{ liveDiscovery.stats.inserted }}</strong>
        </div>
      </div>

      <div class="grid cols-2">
        <!-- Log Monospace Terminal -->
        <div>
          <h3 class="mb-2" style="font-size: 13px; text-transform: uppercase; color: var(--text-muted);"><i class="ri-computer-line"></i> Linha de Eventos</h3>
          <div class="terminal-console">
            <div class="terminal-header">
              <span>radar-console-logs v1.0.0</span>
              <div class="terminal-indicator">
                <span class="terminal-dot" :class="{ pulsing: liveDiscovery.running }"></span>
                <span>{{ liveDiscovery.running ? 'ONLINE' : 'OFFLINE' }}</span>
              </div>
            </div>
            
            <div
              v-for="event in [...liveDiscovery.events].reverse()"
              :key="event.id"
              class="terminal-log-item"
            >
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #60a5fa;">[{{ formatEventTime(event.at) }}]</span>
                <span style="font-weight: 700; color: #34d399;">{{ event.title }}</span>
              </div>
              <p v-if="event.leadName" style="color: var(--accent-warm); margin: 2px 0 0 10px; font-size: 12px;">↳ Lead: {{ event.leadName }}</p>
              <p v-if="event.detail" style="color: #e2e8f0; margin: 4px 0 0 10px; font-size: 12px;">{{ event.detail }}</p>
              <p v-if="event.url" style="color: #94a3b8; margin: 2px 0 0 10px; font-size: 11px; word-break: break-all;">🔗 {{ event.url }}</p>
              
              <details v-if="event.payload" style="margin-left: 10px;">
                <summary>Visualizar Payload de Entrada</summary>
                <pre>{{ stringifyJson(event.payload) }}</pre>
              </details>
              <details v-if="event.response" style="margin-left: 10px;">
                <summary>Visualizar Resposta da IA</summary>
                <pre>{{ stringifyJson(event.response) }}</pre>
              </details>
            </div>
            <div v-if="!liveDiscovery.events?.length" style="color: var(--text-muted); padding: 20px 0; text-align: center;">Nenhum evento registrado ainda.</div>
          </div>
        </div>

        <!-- Resumo Técnico -->
        <div class="panel" style="margin-bottom: 0; background: rgba(15, 23, 42, 0.4);">
          <h3 class="mb-2"><i class="ri-file-info-line"></i> Metadados Operacionais</h3>
          <div style="display: grid; gap: 12px; font-size: 14px;">
            <p><strong>Campanha Monitorada:</strong> #{{ watchingCampaignId }}</p>
            <p><strong>Nível de Busca Solicitado:</strong> <span class="badge" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color)">{{ liveDiscovery.searchLevel ?? "-" }}</span></p>
            <p><strong>Meta de Leads Finais:</strong> {{ liveDiscovery.targetFinalLeads ?? "-" }} leads</p>
            <p><strong>Última Sincronização:</strong> {{ formatEventTime(liveDiscovery.updatedAt) }}</p>
            <p><strong>Leads Revisados na Rodada:</strong> {{ liveDiscovery.stats.reviewed }}</p>
            <p><strong>Total de Eventos no Monitor:</strong> {{ liveDiscovery.events.length }}</p>
            <p class="muted" style="font-size: 13px; line-height: 1.5; border-top: 1px solid var(--border-color); padding-top: 10px;">
              Este monitor acompanha o robô de descoberta. Os dados coletados de fontes públicas passam por um crivo analítico da IA antes de serem convertidos em oportunidades.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Validação Comercial (Checklist) -->
    <div v-if="validation" class="panel fade-in" style="margin-bottom: 24px;">
      <h2><i class="ri-checkbox-multiple-line"></i> Validação Comercial da Campanha</h2>
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px; align-items: start;">
        
        <div>
          <div class="grid cols-4" style="margin-bottom: 20px;">
            <div class="metric">
              <span>Leads Totais</span>
              <strong>{{ validation.collectedLeads }}</strong>
            </div>
            <div class="metric">
              <span>Qualificados (Hot/Warm)</span>
              <strong>{{ validation.reviewedHotWarm }}</strong>
            </div>
            <div class="metric">
              <span>Contatos Executados</span>
              <strong>{{ validation.manualContacts }}</strong>
            </div>
            <div class="metric">
              <span>Vendas (Won)</span>
              <strong style="color: var(--accent-green)">{{ validation.wonDeals }}</strong>
            </div>
          </div>

          <h3 class="mb-1">Metas e Critérios Operacionais</h3>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Meta / Critério</th>
                  <th>Progresso Realizado</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in validation.checklist" :key="item.label">
                  <td class="text-highlight">{{ item.label }}</td>
                  <td>
                    <div class="flex-row-center">
                      <strong style="min-width: 50px;">{{ item.current }} / {{ item.target }}</strong>
                      <div class="score-bar-wrapper" style="width: 100px; height: 8px;">
                        <div class="score-bar-fill" :style="{ width: Math.min((item.current / item.target) * 100, 100) + '%' }"></div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span v-if="item.done" class="badge" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #a7f3d0;">
                      <i class="ri-checkbox-circle-fill"></i> Ok
                    </span>
                    <span v-else class="badge" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); color: #fef08a;">
                      <i class="ri-time-line"></i> Pendente
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px;">
          <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Decisão Recomendada</span>
          <div class="mt-1 mb-2">
            <span class="badge hot" style="font-size: 13px; font-weight: 800;">
              <i class="ri-guide-line"></i> {{ formatDecision(validation.recommendedDecision) }}
            </span>
          </div>
          <h3 class="mt-2">Parecer Técnico da IA</h3>
          <p style="font-size: 13px; line-height: 1.6; color: var(--text-main);" class="mt-1">{{ validation.interpretation }}</p>
        </div>

      </div>
    </div>

    <!-- Relatório Analítico da Campanha -->
    <div v-if="report" class="panel fade-in" style="margin-bottom: 0;">
      <h2><i class="ri-bar-chart-2-line"></i> Relatório Analítico de Desempenho</h2>
      <div class="grid cols-3">
        <!-- Nicho -->
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius-md);">
          <h3 style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px; font-size: 13px; text-transform: uppercase; color: var(--text-muted);"><i class="ri-briefcase-line" style="margin-right: 6px;"></i> Por Nicho</h3>
          <div v-for="row in report.byNiche" :key="row.key" style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
            <span>{{ row.key }}</span>
            <strong class="text-highlight">{{ row.conversionRate }}% conv.</strong>
          </div>
        </div>
        
        <!-- Cidade -->
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius-md);">
          <h3 style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px; font-size: 13px; text-transform: uppercase; color: var(--text-muted);"><i class="ri-map-pin-line" style="margin-right: 6px;"></i> Por Cidade</h3>
          <div v-for="row in report.byCity" :key="row.key" style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
            <span>{{ row.key }}</span>
            <strong class="text-highlight">{{ row.responseRate }}% resp.</strong>
          </div>
        </div>
        
        <!-- Oferta -->
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius-md);">
          <h3 style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px; font-size: 13px; text-transform: uppercase; color: var(--text-muted);"><i class="ri-shake-hands-line" style="margin-right: 6px;"></i> Por Oferta</h3>
          <div v-for="row in report.byOffer" :key="row.key" style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
            <span>{{ formatOffer(row.key) }}</span>
            <strong style="color: var(--accent-green)">{{ row.won }} vendas</strong>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  api,
  formatCampaignStatusLabel,
  formatDecisionLabel,
  formatOfferLabel,
  formatTemperatureLabel,
  type Campaign,
  type CampaignValidationReport,
  type CommercialReport,
  type DiscoverySearchLevel,
  type DiscoveryStatus
} from "../../services/api";
import GenericGrid, { type ColumnConfig } from "../../components/GenericGrid.vue";

export default defineComponent({
  name: "CampaignsView",
  components: {
    GenericGrid
  },
  data() {
    return {
      campaignColumns: [
        { key: "name", label: "Nome", sortable: true },
        { key: "niche", label: "Nicho", sortable: true },
        { key: "city", label: "Cidade", sortable: true, sortExpression: (row: any) => `${row.city}/${row.state}` },
        { key: "status", label: "Status", sortable: true },
        { key: "leads", label: "Leads", sortable: true, sortExpression: (row: any) => row.metrics?.leadsFound ?? 0 },
        { key: "actions", label: "Ações", sortable: false, align: "right" as const, headerAlign: "right" as const }
      ] as ColumnConfig[],
      campaigns: [] as Campaign[],
      selectedCampaigns: {} as Record<number, boolean>,
      form: {
        name: "",
        niche: "",
        city: "",
        state: "PR"
      },
      error: "",
      lastResult: "",
      validation: undefined as CampaignValidationReport | undefined,
      report: undefined as CommercialReport | undefined,
      discoveringCampaignIds: [] as number[],
      discoveryLevels: {} as Record<number, DiscoverySearchLevel>,
      watchingCampaignId: undefined as number | undefined,
      liveDiscovery: undefined as DiscoveryStatus | undefined,
      discoveryPoller: undefined as number | undefined
    };
  },
  mounted() {
    void this.load();
  },
  beforeUnmount() {
    this.stopDiscoveryPolling();
  },
  methods: {
    startDiscoveryPolling(campaignId: number) {
      this.watchingCampaignId = campaignId;
      this.stopDiscoveryPolling();
      void this.refreshDiscoveryStatus(campaignId);
      this.discoveryPoller = window.setInterval(() => {
        void this.refreshDiscoveryStatus(campaignId);
      }, 1500);
    },
    stopDiscoveryPolling() {
      if (this.discoveryPoller) {
        window.clearInterval(this.discoveryPoller);
        this.discoveryPoller = undefined;
      }
    },
    async refreshDiscoveryStatus(campaignId: number) {
      const status = await api.discoveryStatus(campaignId);
      this.liveDiscovery = status ?? undefined;
      if (status && !status.running && !this.isDiscovering(campaignId)) {
        this.stopDiscoveryPolling();
      }
    },
    async load() {
      this.campaigns = await api.campaigns();
      this.campaigns.forEach((campaign) => {
        if (!this.discoveryLevels[campaign.id]) {
          this.discoveryLevels[campaign.id] = "quick";
        }
      });
    },
    async create() {
      try {
        this.error = "";
        await api.createCampaign(this.form);
        this.form = { name: "", niche: "", city: "", state: "PR" };
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao criar campanha";
      }
    },
    async action(id: number, action: "start" | "pause" | "complete") {
      await api.campaignAction(id, action);
      await this.load();
    },
    selectedDiscoveryLevel(id: number): DiscoverySearchLevel {
      return this.discoveryLevels[id] ?? "quick";
    },
    async discover(id: number, level: DiscoverySearchLevel = "quick") {
      if (this.isDiscovering(id)) return;
      this.discoveryLevels[id] = level;
      this.discoveringCampaignIds.push(id);
      this.startDiscoveryPolling(id);
      try {
        this.error = "";
        const result = await api.discoverCampaign(id, level);
        const target = result.meta?.targetFinalLeads ?? (level === "deep" ? 60 : level === "medium" ? 30 : level === "nano" ? 5 : 10);
        this.lastResult = result.cancelled
          ? `Descoberta ${level} interrompida: ${result.inserted}/${target} leads finais inseridos antes da parada.`
          : `Descoberta ${level}: ${result.inserted}/${target} leads finais inseridos de ${result.reviewed} revisados.`;
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao executar descoberta";
      } finally {
        this.discoveringCampaignIds = this.discoveringCampaignIds.filter((campaignId) => campaignId !== id);
        await this.refreshDiscoveryStatus(id);
      }
    },
    async stopDiscovery(id: number) {
      try {
        this.error = "";
        const result = await api.stopCampaignDiscovery(id);
        this.lastResult = result.stopped
          ? "Automação interrompida. O navegador usado pelo scraper foi fechado."
          : "Nenhuma automação ativa para esta campanha.";
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao interromper automação";
      } finally {
        this.discoveringCampaignIds = this.discoveringCampaignIds.filter((campaignId) => campaignId !== id);
        await this.refreshDiscoveryStatus(id);
      }
    },
    isDiscovering(id: number) {
      return this.discoveringCampaignIds.includes(id);
    },
    async embeddings(id: number) {
      const result = await api.rebuildCampaignEmbeddings(id);
      this.lastResult = `Embeddings: ${result.created} registros gerados.`;
    },
    async validateCampaign(id: number) {
      this.validation = await api.campaignValidation(id);
      this.report = await api.campaignReport(id);
    },
    async downloadCsv(id: number) {
      const csv = await api.exportCampaignCsv(id);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `campaign-${id}-leads.csv`;
      link.click();
      URL.revokeObjectURL(url);
    },
    formatCampaignStatus(value?: string) {
      return formatCampaignStatusLabel(value);
    },
    formatDecision(value?: string) {
      return formatDecisionLabel(value);
    },
    formatOffer(value?: string) {
      return formatOfferLabel(value);
    },
    formatTemperature(value?: string) {
      return formatTemperatureLabel(value);
    },
    formatEventTime(value?: string) {
      if (!value) return "-";
      return new Date(value).toLocaleTimeString("pt-BR");
    },
    stringifyJson(value: unknown) {
      return JSON.stringify(value, null, 2);
    },
    
    // Métodos de seleção em lote (Meta Ads Style)
    getSelectedIds(): number[] {
      return Object.entries(this.selectedCampaigns)
        .filter(([_, selected]) => selected)
        .map(([id]) => Number(id));
    },
    clearSelection() {
      this.selectedCampaigns = {};
    },
    toggleSelectAll(event: Event) {
      const checked = (event.target as HTMLInputElement).checked;
      this.campaigns.forEach((campaign) => {
        this.selectedCampaigns[campaign.id] = checked;
      });
    },
    async bulkStart() {
      const ids = this.getSelectedIds();
      this.error = "";
      try {
        for (const id of ids) {
          await api.campaignAction(id, "start");
        }
        await this.load();
        this.clearSelection();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Erro ao iniciar campanhas";
      }
    },
    async bulkPause() {
      const ids = this.getSelectedIds();
      this.error = "";
      try {
        for (const id of ids) {
          await api.campaignAction(id, "pause");
        }
        await this.load();
        this.clearSelection();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Erro ao pausar campanhas";
      }
    },
    async bulkEmbeddings() {
      const ids = this.getSelectedIds();
      this.error = "";
      try {
        let count = 0;
        for (const id of ids) {
          const res = await api.rebuildCampaignEmbeddings(id);
          count += res.created;
        }
        this.lastResult = `Embeddings em lote concluído: ${count} registros gerados no total.`;
        this.clearSelection();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Erro ao recalcular embeddings";
      }
    },
    async bulkValidate() {
      const ids = this.getSelectedIds();
      if (ids.length === 1) {
        await this.validateCampaign(ids[0]);
        this.clearSelection();
      }
    },
    async bulkDownloadCsv() {
      const ids = this.getSelectedIds();
      this.error = "";
      try {
        for (const id of ids) {
          await this.downloadCsv(id);
        }
        this.clearSelection();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Erro ao exportar CSVs";
      }
    }
  },
  computed: {
    allSelected(): boolean {
      if (!this.campaigns.length) return false;
      return this.campaigns.every((c) => this.selectedCampaigns[c.id]);
    },
    hasSelection(): boolean {
      return this.campaigns.some((c) => this.selectedCampaigns[c.id]);
    },
    selectedCount(): number {
      return this.campaigns.filter((c) => this.selectedCampaigns[c.id]).length;
    }
  }
});
</script>
