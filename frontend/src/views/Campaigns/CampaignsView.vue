<template>
  <section>
    <header class="page-header">
      <div>
        <h1>Campanhas</h1>
        <p>Crie campanhas por nicho e cidade para organizar a prospecção.</p>
      </div>
      <button class="secondary" @click="load">Atualizar</button>
    </header>

    <form class="panel" @submit.prevent="create">
      <h2>Nova campanha</h2>
      <div class="grid cols-4">
        <label>
          Nome
          <input v-model="form.name" required placeholder="Psicólogos Londrina" />
        </label>
        <label>
          Nicho
          <input v-model="form.niche" required placeholder="Psicólogos" />
        </label>
        <label>
          Cidade
          <input v-model="form.city" required placeholder="Londrina" />
        </label>
        <label>
          Estado
          <input v-model="form.state" required placeholder="PR" />
        </label>
      </div>
      <div class="actions" style="margin-top: 14px">
        <button type="submit">Criar campanha</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="lastResult" class="muted">{{ lastResult }}</p>
    </form>

    <div class="panel">
      <h2>Lista</h2>
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Nicho</th>
            <th>Cidade</th>
            <th>Status</th>
            <th>Leads</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="campaign in campaigns" :key="campaign.id">
            <td>{{ campaign.name }}</td>
            <td>{{ campaign.niche }}</td>
            <td>{{ campaign.city }}/{{ campaign.state }}</td>
            <td>{{ formatCampaignStatus(campaign.status) }}</td>
            <td>
              {{ campaign.metrics?.leadsFound ?? 0 }}
              <span class="muted">{{ formatTemperature("hot") }} {{ campaign.metrics?.hotLeads ?? 0 }} / {{ formatTemperature("warm") }} {{ campaign.metrics?.warmLeads ?? 0 }}</span>
            </td>
            <td>
              <div class="actions">
                <RouterLink :to="`/leads?campaignId=${campaign.id}`">Ver leads</RouterLink>
                <button class="secondary" @click="action(campaign.id, 'start')">Iniciar</button>
                <button class="secondary" @click="action(campaign.id, 'pause')">Pausar</button>
                <button class="secondary" :disabled="isDiscovering(campaign.id)" @click="discover(campaign.id)">
                  {{ isDiscovering(campaign.id) ? "Descobrindo..." : "Descobrir" }}
                </button>
                <button
                  class="danger"
                  :disabled="!isDiscovering(campaign.id)"
                  @click="stopDiscovery(campaign.id)"
                >
                  Interromper
                </button>
                <button class="secondary" @click="embeddings(campaign.id)">Embeddings</button>
                <button class="secondary" @click="validateCampaign(campaign.id)">Validar</button>
                <button class="secondary" @click="downloadCsv(campaign.id)">CSV</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="liveDiscovery" class="panel">
      <div class="page-header" style="margin-bottom: 18px">
        <div>
          <h2>Monitor da automação</h2>
          <p>
            {{ liveDiscovery.running ? "Execução em andamento" : "Última execução concluída" }}
            <span v-if="liveDiscovery.currentProfessional"> · {{ liveDiscovery.currentProfessional }}</span>
          </p>
        </div>
        <button
          v-if="watchingCampaignId"
          class="secondary"
          @click="refreshDiscoveryStatus(watchingCampaignId)"
        >
          Atualizar painel
        </button>
      </div>

      <div class="grid cols-4">
        <div class="metric">
          <span>Etapa atual</span>
          <strong>{{ liveDiscovery.currentStep ?? "-" }}</strong>
        </div>
        <div class="metric">
          <span>Resultados iniciais</span>
          <strong>{{ liveDiscovery.stats.collected }}</strong>
        </div>
        <div class="metric">
          <span>Profissionais extraídos</span>
          <strong>{{ liveDiscovery.stats.extractedProfessionals }}</strong>
        </div>
        <div class="metric">
          <span>Leads inseridos</span>
          <strong>{{ liveDiscovery.stats.inserted }}</strong>
        </div>
      </div>

      <div class="grid cols-2" style="margin-top: 18px">
        <div class="panel" style="margin: 0; max-height: 520px; overflow: auto">
          <h3>Log em tempo real</h3>
          <div
            v-for="event in [...liveDiscovery.events].reverse()"
            :key="event.id"
            style="padding: 12px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.18)"
          >
            <p style="margin: 0 0 6px">
              <strong>{{ event.title }}</strong>
              <span class="muted"> · {{ formatEventTime(event.at) }}</span>
            </p>
            <p v-if="event.leadName" class="muted" style="margin: 0 0 6px">{{ event.leadName }}</p>
            <p v-if="event.detail" style="margin: 0 0 6px">{{ event.detail }}</p>
            <p v-if="event.url" class="muted" style="margin: 0 0 6px; word-break: break-all">{{ event.url }}</p>
            <details v-if="event.payload">
              <summary>Enviado para IA / contexto</summary>
              <pre>{{ stringifyJson(event.payload) }}</pre>
            </details>
            <details v-if="event.response">
              <summary>Resposta / achados</summary>
              <pre>{{ stringifyJson(event.response) }}</pre>
            </details>
          </div>
        </div>

        <div class="panel" style="margin: 0; max-height: 520px; overflow: auto">
          <h3>Resumo operacional</h3>
          <p><strong>Campanha:</strong> {{ watchingCampaignId }}</p>
          <p><strong>Última atualização:</strong> {{ formatEventTime(liveDiscovery.updatedAt) }}</p>
          <p><strong>Profissional em foco:</strong> {{ liveDiscovery.currentProfessional ?? "-" }}</p>
          <p><strong>Revisados:</strong> {{ liveDiscovery.stats.reviewed }}</p>
          <p><strong>Eventos capturados:</strong> {{ liveDiscovery.events.length }}</p>
          <p class="muted">
            O painel mostra resultados do buscador, payloads enviados para IA, respostas retornadas e catalogação final.
          </p>
        </div>
      </div>
    </div>

    <div v-if="validation" class="panel">
      <h2>Validação comercial</h2>
      <div class="grid cols-4">
        <div class="metric">
          <span>Leads</span>
          <strong>{{ validation.collectedLeads }}</strong>
        </div>
        <div class="metric">
          <span>Hot/Warm</span>
          <strong>{{ validation.reviewedHotWarm }}</strong>
        </div>
        <div class="metric">
          <span>Contatos</span>
          <strong>{{ validation.manualContacts }}</strong>
        </div>
        <div class="metric">
          <span>Vendas</span>
          <strong>{{ validation.wonDeals }}</strong>
        </div>
      </div>
      <p><strong>Decisão:</strong> {{ formatDecision(validation.recommendedDecision) }}</p>
      <p>{{ validation.interpretation }}</p>
      <table>
        <tbody>
          <tr v-for="item in validation.checklist" :key="item.label">
            <td>{{ item.label }}</td>
            <td>{{ item.current }} / {{ item.target }}</td>
            <td>{{ item.done ? "ok" : "pendente" }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="report" class="panel">
      <h2>Relatório da campanha</h2>
      <div class="grid cols-3">
        <div>
          <h3>Nicho</h3>
          <p v-for="row in report.byNiche" :key="row.key">{{ row.key }} - {{ row.conversionRate }}%</p>
        </div>
        <div>
          <h3>Cidade</h3>
          <p v-for="row in report.byCity" :key="row.key">{{ row.key }} - {{ row.responseRate }}%</p>
        </div>
        <div>
          <h3>Oferta</h3>
          <p v-for="row in report.byOffer" :key="row.key">{{ formatOffer(row.key) }} - {{ row.won }} vendas</p>
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
  type DiscoveryStatus
} from "../../services/api";

export default defineComponent({
  name: "CampaignsView",
  data() {
    return {
      campaigns: [] as Campaign[],
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
    async discover(id: number) {
      if (this.isDiscovering(id)) return;
      this.discoveringCampaignIds.push(id);
      this.startDiscoveryPolling(id);
      try {
        this.error = "";
        const result = await api.discoverCampaign(id);
        this.lastResult = result.cancelled
          ? `Descoberta interrompida: ${result.inserted} leads inseridos antes da parada.`
          : `Descoberta: ${result.inserted} leads inseridos de ${result.reviewed} revisados.`;
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
    }
  }
});
</script>
