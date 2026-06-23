<template>
  <section class="fade-in-up">
    <header class="page-header">
      <div>
        <h1>Leads</h1>
        <p>Cadastre, importe, filtre e priorize oportunidades comerciais.</p>
      </div>
      <div class="lead-actions">
        <button class="primary" @click="openModal" title="Cadastrar novo lead ou importar lote via CSV">
          <i class="ri-user-add-line"></i> Incluir Novo Lead
        </button>
        <button class="secondary" @click="load" title="Recarregar lista de leads">
          <i class="ri-refresh-line"></i> Atualizar
        </button>
      </div>
    </header>

    <div class="lead-stack">
      <LeadFilters :campaigns="campaigns" :filters="filters" @load="load" />
      <p v-if="error" class="error"><i class="ri-error-warning-line"></i> {{ error }}</p>
      <LeadGrid :leads="leads" :columns="leadColumns" />
    </div>

    <LeadEntryModal
      :open="isModalOpen"
      v-model:input-mode="inputMode"
      v-model:csv="csv"
      v-model:import-campaign-id="importCampaignId"
      :campaigns="campaigns"
      :form="form"
      @close="closeModal"
      @create="createLead"
      @import="importCsv"
    />
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { api, type Campaign, type Lead } from "../../services/api";
import type { ColumnConfig } from "../../components/GenericGrid.vue";
import LeadEntryModal from "../../features/leads/components/LeadEntryModal.vue";
import LeadFilters from "../../features/leads/components/LeadFilters.vue";
import LeadGrid from "../../features/leads/components/LeadGrid.vue";

function defaultLeadForm() {
  return {
    campaignId: undefined as number | undefined,
    businessName: "",
    niche: "Psicólogos",
    city: "Londrina",
    state: "PR",
    whatsapp: "",
    websiteUrl: "",
    instagramUrl: ""
  };
}

export default defineComponent({
  name: "LeadsView",
  components: {
    LeadEntryModal,
    LeadFilters,
    LeadGrid
  },
  data() {
    return {
      isModalOpen: false,
      leadColumns: [
        { key: "businessName", label: "Nome do Lead", sortable: true },
        { key: "niche", label: "Nicho", sortable: true },
        { key: "city", label: "Cidade", sortable: true, sortExpression: (row: Lead) => `${row.city}/${row.state}` },
        { key: "channels", label: "Canais Ativos", sortable: false },
        { key: "score", label: "Pontuação / Temp.", sortable: true, sortExpression: (row: Lead) => row.score?.finalScore ?? 0 },
        { key: "recommendedOffer", label: "Oferta Sugerida", sortable: true, sortExpression: (row: Lead) => row.score?.recommendedOffer ?? "" },
        { key: "status", label: "Status Contato", sortable: true, sortExpression: (row: Lead) => row.latestInteraction?.status ?? "not_contacted" }
      ] as ColumnConfig[],
      inputMode: "single" as "single" | "csv",
      campaigns: [] as Campaign[],
      leads: [] as Lead[],
      form: defaultLeadForm(),
      csv: "",
      importCampaignId: undefined as number | undefined,
      filters: {
        campaignId: "",
        city: "",
        temperature: "",
        hasWebsite: "",
        minScore: ""
      },
      error: ""
    };
  },
  mounted() {
    const campaignId = this.$route.query.campaignId;
    if (typeof campaignId === "string") this.filters.campaignId = campaignId;
    void this.loadAll();
  },
  methods: {
    openModal() {
      this.isModalOpen = true;
    },
    closeModal() {
      this.isModalOpen = false;
      this.form = defaultLeadForm();
      this.csv = "";
      this.importCampaignId = undefined;
    },
    async loadAll() {
      this.campaigns = await api.campaigns();
      await this.load();
    },
    async load() {
      const params = new URLSearchParams();
      Object.entries(this.filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      this.leads = await api.leads(params);
    },
    async createLead() {
      try {
        this.error = "";
        await api.createLead(this.form);
        this.closeModal();
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao criar lead";
      }
    },
    async importCsv() {
      try {
        this.error = "";
        await api.importLeads({ campaignId: this.importCampaignId, csv: this.csv });
        this.closeModal();
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao importar CSV";
      }
    }
  }
});
</script>

<style scoped>
.lead-actions {
  display: flex;
  gap: 12px;
}

.lead-stack {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
