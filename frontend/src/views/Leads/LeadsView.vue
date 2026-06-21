<template>
  <section>
    <header class="page-header">
      <div>
        <h1>Leads</h1>
        <p>Cadastre, importe, filtre e priorize oportunidades comerciais.</p>
      </div>
      <button class="secondary" @click="load">Atualizar</button>
    </header>

    <form class="panel" @submit.prevent="createLead">
      <h2>Novo lead</h2>
      <div class="grid cols-4">
        <label>
          Campanha
          <select v-model.number="form.campaignId">
            <option :value="undefined">Sem campanha</option>
            <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
              {{ campaign.name }}
            </option>
          </select>
        </label>
        <label>
          Nome
          <input v-model="form.businessName" required />
        </label>
        <label>
          Nicho
          <input v-model="form.niche" required />
        </label>
        <label>
          Cidade
          <input v-model="form.city" required />
        </label>
        <label>
          Estado
          <input v-model="form.state" required />
        </label>
        <label>
          WhatsApp
          <input v-model="form.whatsapp" />
        </label>
        <label>
          Site
          <input v-model="form.websiteUrl" />
        </label>
        <label>
          Instagram
          <input v-model="form.instagramUrl" />
        </label>
      </div>
      <div class="actions" style="margin-top: 14px">
        <button type="submit">Cadastrar lead</button>
      </div>
    </form>

    <form class="panel" @submit.prevent="importCsv">
      <h2>Importar CSV</h2>
      <div class="grid cols-2">
        <label>
          Campanha
          <select v-model.number="importCampaignId">
            <option :value="undefined">Sem campanha</option>
            <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
              {{ campaign.name }}
            </option>
          </select>
        </label>
        <label>
          CSV
          <textarea v-model="csv" placeholder="businessName,niche,city,state,whatsapp"></textarea>
        </label>
      </div>
      <div class="actions" style="margin-top: 14px">
        <button type="submit">Importar</button>
      </div>
    </form>

    <div class="panel">
      <h2>Filtros</h2>
      <div class="toolbar">
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
          <input v-model="filters.city" />
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
          Tem site
          <select v-model="filters.hasWebsite">
            <option value="">Todos</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </label>
        <label>
          Score min.
          <input v-model="filters.minScore" type="number" />
        </label>
        <button type="button" @click="load">Aplicar</button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="panel">
      <h2>Lista</h2>
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Nicho</th>
            <th>Cidade</th>
            <th>Canais</th>
            <th>Score</th>
            <th>Oferta</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="lead in leads" :key="lead.id">
            <td><RouterLink :to="`/leads/${lead.id}`">{{ lead.businessName }}</RouterLink></td>
            <td>{{ lead.niche }}</td>
            <td>{{ lead.city }}/{{ lead.state }}</td>
            <td>
              <span v-if="lead.websiteUrl">site</span>
              <span v-if="lead.instagramUrl"> instagram</span>
              <span v-if="lead.whatsapp"> whatsapp</span>
            </td>
            <td>
              <span v-if="lead.score" class="badge" :class="lead.score.temperature">
                {{ lead.score.finalScore }} {{ formatTemperature(lead.score.temperature) }}
              </span>
            </td>
            <td>{{ formatOffer(lead.score?.recommendedOffer) }}</td>
            <td>{{ formatInteractionStatus(lead.latestInteraction?.status ?? "not_contacted") }}</td>
          </tr>
        </tbody>
      </table>
    </div>
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

export default defineComponent({
  name: "LeadsView",
  data() {
    return {
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
        this.form.businessName = "";
        this.form.whatsapp = "";
        this.form.websiteUrl = "";
        this.form.instagramUrl = "";
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao criar lead";
      }
    },
    async importCsv() {
      try {
        this.error = "";
        await api.importLeads({ campaignId: this.importCampaignId, csv: this.csv });
        this.csv = "";
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
    }
  }
});
</script>
