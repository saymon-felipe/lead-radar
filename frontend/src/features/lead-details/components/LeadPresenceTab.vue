<template>
  <div class="tab-pane">
    <div class="grid cols-2 lead-presence">
      <div class="panel">
        <h2><i class="ri-global-line"></i> Sinais de Presenca na Web</h2>
        <template v-if="latestWebsite">
          <div class="grid cols-2 lead-presence__cards">
            <div class="lead-presence__card">
              <span class="muted">Informacoes Gerais</span>
              <p><strong>Status HTTP:</strong> <span class="badge">{{ latestWebsite.httpStatus ?? "-" }}</span></p>
              <p><strong>Seguranca SSL:</strong> {{ latestWebsite.hasSsl ? "Sim (Ativo)" : "Nao (Inseguro)" }}</p>
              <p><strong>Tempo de Resposta:</strong> {{ latestWebsite.loadTimeMs ?? "-" }} ms</p>
              <p><strong>CMS / Plataforma:</strong> {{ formatPlatformLabel(latestWebsite.platform) }}</p>
            </div>
            <div class="lead-presence__card">
              <span class="muted">Elementos Relevantes</span>
              <p><strong>CTA:</strong> {{ latestWebsite.hasCta ? "Sim" : "Nao" }}</p>
              <p><strong>WhatsApp:</strong> {{ latestWebsite.hasWhatsapp ? "Sim" : "Nao" }}</p>
              <p><strong>Formulario:</strong> {{ latestWebsite.hasContactForm ? "Sim" : "Nao" }}</p>
              <p><strong>Titulo:</strong> <span class="text-highlight">{{ latestWebsite.title ?? "-" }}</span></p>
            </div>
          </div>

          <div v-if="latestWebsite.aiReview" class="message-box">
            <div class="lead-presence__review-head">
              <strong>Analise do Site (Qualidade: {{ latestWebsite.aiReview.websiteQualityScore }}/100)</strong>
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
              <p><strong>WhatsApp Visivel:</strong> {{ latestSocial.hasWhatsapp ? "Sim" : "Nao" }}</p>
              <p><strong>Website no Perfil:</strong> {{ latestSocial.hasWebsiteLink ? "Sim" : "Nao" }}</p>
            </div>
            <div class="lead-presence__card">
              <span class="muted">Apresentacao & Biografia</span>
              <p class="text-highlight">{{ latestSocial.bioText ?? "Biografia vazia ou nao extraida." }}</p>
            </div>
          </div>

          <div v-if="latestSocial.aiReview" class="message-box">
            <div class="lead-presence__review-head">
              <strong>Analise Social (Pontuacao: {{ latestSocial.aiReview.socialPresenceScore }}/100)</strong>
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
