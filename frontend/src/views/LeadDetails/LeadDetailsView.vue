<template>
  <section>
    <header class="page-header">
      <div>
        <h1>{{ lead?.businessName ?? "Lead" }}</h1>
        <p v-if="lead">{{ lead.niche }} em {{ lead.city }}/{{ lead.state }}</p>
      </div>
      <div class="actions">
        <button class="secondary" @click="$router.back()">Voltar</button>
        <button @click="scoreLead">Recalcular score</button>
        <button @click="analyzeWebsite">Analisar site</button>
        <button @click="analyzeSocial">Analisar social</button>
        <button @click="rebuildEmbeddings">Embeddings</button>
        <button @click="reviewLead">Análise IA</button>
        <button @click="generateMessage">Gerar mensagem</button>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="lead" class="grid cols-2">
      <div class="panel">
        <h2>Dados básicos</h2>
        <p><strong>Nome:</strong> {{ lead.businessName }}</p>
        <p><strong>Profissional:</strong> {{ lead.personName ?? "-" }}</p>
        <p><strong>WhatsApp:</strong> {{ lead.whatsapp ?? "-" }}</p>
        <p><strong>Email:</strong> {{ lead.email ?? "-" }}</p>
        <p><strong>Site:</strong> <a v-if="lead.websiteUrl" :href="lead.websiteUrl" target="_blank">{{ lead.websiteUrl }}</a><span v-else>-</span></p>
        <p><strong>Instagram:</strong> <a v-if="lead.instagramUrl" :href="lead.instagramUrl" target="_blank">{{ lead.instagramUrl }}</a><span v-else>-</span></p>
      </div>

      <div class="panel">
        <h2>Score</h2>
        <template v-if="lead.score">
          <p>
            <span class="badge" :class="lead.score.temperature">
              {{ lead.score.finalScore }} {{ formatTemperature(lead.score.temperature) }}
            </span>
          </p>
          <p><strong>Oferta:</strong> {{ formatOffer(lead.score.recommendedOffer) }}</p>
          <p><strong>Presença digital:</strong> {{ lead.score.digitalPresenceScore ?? "-" }}</p>
          <table>
            <tbody>
              <tr v-for="item in lead.score.scoreBreakdownJson" :key="item.key">
                <td>{{ item.label }}</td>
                <td>{{ item.applied ? `+${item.points}` : "-" }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>
    </div>

    <div v-if="lead" class="grid cols-2">
      <div class="panel">
        <h2>Snapshot do site</h2>
        <template v-if="latestWebsite">
          <p><strong>Status:</strong> {{ latestWebsite.httpStatus ?? "-" }}</p>
          <p><strong>SSL:</strong> {{ latestWebsite.hasSsl ? "sim" : "não" }}</p>
          <p><strong>Tempo:</strong> {{ latestWebsite.loadTimeMs ?? "-" }} ms</p>
          <p><strong>Título:</strong> {{ latestWebsite.title ?? "-" }}</p>
          <p><strong>Plataforma:</strong> {{ formatPlatform(latestWebsite.platform) }}</p>
          <p><strong>CTA:</strong> {{ latestWebsite.hasCta ? "sim" : "não" }}</p>
          <p><strong>WhatsApp:</strong> {{ latestWebsite.hasWhatsapp ? "sim" : "não" }}</p>
          <div v-if="latestWebsite.aiReview" class="message-box">
            <strong>Score {{ latestWebsite.aiReview.websiteQualityScore }} - {{ formatOffer(latestWebsite.aiReview.commercialOpportunity) }}</strong>
            <p>{{ latestWebsite.aiReview.salesAngle }}</p>
            <p class="muted">{{ latestWebsite.aiReview.problems.join(", ") }}</p>
          </div>
        </template>
        <p v-else class="muted">Nenhum snapshot de site registrado.</p>
      </div>

      <div class="panel">
        <h2>Snapshot social</h2>
        <template v-if="latestSocial">
          <p><strong>Plataforma:</strong> {{ formatPlatform(latestSocial.platform) }}</p>
          <p><strong>Perfil:</strong> <a :href="latestSocial.profileUrl" target="_blank">{{ latestSocial.profileUrl }}</a></p>
          <p><strong>WhatsApp:</strong> {{ latestSocial.hasWhatsapp ? "sim" : "não" }}</p>
          <p><strong>Link externo:</strong> {{ latestSocial.externalLink ?? "-" }}</p>
          <p><strong>Bio:</strong> {{ latestSocial.bioText ?? "-" }}</p>
          <div v-if="latestSocial.aiReview" class="message-box">
            <strong>Score {{ latestSocial.aiReview.socialPresenceScore }} - {{ formatOffer(latestSocial.aiReview.opportunity) }}</strong>
            <p>{{ latestSocial.aiReview.salesAngle }}</p>
            <p class="muted">{{ latestSocial.aiReview.problems.join(", ") }}</p>
          </div>
        </template>
        <p v-else class="muted">Nenhum snapshot social registrado.</p>
      </div>
    </div>

    <div v-if="lead" class="grid cols-2">
      <div class="panel">
        <h2>Embeddings</h2>
        <p><strong>Registros:</strong> {{ lead.embeddings?.length ?? 0 }}</p>
        <p><strong>Similaridade ideal:</strong> {{ idealSimilarity }}</p>
        <div v-if="lead.embeddings?.length" class="message-box">
          <p v-for="embedding in lead.embeddings" :key="embedding.id">
            {{ formatEmbeddingType(embedding.embeddingType) }} - {{ embedding.model }}
          </p>
        </div>
      </div>

      <div class="panel">
        <h2>Leads similares</h2>
        <div v-if="similar.length">
          <p v-for="item in similar" :key="item.embeddingId">
            <RouterLink v-if="item.lead" :to="`/leads/${item.lead.id}`">{{ item.lead.businessName }}</RouterLink>
            <span v-else>{{ formatEmbeddingType(item.embeddingType) }}</span>
            <span class="muted"> {{ Math.round(item.similarity * 100) }}%</span>
          </p>
        </div>
        <p v-else class="muted">Nenhum similar calculado.</p>
      </div>
    </div>

    <div v-if="lead" class="grid cols-2">
      <form class="panel" @submit.prevent="createInteraction">
        <h2>Registrar contato</h2>
        <div class="grid cols-2">
          <label>
            Status
            <select v-model="interaction.status">
              <option value="contacted">Contatado</option>
              <option value="replied">Respondeu</option>
              <option value="interested">Interessado</option>
              <option value="meeting_scheduled">Reunião agendada</option>
              <option value="proposal_sent">Proposta enviada</option>
              <option value="won">Ganho</option>
              <option value="lost">Perdido</option>
              <option value="no_response">Sem resposta</option>
              <option value="invalid_contact">Contato inválido</option>
            </select>
          </label>
          <label>
            Canal
            <input v-model="interaction.contactChannel" placeholder="whatsapp" />
          </label>
        </div>
        <label>
          Notas
          <textarea v-model="interaction.notes"></textarea>
        </label>
        <div class="actions" style="margin-top: 14px">
          <button type="submit">Salvar interação</button>
        </div>
      </form>

      <div class="panel">
        <h2>Mensagens sugeridas</h2>
        <div v-if="lead.messages?.length">
          <div v-for="message in lead.messages" :key="message.id" class="message-box" style="margin-bottom: 10px">
            {{ message.content }}
          </div>
        </div>
        <p v-else class="muted">Nenhuma mensagem gerada ainda.</p>
      </div>
    </div>

    <div v-if="lead" class="grid cols-2">
      <div class="panel">
        <h2>Análises IA</h2>
        <div v-if="lead.aiReviews?.length">
          <div v-for="review in lead.aiReviews" :key="review.id" class="message-box" style="margin-bottom: 10px">
            <strong>{{ formatAnalysisType(review.analysisType) }}</strong>
            <pre>{{ JSON.stringify(review.outputJson, null, 2) }}</pre>
          </div>
        </div>
        <p v-else class="muted">Nenhuma análise registrada.</p>
      </div>

      <div class="panel">
        <h2>Histórico comercial</h2>
        <table>
          <tbody>
            <tr v-for="item in lead.interactions" :key="item.id">
              <td>{{ formatInteractionStatus(item.status) }}</td>
              <td>{{ item.contactChannel }}</td>
              <td>{{ item.notes }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  api,
  formatAnalysisTypeLabel,
  formatEmbeddingTypeLabel,
  formatInteractionStatusLabel,
  formatOfferLabel,
  formatPlatformLabel,
  formatTemperatureLabel,
  type Lead
} from "../../services/api";
import type { SimilarLead } from "../../services/api";

export default defineComponent({
  name: "LeadDetailsView",
  props: {
    id: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      lead: undefined as Lead | undefined,
      interaction: {
        status: "contacted",
        contactChannel: "whatsapp",
        notes: ""
      },
      similar: [] as SimilarLead[],
      error: ""
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
      try {
        this.error = "";
        await api.analyzeWebsite(this.leadId());
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao analisar site";
      }
    },
    async analyzeSocial() {
      try {
        this.error = "";
        await api.analyzeSocial(this.leadId());
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao analisar social";
      }
    },
    async rebuildEmbeddings() {
      try {
        this.error = "";
        await api.rebuildLeadEmbeddings(this.leadId());
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao gerar embeddings";
      }
    },
    async reviewLead() {
      try {
        this.error = "";
        await api.reviewLead(this.leadId());
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha na análise IA";
      }
    },
    async generateMessage() {
      try {
        this.error = "";
        await api.generateMessage(this.leadId());
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao gerar mensagem";
      }
    },
    async createInteraction() {
      await api.createInteraction(this.leadId(), this.interaction);
      this.interaction.notes = "";
      await this.load();
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
    formatAnalysisType(value?: string) {
      return formatAnalysisTypeLabel(value);
    },
    formatEmbeddingType(value?: string) {
      return formatEmbeddingTypeLabel(value);
    },
    formatPlatform(value?: string) {
      return formatPlatformLabel(value);
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
