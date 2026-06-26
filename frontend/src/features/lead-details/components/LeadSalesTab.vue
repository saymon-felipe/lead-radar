<template>
  <div class="tab-pane">
    <div class="grid cols-2 lead-sales">
      <div class="panel">
        <h2><i class="ri-message-3-line"></i> Abordagens de Venda Sugeridas</h2>
        <div v-if="lead.messages?.length" class="lead-sales__messages-container">
          <div v-for="message in lead.messages" :key="message.id" class="message-box lead-sales__message">
            <p class="muted"><strong>Canal:</strong> {{ message.channel }} | <strong>Tom:</strong> {{ message.tone }}</p>
            <p>{{ message.content }}</p>
            <button
              type="button"
              class="message-box-copy"
              :title="copiedMessageId === message.id ? 'Copiado!' : 'Copiar Abordagem'"
              @click="$emit('copyMessage', message.content, message.id)"
            >
              <i v-if="copiedMessageId === message.id" class="ri-check-line"></i>
              <i v-else class="ri-file-copy-2-line"></i>
            </button>
          </div>
        </div>
        <p v-else class="muted">Nenhuma abordagem sugerida. Clique em "Gerar Abordagem" na barra superior.</p>
      </div>

      <div class="panel lead-sales__similarity">
        <h2><i class="ri-compasses-line"></i> Matriz de Similaridade IA</h2>
        <div class="grid cols-2 lead-sales__stats">
          <div>
            <span class="muted">Compatibilidade Perfil Ideal</span>
            <strong>{{ idealSimilarity }}</strong>
          </div>
          <div>
            <span class="muted">Vetores Cadastrados</span>
            <strong>{{ lead.embeddings?.length ?? 0 }} registros</strong>
          </div>
        </div>

        <div class="lead-sales__list">
          <h3 class="mb-2"><i class="ri-team-line"></i> Leads com Padrao Semantico Similar</h3>
          <div v-if="similar.length" class="lead-sales__similar-container">
            <div class="lead-sales__similar-items">
              <div v-for="item in similar" :key="item.embeddingId" class="lead-sales__similar-item">
                <RouterLink v-if="item.lead" :to="`/leads/${item.lead.id}`">{{ item.lead.businessName }}</RouterLink>
                <span v-else class="muted">{{ formatEmbeddingTypeLabel(item.embeddingType) }}</span>
                <div class="flex-row-center">
                  <span>{{ Math.round(item.similarity * 100) }}%</span>
                  <div class="score-bar-wrapper lead-sales__bar">
                    <div class="score-bar-fill" :style="{ width: `${Math.round(item.similarity * 100)}%` }"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="muted">Nenhum lead similar calculado.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatEmbeddingTypeLabel, type Lead, type SimilarLead } from "../../../services/api";

defineEmits<{
  copyMessage: [text: string, id: number];
}>();

defineProps<{
  lead: Lead;
  similar: SimilarLead[];
  idealSimilarity: string;
  copiedMessageId: number | null;
}>();
</script>

<style scoped>
.lead-sales__messages-container {
  max-height: 380px;
  overflow-y: auto;
  padding-right: 6px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lead-sales__similar-container {
  max-height: 250px;
  overflow-y: auto;
  padding-right: 6px;
}

/* Custom scrollbars for messages and similar leads list */
.lead-sales__messages-container::-webkit-scrollbar,
.lead-sales__similar-container::-webkit-scrollbar {
  width: 4px;
}
.lead-sales__messages-container::-webkit-scrollbar-track,
.lead-sales__similar-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.01);
}
.lead-sales__messages-container::-webkit-scrollbar-thumb,
.lead-sales__similar-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
.lead-sales__messages-container::-webkit-scrollbar-thumb:hover,
.lead-sales__similar-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.lead-sales__message {
  margin-bottom: 0;
  background: rgba(30, 41, 59, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 18px;
  line-height: 1.6;
  font-size: 14px;
}

.lead-sales__message p.muted {
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  padding-bottom: 8px;
  font-size: 11px;
  letter-spacing: 0.3px;
}

.lead-sales__similar-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  font-size: 13px;
}

.lead-sales__similar-item:last-child {
  border-bottom: none;
}

.lead-sales__similar-item a {
  color: #38bdf8;
  text-decoration: none;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.lead-sales__similar-item a:hover {
  text-decoration: underline;
}

.lead-sales__bar {
  width: 60px !important;
  height: 6px !important;
}

.lead-sales__stats {
  background: rgba(30, 41, 59, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 24px;
  gap: 16px;
}

.lead-sales__stats > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lead-sales__stats span.muted {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 700;
  color: var(--text-muted);
}

.lead-sales__stats strong {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--text-highlight);
}

.lead-sales__list h3 {
  font-size: 11px;
  font-weight: 700;
  margin-top: 16px;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}
</style>
