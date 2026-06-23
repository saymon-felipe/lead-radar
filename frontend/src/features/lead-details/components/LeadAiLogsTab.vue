<template>
  <div class="tab-pane">
    <div class="panel lead-ai-logs">
      <h2><i class="ri-code-box-line"></i> Logs de Analise Estruturada da IA</h2>
      <div v-if="reviews?.length" class="lead-ai-logs__list">
        <div v-for="review in reviews" :key="review.id" class="message-box lead-ai-logs__item">
          <strong><i class="ri-cpu-line"></i>{{ formatAnalysisTypeLabel(review.analysisType) }}</strong>
          <pre>{{ JSON.stringify(review.outputJson, null, 2) }}</pre>
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
