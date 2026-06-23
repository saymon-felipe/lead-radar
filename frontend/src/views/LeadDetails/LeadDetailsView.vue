<template>
  <section class="fade-in-up">
    <header class="page-header lead-details__header">
      <div>
        <p class="topbar-kicker"><i class="ri-arrow-right-line"></i> Painel de Prospeccao</p>
        <h1>{{ lead?.businessName ?? "Carregando Lead..." }}</h1>
        <p v-if="lead" class="muted">
          <i class="ri-briefcase-line"></i> {{ lead.niche }} em <i class="ri-map-pin-line"></i> {{ lead.city }}/{{ lead.state }}
        </p>
      </div>
      <div class="actions lead-details__actions">
        <button class="secondary" @click="$router.back()"><i class="ri-arrow-left-line"></i> Voltar</button>
        <button class="secondary" @click="scoreLead" title="Recalcular pontuacao comercial"><i class="ri-refresh-line"></i> Recalcular Score</button>
        <button class="secondary" @click="analyzeWebsite" title="Disparar robo de analise de conteudo do site"><i class="ri-global-line"></i> Analisar Site</button>
        <button class="secondary" @click="analyzeSocial" title="Disparar robo de analise de rede social do lead"><i class="ri-instagram-line"></i> Analisar Social</button>
        <button class="secondary" @click="rebuildEmbeddings" title="Recalcular vetores de similaridade IA"><i class="ri-brain-line"></i> Embeddings</button>
        <button @click="reviewLead" title="Gerar parecer tecnico da IA sobre o negocio"><i class="ri-magic-line"></i> Analise IA</button>
        <button @click="generateMessage" title="Gerar mensagens sugestivas personalizadas para abordagem"><i class="ri-message-2-line"></i> Gerar Abordagem</button>
      </div>
    </header>

    <p v-if="error" class="error"><i class="ri-error-warning-line"></i> {{ error }}</p>

    <nav v-if="lead" class="tabs-navigation lead-details__tabs">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === tab.value }"
        :title="tab.title"
        @click="activeTab = tab.value"
      >
        <i :class="tab.icon"></i> {{ tab.label }}
      </button>
    </nav>

    <Transition name="tab" mode="out-in" v-if="lead">
      <LeadOverviewTab
        v-if="activeTab === 'overview'"
        key="overview"
        :lead="lead"
        :interaction="interaction"
        @create-interaction="createInteraction"
      />
      <LeadPresenceTab
        v-else-if="activeTab === 'presence'"
        key="presence"
        :latest-website="latestWebsite"
        :latest-social="latestSocial"
      />
      <LeadSalesTab
        v-else-if="activeTab === 'sales_ia'"
        key="sales_ia"
        :lead="lead"
        :similar="similar"
        :ideal-similarity="idealSimilarity"
        :copied-message-id="copiedMessageId"
        @copy-message="copyMessageText"
      />
      <LeadAiLogsTab v-else key="logs" :reviews="lead.aiReviews" />
    </Transition>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import LeadAiLogsTab from "../../features/lead-details/components/LeadAiLogsTab.vue";
import LeadOverviewTab from "../../features/lead-details/components/LeadOverviewTab.vue";
import LeadPresenceTab from "../../features/lead-details/components/LeadPresenceTab.vue";
import LeadSalesTab from "../../features/lead-details/components/LeadSalesTab.vue";
import { api, type Lead, type SimilarLead } from "../../services/api";

type LeadDetailsTab = "overview" | "presence" | "sales_ia" | "logs";

export default defineComponent({
  name: "LeadDetailsView",
  components: {
    LeadAiLogsTab,
    LeadOverviewTab,
    LeadPresenceTab,
    LeadSalesTab
  },
  props: {
    id: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      tabs: [
        { value: "overview", label: "Visao Geral & CRM", icon: "ri-user-shared-line", title: "Visualizar dados do lead e registrar historico no CRM" },
        { value: "presence", label: "Presenca Digital", icon: "ri-global-line", title: "Visualizar sinais coletados do website e redes sociais" },
        { value: "sales_ia", label: "Abordagem & Similaridade", icon: "ri-message-3-line", title: "Visualizar sugestoes de mensagens de vendas e similaridade IA" },
        { value: "logs", label: "Logs da IA", icon: "ri-code-box-line", title: "Visualizar logs de analise estruturada da IA" }
      ] as Array<{ value: LeadDetailsTab; label: string; icon: string; title: string }>,
      activeTab: "overview" as LeadDetailsTab,
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
      await this.runLeadTask(() => api.analyzeWebsite(this.leadId()), "Falha ao analisar site");
    },
    async analyzeSocial() {
      await this.runLeadTask(() => api.analyzeSocial(this.leadId()), "Falha ao analisar social");
    },
    async rebuildEmbeddings() {
      await this.runLeadTask(() => api.rebuildLeadEmbeddings(this.leadId()), "Falha ao gerar embeddings");
    },
    async reviewLead() {
      await this.runLeadTask(() => api.reviewLead(this.leadId()), "Falha na analise IA");
    },
    async generateMessage() {
      await this.runLeadTask(() => api.generateMessage(this.leadId()), "Falha ao gerar mensagem");
    },
    async runLeadTask(task: () => Promise<unknown>, fallbackMessage: string) {
      try {
        this.error = "";
        await task();
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : fallbackMessage;
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
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: -13px;
  padding: 10px 20px;
  transition: all var(--transition-fast);
}

.tab-btn:hover {
  color: var(--text-highlight);
  background: rgba(255, 255, 255, 0.02);
}

.tab-btn.active {
  color: #38bdf8;
  border-bottom-color: #38bdf8;
  background: rgba(14, 165, 233, 0.05);
}

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
