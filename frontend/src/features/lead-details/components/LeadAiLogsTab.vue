<template>
  <div class="tab-pane">
    <div class="panel lead-ai-logs">
      <h2><i class="ri-code-box-line"></i> Logs de Analise Estruturada da IA</h2>
      <div v-if="reviews?.length" class="lead-ai-logs__container">
        <div class="lead-ai-logs__list">
          <div v-for="review in reviews" :key="review.id" class="message-box lead-ai-logs__item">
            <strong><i class="ri-cpu-line"></i> {{ formatAnalysisTypeLabel(review.analysisType) }}</strong>
            <pre>{{ JSON.stringify(review.outputJson, null, 2) }}</pre>
          </div>
        </div>
      </div>
      <p v-else class="muted">Nenhum log estruturado registrado.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatAnalysisTypeLabel } from "../../../services/api";

defineProps<{
  reviews?: Array<{ id: number; analysisType: string; summary?: string; outputJson: Record<string, unknown> }>;
}>();
</script>

<style scoped>
.lead-ai-logs__container {
  max-height: 500px;
  overflow-y: auto;
  padding-right: 6px;
}

/* Custom scrollbar for logs container */
.lead-ai-logs__container::-webkit-scrollbar {
  width: 4px;
}
.lead-ai-logs__container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.01);
}
.lead-ai-logs__container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
.lead-ai-logs__container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.lead-ai-logs__item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(15, 23, 42, 0.35);
  border-color: rgba(255, 255, 255, 0.05);
  margin-bottom: 12px;
  padding: 16px;
}

.lead-ai-logs__item strong {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-highlight);
}

.lead-ai-logs__item strong i {
  color: #38bdf8;
}

pre {
  background: #030712 !important;
  color: #a7f3d0 !important;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 12px;
  overflow-x: auto;
  max-height: 350px;
  white-space: pre;
  word-break: normal;
  margin: 0;
}

/* Custom scrollbar for JSON output pre blocks */
pre::-webkit-scrollbar {
  height: 4px;
  width: 4px;
}
pre::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.01);
}
pre::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}
</style>
