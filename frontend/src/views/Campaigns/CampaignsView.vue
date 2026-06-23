<template>
  <section class="fade-in-up">
    <header class="page-header">
      <div>
        <h1>Campanhas</h1>
        <p>Crie campanhas por nicho e cidade para organizar a prospeccao.</p>
      </div>
      <button class="secondary" @click="load" title="Recarregar dados das campanhas">
        <i class="ri-refresh-line"></i> Atualizar
      </button>
    </header>

    <CampaignForm :form="form" :error="error" :last-result="lastResult" @create="create" />

    <CampaignGrid
      :campaigns="campaigns"
      :columns="campaignColumns"
      :selected-campaigns="selectedCampaigns"
      :discovery-levels="discoveryLevels"
      :discovering-campaign-ids="discoveringCampaignIds"
      @update:selected-campaigns="selectedCampaigns = $event"
      @bulk-start="bulkStart"
      @bulk-pause="bulkPause"
      @bulk-embeddings="bulkEmbeddings"
      @bulk-validate="bulkValidate"
      @bulk-download-csv="bulkDownloadCsv"
      @clear-selection="clearSelection"
      @discover="discover($event, selectedDiscoveryLevel($event))"
      @stop-discovery="stopDiscovery"
      @set-discovery-level="setDiscoveryLevel"
    />

    <DiscoveryMonitor :live-discovery="liveDiscovery" :watching-campaign-id="watchingCampaignId" @refresh="refreshDiscoveryStatus" />
    <CampaignValidationPanel :validation="validation" />
    <CampaignReportPanel :report="report" />
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import CampaignForm from "../../features/campaigns/components/CampaignForm.vue";
import CampaignGrid from "../../features/campaigns/components/CampaignGrid.vue";
import CampaignReportPanel from "../../features/campaigns/components/CampaignReportPanel.vue";
import CampaignValidationPanel from "../../features/campaigns/components/CampaignValidationPanel.vue";
import DiscoveryMonitor from "../../features/campaigns/components/DiscoveryMonitor.vue";
import {
  api,
  type Campaign,
  type CampaignValidationReport,
  type CommercialReport,
  type DiscoverySearchLevel,
  type DiscoveryStatus
} from "../../services/api";
import type { ColumnConfig } from "../../components/GenericGrid.vue";

const discoveryLevels: DiscoverySearchLevel[] = ["nano", "quick", "medium", "deep"];

export default defineComponent({
  name: "CampaignsView",
  components: {
    CampaignForm,
    CampaignGrid,
    CampaignReportPanel,
    CampaignValidationPanel,
    DiscoveryMonitor
  },
  data() {
    return {
      campaignColumns: [
        { key: "name", label: "Nome", sortable: true },
        { key: "niche", label: "Nicho", sortable: true },
        { key: "city", label: "Cidade", sortable: true, sortExpression: (row: Campaign) => `${row.city}/${row.state}` },
        { key: "status", label: "Status", sortable: true },
        { key: "leads", label: "Leads", sortable: true, sortExpression: (row: Campaign) => row.metrics?.leadsFound ?? 0 },
        { key: "actions", label: "Acoes", sortable: false, align: "right" as const, headerAlign: "right" as const }
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
    selectedDiscoveryLevel(id: number): DiscoverySearchLevel {
      return this.discoveryLevels[id] ?? "quick";
    },
    setDiscoveryLevel(id: number, value: string) {
      this.discoveryLevels[id] = discoveryLevels.includes(value as DiscoverySearchLevel) ? (value as DiscoverySearchLevel) : "quick";
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
          ? "Automacao interrompida. O navegador usado pelo scraper foi fechado."
          : "Nenhuma automacao ativa para esta campanha.";
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao interromper automacao";
      } finally {
        this.discoveringCampaignIds = this.discoveringCampaignIds.filter((campaignId) => campaignId !== id);
        await this.refreshDiscoveryStatus(id);
      }
    },
    isDiscovering(id: number) {
      return this.discoveringCampaignIds.includes(id);
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
    getSelectedIds(): number[] {
      return Object.entries(this.selectedCampaigns)
        .filter(([, selected]) => selected)
        .map(([id]) => Number(id));
    },
    clearSelection() {
      this.selectedCampaigns = {};
    },
    async bulkStart() {
      await this.runBulkCampaignAction("start", "Erro ao iniciar campanhas");
    },
    async bulkPause() {
      await this.runBulkCampaignAction("pause", "Erro ao pausar campanhas");
    },
    async runBulkCampaignAction(action: "start" | "pause", fallbackMessage: string) {
      const ids = this.getSelectedIds();
      this.error = "";
      try {
        for (const id of ids) {
          await api.campaignAction(id, action);
        }
        await this.load();
        this.clearSelection();
      } catch (error) {
        this.error = error instanceof Error ? error.message : fallbackMessage;
      }
    },
    async bulkEmbeddings() {
      const ids = this.getSelectedIds();
      this.error = "";
      try {
        let count = 0;
        for (const id of ids) {
          const result = await api.rebuildCampaignEmbeddings(id);
          count += result.created;
        }
        this.lastResult = `Embeddings em lote concluido: ${count} registros gerados no total.`;
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
  }
});
</script>
