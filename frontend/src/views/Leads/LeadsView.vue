<template>
  <section class="fade-in-up">
    <header class="page-header">
      <div>
        <h1>Leads</h1>
        <p>Cadastre, importe, filtre e priorize oportunidades comerciais.</p>
      </div>
      <div style="display: flex; gap: 12px;">
        <button class="primary" @click="openModal" title="Cadastrar novo lead ou importar lote via CSV">
          <i class="ri-user-add-line"></i> Incluir Novo Lead
        </button>
        <button class="secondary" @click="load" title="Recarregar lista de leads">
          <i class="ri-refresh-line"></i> Atualizar
        </button>
      </div>
    </header>

    <!-- Estrutura Principal Empilhada (Filtros + Lista em largura total) -->
    <div style="display: flex; flex-direction: column; gap: 24px;">
      <!-- Filtros Panel -->
      <div class="panel" style="margin-bottom: 0;">
        <h2>
          <i class="ri-filter-3-line" style="color: var(--primary-hover); margin-right: 6px;"></i> Filtros Rápidos
        </h2>
        <div class="toolbar" style="align-items: flex-end; gap: 14px;">
          <label>
            Campanha
            <select v-model="filters.campaignId">
              <option value="">Todas</option>
              <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
                {{ campaign.name }}
              </option>
            </select>
          </label>
          <label>
            Cidade
            <input v-model="filters.city" placeholder="Ex: Londrina" />
          </label>
          <label>
            Temperatura
            <select v-model="filters.temperature">
              <option value="">Todas</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="medium">Médio</option>
              <option value="cold">Cold</option>
            </select>
          </label>
          <label>
            Possui Site?
            <select v-model="filters.hasWebsite">
              <option value="">Todos</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </label>
          <label style="min-width: 80px;">
            Score Mín.
            <input v-model="filters.minScore" type="number" placeholder="0" />
          </label>
          <button type="button" @click="load" style="min-height: 44px;"><i class="ri-search-line"></i> Filtrar</button>
        </div>
      </div>

      <!-- Feedback de Erro -->
      <p v-if="error" class="error"><i class="ri-error-warning-line"></i> {{ error }}</p>

      <!-- Lista de Leads -->
      <div class="panel" style="margin-bottom: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2><i class="ri-user-shared-line"></i> Leads Qualificados ({{ leads.length }})</h2>
        </div>
        <GenericGrid
          :data="leads"
          :columns="leadColumns"
          row-key="id"
        >
          <template #businessName="{ row }">
            <span class="text-highlight">
              <RouterLink :to="`/leads/${row.id}`" style="color: #38bdf8; font-weight: 700; text-decoration: none;">
                <i class="ri-arrow-right-up-line"></i> {{ row.businessName }}
              </RouterLink>
            </span>
          </template>
          <template #city="{ row }">
            {{ row.city }}/{{ row.state }}
          </template>
          <template #channels="{ row }">
            <div class="channels-list">
              <span class="channel-tag" :class="{ active: row.websiteUrl }" title="Website">
                <i class="ri-global-line"></i>
              </span>
              <span class="channel-tag" :class="{ active: row.instagramUrl }" title="Instagram">
                <i class="ri-instagram-line"></i>
              </span>
              <span class="channel-tag" :class="{ active: row.whatsapp }" title="WhatsApp">
                <i class="ri-whatsapp-line"></i>
              </span>
            </div>
          </template>
          <template #score="{ row }">
            <span v-if="row.score" class="badge" :class="row.score.temperature">
              {{ row.score.finalScore }} · {{ formatTemperature(row.score.temperature) }}
            </span>
            <span v-else class="badge cold">Sem Score</span>
          </template>
          <template #recommendedOffer="{ row }">
            <span class="text-highlight">{{ formatOffer(row.score?.recommendedOffer) }}</span>
          </template>
          <template #status="{ row }">
            <span class="badge" :style="getStatusStyle(row.latestInteraction?.status)">
              {{ formatInteractionStatus(row.latestInteraction?.status ?? "not_contacted") }}
            </span>
          </template>
          <template #empty>
            Nenhum lead encontrado com os filtros atuais.
          </template>
        </GenericGrid>
      </div>
    </div>

    <!-- Modal Overlay com Vue Teleport e Transition -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="isModalOpen" class="modal-backdrop" @click.self="closeModal">
          <div class="modal-content panel" style="margin-bottom: 0; position: relative;">
            <!-- Botão Fechar -->
            <button
              type="button"
              class="secondary"
              style="position: absolute; right: 20px; top: 20px; min-height: auto; padding: 6px; border-radius: 50%;"
              @click="closeModal"
              title="Fechar formulário"
            >
              <i class="ri-close-line" style="font-size: 20px; display: block; width: 20px; height: 20px; line-height: 20px;"></i>
            </button>

            <h2 style="margin-top: 0; margin-bottom: 24px;"><i class="ri-user-add-line"></i> Incluir Leads</h2>

            <div class="auth-tabs mb-3" style="margin-bottom: 20px;">
              <button type="button" :class="{ active: inputMode === 'single' }" @click="inputMode = 'single'">
                <i class="ri-user-add-line"></i> Novo Lead
              </button>
              <button type="button" :class="{ active: inputMode === 'csv' }" @click="inputMode = 'csv'">
                <i class="ri-file-upload-line"></i> Importar CSV
              </button>
            </div>

            <!-- Form 1: Novo Lead -->
            <form v-if="inputMode === 'single'" @submit.prevent="createLead">
              <div class="grid" style="gap: 12px;">
                <label>
                  Campanha
                  <select v-model.number="form.campaignId" style="width: 100%;">
                    <option :value="undefined">Sem campanha</option>
                    <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
                      {{ campaign.name }}
                    </option>
                  </select>
                </label>
                <label>
                  Nome da Empresa
                  <input v-model="form.businessName" required placeholder="Ex: Clínica Radiológica Dental" />
                </label>
                <label>
                  Nicho
                  <input v-model="form.niche" required placeholder="Ex: Dentistas" />
                </label>
                <div class="grid cols-2" style="gap: 10px;">
                  <label>
                    Cidade
                    <input v-model="form.city" required placeholder="Londrina" />
                  </label>
                  <label>
                    Estado
                    <input v-model="form.state" required placeholder="PR" />
                  </label>
                </div>
                <label>
                  WhatsApp
                  <input v-model="form.whatsapp" placeholder="43999999999" />
                </label>
                <label>
                  Website URL
                  <input v-model="form.websiteUrl" placeholder="https://exemplo.com" />
                </label>
                <label>
                  Instagram URL
                  <input v-model="form.instagramUrl" placeholder="https://instagram.com/perfil" />
                </label>
              </div>
              <div class="actions mt-3" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" class="secondary" @click="closeModal">Cancelar</button>
                <button type="submit" class="primary"><i class="ri-check-line"></i> Cadastrar Lead</button>
              </div>
            </form>

            <!-- Form 2: Importar CSV -->
            <form v-else @submit.prevent="importCsv">
              <div class="grid" style="gap: 12px;">
                <label>
                  Vincular à Campanha
                  <select v-model.number="importCampaignId" style="width: 100%;">
                    <option :value="undefined">Sem campanha</option>
                    <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
                      {{ campaign.name }}
                    </option>
                  </select>
                </label>
                <label>
                  Dados do CSV
                  <textarea
                    v-model="csv"
                    required
                    rows="8"
                    placeholder="businessName,niche,city,state,whatsapp,websiteUrl,instagramUrl&#10;Dra Ana Silva,Psicólogos,Londrina,PR,5543999999999,,https://instagram.com/exemplo"
                    style="font-family: var(--font-mono); font-size: 12px;"
                  ></textarea>
                </label>
                <p class="muted" style="font-size: 11px; line-height: 1.5;">
                  Use cabeçalhos em inglês ou português: nome, nicho, cidade, estado, telefone/whatsapp, site, instagram.
                </p>
              </div>
              <div class="actions mt-3" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" class="secondary" @click="closeModal">Cancelar</button>
                <button type="submit" class="primary"><i class="ri-upload-2-line"></i> Importar Lote</button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  api,
  formatInteractionStatusLabel,
  formatOfferLabel,
  formatTemperatureLabel,
  type Campaign,
  type Lead
} from "../../services/api";
import GenericGrid, { type ColumnConfig } from "../../components/GenericGrid.vue";

export default defineComponent({
  name: "LeadsView",
  components: {
    GenericGrid
  },
  data() {
    return {
      isModalOpen: false,
      leadColumns: [
        { key: "businessName", label: "Nome do Lead", sortable: true },
        { key: "niche", label: "Nicho", sortable: true },
        { key: "city", label: "Cidade", sortable: true, sortExpression: (row: any) => `${row.city}/${row.state}` },
        { key: "channels", label: "Canais Ativos", sortable: false },
        { key: "score", label: "Pontuação / Temp.", sortable: true, sortExpression: (row: any) => row.score?.finalScore ?? 0 },
        { key: "recommendedOffer", label: "Oferta Sugerida", sortable: true, sortExpression: (row: any) => row.score?.recommendedOffer ?? "" },
        { key: "status", label: "Status Contato", sortable: true, sortExpression: (row: any) => row.latestInteraction?.status ?? "not_contacted" }
      ] as ColumnConfig[],
      inputMode: "single" as "single" | "csv",
      campaigns: [] as Campaign[],
      leads: [] as Lead[],
      form: {
        campaignId: undefined as number | undefined,
        businessName: "",
        niche: "Psicólogos",
        city: "Londrina",
        state: "PR",
        whatsapp: "",
        websiteUrl: "",
        instagramUrl: ""
      },
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
      this.form = {
        campaignId: undefined,
        businessName: "",
        niche: "Psicólogos",
        city: "Londrina",
        state: "PR",
        whatsapp: "",
        websiteUrl: "",
        instagramUrl: ""
      };
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
    getStatusStyle(status?: string) {
      if (!status || status === "not_contacted") {
        return { background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-color)", color: "var(--text-muted)" };
      }
      if (status === "won") {
        return { background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.25)", color: "#a7f3d0" };
      }
      if (status === "lost" || status === "invalid_contact") {
        return { background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.25)", color: "#fca5a5" };
      }
      return { background: "rgba(59, 130, 246, 0.12)", border: "1px solid rgba(59, 130, 246, 0.25)", color: "#93c5fd" };
    }
  }
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(5, 8, 17, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  padding: 20px;
}

.modal-content {
  width: 580px;
  max-width: 100%;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  border-color: rgba(255, 255, 255, 0.08);
  position: relative;
}

/* Modal Vue Animations */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}

.modal-enter-from .modal-content {
  transform: scale(0.95) translateY(-15px);
  opacity: 0;
}

.modal-leave-to .modal-content {
  transform: scale(0.95) translateY(-15px);
  opacity: 0;
}
</style>
