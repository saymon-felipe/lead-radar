<template>
  <div class="panel lead-grid">
    <div class="lead-grid__header">
      <h2><i class="ri-user-shared-line"></i> Leads Qualificados ({{ leads.length }})</h2>
    </div>
    <GenericGrid :data="leads" :columns="columns" row-key="id">
      <template #businessName="{ row }">
        <span class="text-highlight">
          <RouterLink :to="`/leads/${row.id}`" class="lead-grid__link">
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
          {{ row.score.finalScore }} · {{ formatTemperatureLabel(row.score.temperature) }}
        </span>
        <span v-else class="badge cold">Sem Score</span>
      </template>
      <template #recommendedOffer="{ row }">
        <span class="text-highlight">{{ formatOfferLabel(row.score?.recommendedOffer) }}</span>
      </template>
      <template #status="{ row }">
        <span class="badge" :style="getStatusStyle(row.latestInteraction?.status)">
          {{ formatInteractionStatusLabel(row.latestInteraction?.status ?? "not_contacted") }}
        </span>
      </template>
      <template #empty>
        Nenhum lead encontrado com os filtros atuais.
      </template>
    </GenericGrid>
  </div>
</template>

<script setup lang="ts">
import GenericGrid, { type ColumnConfig } from "../../../components/GenericGrid.vue";
import {
  formatInteractionStatusLabel,
  formatOfferLabel,
  formatTemperatureLabel,
  type Lead
} from "../../../services/api";

defineProps<{
  leads: Lead[];
  columns: ColumnConfig[];
}>();

function getStatusStyle(status?: string) {
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
</script>

