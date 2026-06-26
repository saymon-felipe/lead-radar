<template>
  <div class="tab-pane">
    <div class="grid cols-2 lead-presence">
      <div class="panel">
        <h2><i class="ri-global-line"></i> Sinais de Presenca na Web</h2>
        <template v-if="latestWebsite">
          <div class="grid cols-2 lead-presence__cards">
            <div class="lead-presence__card">
              <span class="muted">Informações Gerais</span>
              <p><strong>Status HTTP:</strong> <span class="badge">{{ latestWebsite.httpStatus ?? "-" }}</span></p>
              <p><strong>Segurança SSL:</strong> {{ latestWebsite.hasSsl ? "Sim (Ativo)" : "Não (Inseguro)" }}</p>
              <p><strong>Tempo de Resposta:</strong> {{ latestWebsite.loadTimeMs ?? "-" }} ms</p>
              <p><strong>CMS / Plataforma:</strong> {{ formatPlatformLabel(latestWebsite.platform) }}</p>
            </div>
            <div class="lead-presence__card">
              <span class="muted">Elementos Relevantes</span>
              <p><strong>CTA:</strong> {{ latestWebsite.hasCta ? "Sim" : "Não" }}</p>
              <p><strong>WhatsApp:</strong> {{ latestWebsite.hasWhatsapp ? "Sim" : "Não" }}</p>
              <p><strong>Formulário:</strong> {{ latestWebsite.hasContactForm ? "Sim" : "Não" }}</p>
              <p style="word-break: break-word;"><strong>Titulo:</strong> <span class="text-highlight">{{ latestWebsite.title ?? "-" }}</span></p>
            </div>
          </div>

          <div v-if="latestWebsite.aiReview" class="message-box lead-presence__review-box">
            <div class="lead-presence__review-head">
              <strong>Análise do Site (Qualidade: {{ latestWebsite.aiReview.websiteQualityScore }}/100)</strong>
              <span class="badge warm">{{ formatOfferLabel(latestWebsite.aiReview.commercialOpportunity) }}</span>
            </div>
            <p><strong>Angulo de Vendas:</strong> {{ latestWebsite.aiReview.salesAngle }}</p>
            <p v-if="latestWebsite.aiReview.problems?.length" class="muted"><strong>Problemas:</strong> {{ latestWebsite.aiReview.problems.join(", ") }}</p>
            <p v-if="latestWebsite.aiReview.strengths?.length" class="muted"><strong>Pontos fortes:</strong> {{ latestWebsite.aiReview.strengths.join(", ") }}</p>
          </div>
        </template>
        <p v-else class="muted">Nenhum snapshot de site registrado para este lead.</p>
      </div>

      <div class="panel">
        <h2><i class="ri-instagram-line"></i> Sinais de Redes Sociais</h2>
        <template v-if="latestSocial">
          <div class="grid cols-2 lead-presence__cards">
            <div class="lead-presence__card">
              <span class="muted">Metadados do Perfil</span>
              <p><strong>Rede Social:</strong> {{ formatPlatformLabel(latestSocial.platform) }}</p>
              <p><strong>Perfil:</strong> <a :href="latestSocial.profileUrl" target="_blank">Acessar Canal</a></p>
              <p><strong>WhatsApp Visível:</strong> {{ latestSocial.hasWhatsapp ? "Sim" : "Não" }}</p>
              <p><strong>Website no Perfil:</strong> {{ latestSocial.hasWebsiteLink ? "Sim" : "Não" }}</p>
            </div>
            <div class="lead-presence__card">
              <span class="muted">Apresentação & Biografia</span>
              <p class="text-highlight">{{ latestSocial.bioText ?? "Biografia vazia ou não extraída." }}</p>
            </div>
          </div>

          <div v-if="latestSocial.aiReview" class="message-box lead-presence__review-box">
            <div class="lead-presence__review-head">
              <strong>Análise Social (Pontuação: {{ latestSocial.aiReview.socialPresenceScore }}/100)</strong>
              <span class="badge warm">{{ formatOfferLabel(latestSocial.aiReview.opportunity) }}</span>
            </div>
            <p><strong>Angulo de Vendas:</strong> {{ latestSocial.aiReview.salesAngle }}</p>
            <p v-if="latestSocial.aiReview.problems?.length" class="muted"><strong>Problemas:</strong> {{ latestSocial.aiReview.problems.join(", ") }}</p>
          </div>
        </template>
        <p v-else class="muted">Nenhum snapshot social registrado para este lead.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  formatOfferLabel,
  formatPlatformLabel,
  type SocialSnapshot,
  type WebsiteSnapshot
} from "../../../services/api";

defineProps<{
  latestWebsite?: WebsiteSnapshot;
  latestSocial?: SocialSnapshot;
}>();
</script>

<style scoped>
.lead-presence__review-box {
  max-height: 220px;
  overflow-y: auto;
  padding-right: 8px;
}

/* Custom scrollbar for review boxes */
.lead-presence__review-box::-webkit-scrollbar {
  width: 4px;
}
.lead-presence__review-box::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.01);
}
.lead-presence__review-box::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
.lead-presence__review-box::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.lead-presence__review-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  padding-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
