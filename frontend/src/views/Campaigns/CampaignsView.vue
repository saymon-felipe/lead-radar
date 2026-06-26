<template>
  <section class="fade-in-up">
    <header class="page-header">
      <div>
        <h1>Campanhas</h1>
        <p>Crie campanhas por nicho e cidade para organizar a prospecção.</p>
      </div>
      <div style="display: flex; gap: 1rem; align-items: center;">
        <div 
          v-if="workerStatus !== null"
          :style="{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.75rem',
            borderRadius: '50px',
            fontSize: '0.85rem',
            fontWeight: '500',
            background: workerStatus ? (workerStatus.runStatus === 'running' ? '#fffbeb' : '#f0fdf4') : '#fef2f2',
            color: workerStatus ? (workerStatus.runStatus === 'running' ? '#b45309' : '#15803d') : '#b91c1c',
            border: '1px solid currentColor'
          }"
        >
          <span 
            :style="{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: workerStatus ? (workerStatus.runStatus === 'running' ? '#d97706' : '#16a34a') : '#dc2626',
              display: 'inline-block'
            }"
          ></span>
          Worker: {{ workerStatusText }}
        </div>
        <button class="secondary" @click="load" title="Recarregar dados das campanhas">
          <i class="ri-refresh-line"></i> Atualizar
        </button>
      </div>
    </header>

    <CampaignForm :form="form" :error="error" :last-result="lastResult" @create="create" />

    <Transition name="campaign-modal-fade">
      <div v-if="notice.visible" class="campaign-modal-backdrop" @click.self="closeNotice">
        <section class="campaign-modal-card" :class="`campaign-modal-card--${notice.type}`" role="dialog" aria-modal="true">
          <button class="campaign-modal-close" type="button" title="Fechar" @click="closeNotice">
            <i class="ri-close-line"></i>
          </button>
          <div class="campaign-modal-icon">
            <i :class="noticeIcon"></i>
          </div>
          <div>
            <p class="campaign-modal-eyebrow">{{ noticeEyebrow }}</p>
            <h3>{{ notice.title }}</h3>
            <p>{{ notice.message }}</p>
          </div>
          <div class="campaign-modal-actions">
            <button type="button" @click="closeNotice">Entendi</button>
          </div>
        </section>
      </div>
    </Transition>

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
import { workerClient } from "../../services/workerClient";
import { authSession } from "../../services/session";

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
      discoveryPoller: undefined as number | undefined,
      workerStatus: null as any,
      workerTimer: undefined as number | undefined,
      notice: {
        visible: false,
        type: "info" as "info" | "success" | "warning" | "error",
        title: "",
        message: ""
      }
    };
  },
  computed: {
    workerStatusText(): string {
      if (this.workerStatus === null) return "Buscando...";
      if (this.workerStatus === false) return "Offline";
      return this.workerStatus.runStatus === "running" ? "Buscando..." : "Pronto";
    },
    noticeIcon(): string {
      if (this.notice.type === "success") return "ri-checkbox-circle-line";
      if (this.notice.type === "warning") return "ri-alert-line";
      if (this.notice.type === "error") return "ri-error-warning-line";
      return "ri-information-line";
    },
    noticeEyebrow(): string {
      if (this.notice.type === "success") return "Tudo certo";
      if (this.notice.type === "warning") return "Atenção";
      if (this.notice.type === "error") return "Ação necessária";
      return "Informação";
    }
  },
  mounted() {
    void this.load();
    void this.checkWorker();
    this.workerTimer = window.setInterval(() => {
      void this.checkWorker();
    }, 5000);
  },
  beforeUnmount() {
    this.stopDiscoveryPolling();
    if (this.workerTimer) {
      window.clearInterval(this.workerTimer);
    }
  },
  methods: {
    showNotice(type: "info" | "success" | "warning" | "error", title: string, message: string) {
      this.notice = { visible: true, type, title, message };
    },
    closeNotice() {
      this.notice.visible = false;
    },
    friendlyError(error: unknown, fallback: string) {
      return error instanceof Error ? error.message : fallback;
    },
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
        const savedLevel = campaign.discoveryLevel && discoveryLevels.includes(campaign.discoveryLevel)
          ? campaign.discoveryLevel
          : "quick";
        this.discoveryLevels[campaign.id] = this.discoveryLevels[campaign.id] ?? savedLevel;
      });
    },
    async create() {
      try {
        this.error = "";
        await api.createCampaign(this.form);
        this.form = { name: "", niche: "", city: "", state: "PR" };
        await this.load();
      } catch (error) {
        this.error = this.friendlyError(error, "Falha ao criar campanha");
        this.showNotice("error", "Nao foi possivel criar a campanha", this.error);
      }
    },
    selectedDiscoveryLevel(id: number): DiscoverySearchLevel {
      const campaign = this.campaigns.find((item) => item.id === id);
      return this.discoveryLevels[id] ?? campaign?.discoveryLevel ?? "quick";
    },
    async setDiscoveryLevel(id: number, value: string) {
      const level = discoveryLevels.includes(value as DiscoverySearchLevel) ? (value as DiscoverySearchLevel) : "quick";
      this.discoveryLevels[id] = level;
      try {
        const updated = await api.updateCampaign(id, { discoveryLevel: level });
        const index = this.campaigns.findIndex((campaign) => campaign.id === id);
        if (index >= 0) this.campaigns[index] = { ...this.campaigns[index], ...updated };
      } catch (error) {
        this.error = this.friendlyError(error, "Falha ao salvar nível da campanha");
        this.showNotice("error", "Nível não salvo", this.error);
      }
    },
    async checkWorker() {
      const activeOrgId = authSession.state.user?.organizationId;
      if (activeOrgId) {
        this.workerStatus = await workerClient.syncWorkerSession(activeOrgId);
      } else {
        this.workerStatus = null;
      }
    },
    async discover(id: number, level: DiscoverySearchLevel = "quick") {
      if (this.isDiscovering(id)) return;
      const campaign = this.campaigns.find((item) => item.id === id);
      if (!campaign) {
        this.showNotice("error", "Campanha nao encontrada", "Atualize a tela e tente novamente.");
        return;
      }
      if (campaign.status !== "running") {
        this.showNotice(
          "warning",
          "Campanha fora de andamento",
          "Para iniciar o scraping, primeiro coloque a campanha em andamento usando o botao Iniciar. Nenhum navegador sera aberto ate isso ser feito."
        );
        return;
      }
      this.discoveryLevels[id] = level;
      try {
        this.error = "";
        await this.setDiscoveryLevel(id, level);
        const activeOrgId = authSession.state.user?.organizationId;
        if (activeOrgId) {
          this.workerStatus = await workerClient.syncWorkerSession(activeOrgId);
        }
        if (!this.workerStatus || !this.workerStatus.isLogged || this.workerStatus.authHealthy === false) {
          this.error = "Worker local offline ou nao logado. Abra o aplicativo do worker, faca login e clique em Buscar novamente.";
          this.lastResult = "A campanha ainda nao foi iniciada porque o worker local nao esta pronto.";
          this.showNotice("warning", "Worker local nao esta pronto", this.error);
          return;
        }
        if (this.workerStatus.runStatus === "running") {
          this.error = "O worker local ja esta executando uma campanha. Aguarde finalizar ou interrompa a busca atual.";
          this.showNotice("warning", "Worker ocupado", this.error);
          return;
        }

        this.discoveringCampaignIds.push(id);
        this.startDiscoveryPolling(id);
        const result = await api.discoverCampaign(id, level);
        
        if (result && result.runId && result.commandToken) {
          try {
            const fallbackLimit = level === "nano" ? 5 : level === "medium" ? 30 : level === "deep" ? 60 : 10;
            await workerClient.startLocalRun(result.runId, result.commandToken, level, result.options?.limit || fallbackLimit, result.apiBaseUrl || "");
          } catch (startError) {
            // Avoid leaving a DB-backed run eternally queued as "Aguardando worker iniciar...".
            await api.stopCampaignDiscovery(id).catch(() => undefined);
            throw startError;
          }
          
          // Poll until run completes or is stopped
          await new Promise<void>((resolve) => {
            const checkTimer = window.setInterval(async () => {
              const status = await api.discoveryStatus(id);
              if (!status || !status.running) {
                window.clearInterval(checkTimer);
                resolve();
              }
            }, 1500);
          });
          
          this.lastResult = `Descoberta iniciada via Worker Local.`;
        } else {
          const target = result.meta?.targetFinalLeads ?? (level === "deep" ? 60 : level === "medium" ? 30 : level === "nano" ? 5 : 10);
          this.lastResult = result.cancelled
            ? `Descoberta ${level} interrompida: ${result.inserted}/${target} leads finais inseridos antes da parada.`
            : `Descoberta ${level}: ${result.inserted}/${target} leads finais inseridos de ${result.reviewed} revisados.`;
        }
        await this.load();
      } catch (error) {
        this.error = this.friendlyError(error, "Falha ao executar descoberta");
        this.showNotice("error", "Descoberta nao iniciada", this.error);
      } finally {
        this.discoveringCampaignIds = this.discoveringCampaignIds.filter((campaignId) => campaignId !== id);
        await this.refreshDiscoveryStatus(id);
      }
    },
    async stopDiscovery(id: number) {
      try {
        this.error = "";
        const result = await api.stopCampaignDiscovery(id);
        
        try {
          await workerClient.stopLocalRun(id);
        } catch {
          // ignore local stop failure
        }

        this.lastResult = result.stopped
          ? "Automacao interrompida. O navegador usado pelo scraper foi fechado."
          : "Nenhuma automacao ativa para esta campanha.";
      } catch (error) {
        this.error = this.friendlyError(error, "Falha ao interromper automacao");
        this.showNotice("error", "Nao foi possivel interromper", this.error);
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
        this.error = this.friendlyError(error, fallbackMessage);
        this.showNotice("error", "Acao em lote nao concluida", this.error);
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
        this.error = this.friendlyError(error, "Erro ao recalcular embeddings");
        this.showNotice("error", "Vetores nao recalculados", this.error);
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
        this.error = this.friendlyError(error, "Erro ao exportar CSVs");
        this.showNotice("error", "CSV nao exportado", this.error);
      }
    }
  }
});
</script>


<style scoped>
.campaign-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(10, 12, 24, 0.46);
  backdrop-filter: blur(10px);
}

.campaign-modal-card {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  width: min(520px, 100%);
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
  animation: campaign-modal-pop 220ms ease-out;
}

.campaign-modal-card h3 {
  margin: 0 2rem 0.35rem 0;
  color: #0f172a;
}

.campaign-modal-card p {
  margin: 0;
  color: #475569;
  line-height: 1.55;
}

.campaign-modal-eyebrow {
  margin-bottom: 0.25rem !important;
  color: #64748b !important;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.campaign-modal-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 16px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 1.45rem;
}

.campaign-modal-card--success .campaign-modal-icon { background: #ecfdf5; color: #059669; }
.campaign-modal-card--warning .campaign-modal-icon { background: #fffbeb; color: #d97706; }
.campaign-modal-card--error .campaign-modal-icon { background: #fef2f2; color: #dc2626; }

.campaign-modal-close {
  position: absolute;
  top: 0.8rem;
  right: 0.8rem;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  padding: 0;
  background: rgba(15, 23, 42, 0.05);
  color: #475569;
}

.campaign-modal-actions {
  grid-column: 2;
  margin-top: 0.95rem;
}

.campaign-modal-actions button {
  min-width: 110px;
}

.campaign-modal-fade-enter-active,
.campaign-modal-fade-leave-active {
  transition: opacity 180ms ease;
}

.campaign-modal-fade-enter-from,
.campaign-modal-fade-leave-to {
  opacity: 0;
}

@keyframes campaign-modal-pop {
  from { transform: translateY(12px) scale(0.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

@media (max-width: 560px) {
  .campaign-modal-card {
    grid-template-columns: 1fr;
  }

  .campaign-modal-actions {
    grid-column: 1;
  }
}
</style>
