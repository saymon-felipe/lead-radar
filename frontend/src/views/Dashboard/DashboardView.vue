<template>
  <section>
    <header class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p>Resumo operacional das campanhas e contatos comerciais.</p>
      </div>
      <button class="secondary" @click="load">Atualizar</button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="grid cols-4">
      <div class="metric">
        <span>Campanhas</span>
        <strong>{{ metrics.totalCampaigns }}</strong>
      </div>
      <div class="metric">
        <span>Ativas</span>
        <strong>{{ metrics.activeCampaigns }}</strong>
      </div>
      <div class="metric">
        <span>Leads</span>
        <strong>{{ metrics.totalLeads }}</strong>
      </div>
      <div class="metric">
        <span>Hot</span>
        <strong>{{ metrics.hotLeads }}</strong>
      </div>
      <div class="metric">
        <span>Warm</span>
        <strong>{{ metrics.warmLeads }}</strong>
      </div>
      <div class="metric">
        <span>Contatados</span>
        <strong>{{ metrics.contactedLeads }}</strong>
      </div>
      <div class="metric">
        <span>Responderam</span>
        <strong>{{ metrics.repliedLeads }}</strong>
      </div>
      <div class="metric">
        <span>Vendas</span>
        <strong>{{ metrics.wonDeals }}</strong>
      </div>
      <div class="metric">
        <span>Receita potencial</span>
        <strong>R$ {{ metrics.potentialRevenue }}</strong>
      </div>
      <div class="metric">
        <span>Taxa de resposta</span>
        <strong>{{ metrics.responseRate }}%</strong>
      </div>
      <div class="metric">
        <span>Conversão</span>
        <strong>{{ metrics.conversionRate }}%</strong>
      </div>
      <div class="metric">
        <span>Melhor nicho</span>
        <strong>{{ metrics.bestNiche ?? "-" }}</strong>
      </div>
      <div class="metric">
        <span>Melhor cidade</span>
        <strong>{{ metrics.bestCity ?? "-" }}</strong>
      </div>
      <div class="metric">
        <span>Faixa de score</span>
        <strong>{{ metrics.bestScoreBand ?? "-" }}</strong>
      </div>
      <div class="metric">
        <span>Oferta</span>
        <strong>{{ formatOffer(metrics.bestOffer) }}</strong>
      </div>
    </div>

    <div class="grid cols-2" style="margin-top: 18px">
      <div class="panel">
        <h2>Conversão por temperatura</h2>
        <table>
          <thead>
            <tr>
              <th>Temperatura</th>
              <th>Leads</th>
              <th>Contato</th>
              <th>Resp.</th>
              <th>Conv.</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in metrics.byTemperature" :key="row.key">
              <td>{{ formatTemperature(row.key) }}</td>
              <td>{{ row.leads }}</td>
              <td>{{ row.contacted }}</td>
              <td>{{ row.responseRate }}%</td>
              <td>{{ row.conversionRate }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel">
        <h2>Ranking de ofertas</h2>
        <table>
          <thead>
            <tr>
              <th>Oferta</th>
              <th>Leads</th>
              <th>Vendas</th>
              <th>Receita</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in metrics.byOffer" :key="row.key">
              <td>{{ formatOffer(row.key) }}</td>
              <td>{{ row.leads }}</td>
              <td>{{ row.won }}</td>
              <td>R$ {{ row.estimatedRevenue }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid cols-2" style="margin-top: 18px">
      <div class="panel">
        <h2>Sugestões</h2>
        <p v-for="suggestion in metrics.nextCampaignSuggestions" :key="suggestion">{{ suggestion }}</p>
        <p v-if="!metrics.nextCampaignSuggestions?.length" class="muted">Sem sugestões ainda.</p>
      </div>

      <div class="panel">
        <h2>Calibração de score</h2>
        <button @click="calibrate">Gerar sugestão</button>
        <div v-if="calibration" class="message-box" style="margin-top: 12px">
          <p><strong>{{ calibration.version }}</strong></p>
          <p>{{ calibration.rationale.join(" ") }}</p>
          <pre>{{ JSON.stringify(calibration.weights, null, 2) }}</pre>
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

export default defineComponent({
  name: "DashboardView",
  data() {
    return {
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
