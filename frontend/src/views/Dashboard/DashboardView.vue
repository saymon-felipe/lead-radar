<template>
  <section class="fade-in-up">
    <header class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p>Resumo operacional das campanhas e contatos comerciais.</p>
      </div>
      <button class="secondary" @click="load">
        <i class="ri-refresh-line"></i> Atualizar
      </button>
    </header>

    <p v-if="error" class="error"><i class="ri-error-warning-line"></i> {{ error }}</p>

    <!-- KPIs Principais -->
    <div class="grid cols-4 mb-2" style="margin-bottom: 20px;">
      <div class="metric" style="position: relative;">
        <div>
          <span>Total de Leads</span>
          <strong>{{ metrics.totalLeads }}</strong>
        </div>
        <i class="ri-team-line" style="position: absolute; right: 20px; bottom: 20px; font-size: 28px; color: rgba(14, 165, 233, 0.15);"></i>
      </div>
      <div class="metric" style="position: relative;">
        <div>
          <span>Vendas Concluídas</span>
          <strong style="color: var(--accent-green)">{{ metrics.wonDeals }}</strong>
        </div>
        <i class="ri-hand-coin-line" style="position: absolute; right: 20px; bottom: 20px; font-size: 28px; color: rgba(16, 185, 129, 0.15);"></i>
      </div>
      <div class="metric" style="position: relative;">
        <div>
          <span>Receita Potencial</span>
          <strong style="color: #38bdf8">R$ {{ metrics.potentialRevenue }}</strong>
        </div>
        <i class="ri-money-dollar-circle-line" style="position: absolute; right: 20px; bottom: 20px; font-size: 28px; color: rgba(56, 189, 248, 0.15);"></i>
      </div>
      <div class="metric">
        <div>
          <span>Taxa de Conversão</span>
          <strong>{{ metrics.conversionRate }}%</strong>
        </div>
        <div class="score-bar-wrapper" style="margin-top: 12px; height: 8px;">
          <div class="score-bar-fill" :style="{ width: metrics.conversionRate + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- Sub-métricas Organizacionais -->
    <div class="grid cols-4" style="margin-bottom: 24px;">
      <div class="metric">
        <span>Campanhas (Total / Ativas)</span>
        <strong style="font-size: 20px; margin-top: 8px;">{{ metrics.totalCampaigns }} <span style="color: var(--text-muted); font-size: 14px;">/</span> {{ metrics.activeCampaigns }}</strong>
      </div>
      <div class="metric">
        <span>Leads Hot / Warm</span>
        <strong style="font-size: 20px; margin-top: 8px;">
          <span style="color: var(--accent-hot)">🔥 {{ metrics.hotLeads }}</span>
          <span style="color: var(--text-muted); font-size: 14px; margin: 0 6px;">/</span>
          <span style="color: var(--accent-warm)">⚡ {{ metrics.warmLeads }}</span>
        </strong>
      </div>
      <div class="metric">
        <span>Contatados / Responderam</span>
        <strong style="font-size: 20px; margin-top: 8px;">{{ metrics.contactedLeads }} <span style="color: var(--text-muted); font-size: 14px;">/</span> {{ metrics.repliedLeads }}</strong>
      </div>
      <div class="metric">
        <div>
          <span>Taxa de Resposta</span>
          <strong>{{ metrics.responseRate }}%</strong>
        </div>
        <div class="score-bar-wrapper" style="margin-top: 12px; height: 8px;">
          <div class="score-bar-fill" :style="{ width: metrics.responseRate + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- Segmentação & Performance -->
    <div class="panel" style="margin-bottom: 24px;">
      <h2 style="margin-bottom: 16px;"><i class="ri-trophy-line"></i> Melhores Desempenhos & Oferta Ideal</h2>
      <div class="grid cols-4">
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-md);">
          <span style="color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase;">Melhor Nicho</span>
          <p style="color: var(--text-highlight); font-weight: 700; font-size: 16px; margin-top: 6px;"><i class="ri-briefcase-line" style="color: var(--primary-hover); margin-right: 6px;"></i>{{ metrics.bestNiche ?? "-" }}</p>
        </div>
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-md);">
          <span style="color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase;">Melhor Cidade</span>
          <p style="color: var(--text-highlight); font-weight: 700; font-size: 16px; margin-top: 6px;"><i class="ri-map-pin-2-line" style="color: var(--primary-hover); margin-right: 6px;"></i>{{ metrics.bestCity ?? "-" }}</p>
        </div>
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-md);">
          <span style="color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase;">Melhor Faixa de Score</span>
          <p style="color: var(--text-highlight); font-weight: 700; font-size: 16px; margin-top: 6px;"><i class="ri-line-chart-line" style="color: var(--primary-hover); margin-right: 6px;"></i>{{ metrics.bestScoreBand ?? "-" }}</p>
        </div>
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-md);">
          <span style="color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase;">Melhor Oferta</span>
          <p style="color: var(--text-highlight); font-weight: 700; font-size: 16px; margin-top: 6px;"><i class="ri-advertisement-line" style="color: var(--primary-hover); margin-right: 6px;"></i>{{ formatOffer(metrics.bestOffer) }}</p>
        </div>
      </div>
    </div>

    <div class="grid cols-2" style="margin-bottom: 24px;">
      <!-- Conversão por Temperatura -->
      <div class="panel" style="margin-bottom: 0;">
        <h2><i class="ri-temp-hot-line"></i> Conversão por Temperatura</h2>
        <GenericGrid
          :data="metrics.byTemperature"
          :columns="tempColumns"
          row-key="key"
        >
          <template #key="{ row }">
            <span class="badge" :class="row.key">
              {{ formatTemperature(row.key) }}
            </span>
          </template>
          <template #leads="{ row }">
            <strong>{{ row.leads }}</strong>
          </template>
          <template #responseRate="{ row }">
            <div class="flex-row-center">
              <span style="min-width: 40px;">{{ row.responseRate }}%</span>
              <div class="score-bar-wrapper" style="width: 60px; height: 6px;">
                <div class="score-bar-fill" :style="{ width: row.responseRate + '%' }"></div>
              </div>
            </div>
          </template>
          <template #conversionRate="{ row }">
            <div class="flex-row-center">
              <span class="text-highlight" style="min-width: 40px;">{{ row.conversionRate }}%</span>
              <div class="score-bar-wrapper" style="width: 60px; height: 6px;">
                <div class="score-bar-fill" :style="{ width: row.conversionRate + '%' }"></div>
              </div>
            </div>
          </template>
        </GenericGrid>
      </div>

      <!-- Ranking de Ofertas -->
      <div class="panel" style="margin-bottom: 0;">
        <h2><i class="ri-award-line"></i> Ranking de Ofertas</h2>
        <GenericGrid
          :data="metrics.byOffer"
          :columns="offerColumns"
          row-key="key"
        >
          <template #key="{ row }">
            <span class="text-highlight"><i class="ri-arrow-right-s-line" style="color: var(--primary-hover); margin-right: 4px;"></i>{{ formatOffer(row.key) }}</span>
          </template>
          <template #won="{ row }">
            <span class="badge" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.15); color: #a7f3d0; padding: 4px 8px;">{{ row.won }}</span>
          </template>
          <template #estimatedRevenue="{ row }">
            <span class="text-highlight" style="color: var(--accent-green)">R$ {{ row.estimatedRevenue }}</span>
          </template>
        </GenericGrid>
      </div>
    </div>

    <div class="grid cols-2">
      <!-- Sugestões da IA -->
      <div class="panel" style="margin-bottom: 0;">
        <h2><i class="ri-lightbulb-line"></i> Sugestões e Frentes de Atuação</h2>
        <div v-for="suggestion in metrics.nextCampaignSuggestions" :key="suggestion" class="message-box" style="margin-bottom: 12px; border-left: 3px solid var(--primary-hover); background: rgba(14, 165, 233, 0.02); padding: 14px;">
          <p style="font-size: 14px; line-height: 1.5; margin: 0;"><i class="ri-magic-line" style="color: var(--primary-hover); margin-right: 8px;"></i>{{ suggestion }}</p>
        </div>
        <p v-if="!metrics.nextCampaignSuggestions?.length" class="muted"><i class="ri-information-line"></i> Sem sugestões adicionais no momento.</p>
      </div>

      <!-- Calibração de Score -->
      <div class="panel" style="margin-bottom: 0;">
        <h2><i class="ri-sound-module-line"></i> Calibração de Score Inteligente</h2>
        <p class="muted" style="font-size: 13px; margin-bottom: 14px;">Gere automaticamente pesos e recomendações de scoring com base no funil comercial.</p>
        <button @click="calibrate"><i class="ri-cpu-line"></i> Calcular Sugestão</button>
        <div v-if="calibration" class="message-box" style="margin-top: 16px; border-left: 3px solid var(--accent-green); background: rgba(16, 185, 129, 0.02);">
          <p style="font-weight: 700; color: var(--text-highlight); margin-bottom: 6px;"><i class="ri-git-branch-line" style="margin-right: 6px; color: var(--accent-green)"></i>{{ calibration.version }}</p>
          <p style="font-size: 13px; line-height: 1.6; margin-bottom: 12px;">{{ calibration.rationale.join(" ") }}</p>
          <pre style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); color: #a7f3d0; font-family: var(--font-mono); font-size: 12px; max-height: 150px; overflow-y: auto;">{{ JSON.stringify(calibration.weights, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  api,
  formatOfferLabel,
  formatTemperatureLabel,
  type DashboardMetrics,
  type ScoreWeightVersion
} from "../../services/api";
import GenericGrid, { type ColumnConfig } from "../../components/GenericGrid.vue";

export default defineComponent({
  name: "DashboardView",
  components: {
    GenericGrid
  },
  data() {
    return {
      tempColumns: [
        { key: "key", label: "Temperatura", sortable: true },
        { key: "leads", label: "Leads", sortable: true },
        { key: "contacted", label: "Contato", sortable: true },
        { key: "responseRate", label: "Taxa Resposta", sortable: true },
        { key: "conversionRate", label: "Conversão", sortable: true }
      ] as ColumnConfig[],
      offerColumns: [
        { key: "key", label: "Oferta", sortable: true },
        { key: "leads", label: "Leads", sortable: true },
        { key: "won", label: "Vendas", sortable: true },
        { key: "estimatedRevenue", label: "Receita Estimada", sortable: true }
      ] as ColumnConfig[],
      metrics: {
        totalCampaigns: 0,
        activeCampaigns: 0,
        totalLeads: 0,
        hotLeads: 0,
        warmLeads: 0,
        contactedLeads: 0,
        repliedLeads: 0,
        wonDeals: 0,
        potentialRevenue: 0,
        responseRate: 0,
        conversionRate: 0,
        byTemperature: [],
        byOffer: [],
        nextCampaignSuggestions: [],
        lossReasons: []
      } as DashboardMetrics,
      calibration: undefined as ScoreWeightVersion | undefined,
      error: ""
    };
  },
  mounted() {
    void this.load();
  },
  methods: {
    async load() {
      try {
        this.error = "";
        this.metrics = await api.dashboard();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao carregar dashboard";
      }
    },
    async calibrate() {
      this.calibration = await api.scoreCalibration();
    },
    formatTemperature(value?: string) {
      return formatTemperatureLabel(value);
    },
    formatOffer(value?: string) {
      return formatOfferLabel(value);
    }
  }
});
</script>

