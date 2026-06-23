<template>
  <div class="tab-pane">
    <div class="grid cols-2 lead-sales">
      <div class="panel">
        <h2><i class="ri-message-3-line"></i> Abordagens de Venda Sugeridas</h2>
        <div v-if="lead.messages?.length">
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
          <div v-if="similar.length" class="lead-sales__similar-items">
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
