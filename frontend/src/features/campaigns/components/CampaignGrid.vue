<template>
  <div class="panel campaign-grid">
    <div class="campaign-grid__header">
      <h2><i class="ri-list-check-2"></i> Campanhas Ativas</h2>
      <div v-if="hasSelection" class="campaign-grid__bulk-toolbar fade-in">
        <span class="campaign-grid__selected-count">
          <i class="ri-checkbox-line"></i> {{ selectedCount }} selecionada(s)
        </span>
        <div class="campaign-grid__divider"></div>
        <button type="button" class="secondary compact" @click="$emit('bulkStart')" title="Iniciar campanhas selecionadas">
          <i class="ri-play-fill"></i> Iniciar
        </button>
        <button type="button" class="secondary compact" @click="$emit('bulkPause')" title="Pausar campanhas selecionadas">
          <i class="ri-pause-fill"></i> Pausar
        </button>
        <button type="button" class="secondary compact" @click="$emit('bulkEmbeddings')" title="Recalcular embeddings das campanhas selecionadas">
          <i class="ri-brain-line"></i> Vetores
        </button>
        <button type="button" class="secondary compact" :disabled="selectedCount !== 1" @click="$emit('bulkValidate')" title="Validar metas comerciais da campanha selecionada">
          <i class="ri-checkbox-circle-line"></i> Validar
        </button>
        <button type="button" class="secondary compact" @click="$emit('bulkDownloadCsv')" title="Exportar base de leads das campanhas selecionadas em CSV">
          <i class="ri-download-2-line"></i> CSV
        </button>
        <button type="button" class="danger compact" @click="$emit('bulkDelete')" title="Excluir campanha(s) selecionada(s)">
          <i class="ri-delete-bin-line"></i> Excluir
        </button>
        <button type="button" class="secondary compact ghost" @click="$emit('clearSelection')" title="Limpar seleção de campanhas">
          <i class="ri-close-line"></i>
        </button>
      </div>
    </div>

    <div class="table-responsive">
      <GenericGrid :data="campaigns" :columns="columns" :selectable="true" v-model:selectedMap="selectedMap" row-key="id" max-height="350px">
        <template #name="{ row }">
          <span class="text-highlight text-truncate-campaign" :title="row.name"><strong>{{ row.name }}</strong></span>
        </template>
        <template #city="{ row }">
          {{ row.city }}/{{ row.state }}
        </template>
        <template #status="{ row }">
          <span class="badge" :class="row.status === 'running' ? 'hot' : row.status === 'completed' ? 'medium' : 'cold'">
            {{ formatCampaignStatusLabel(row.status) }}
          </span>
        </template>
        <template #leads="{ row }">
          <div class="campaign-grid__lead-metrics">
            <strong>{{ row.metrics?.leadsFound ?? 0 }}</strong>
            <span class="muted">Hot {{ row.metrics?.hotLeads ?? 0 }} / Warm {{ row.metrics?.warmLeads ?? 0 }}</span>
          </div>
        </template>
        <template #actions="{ row }">
          <div class="campaign-grid__actions">
            <RouterLink :to="`/leads?campaignId=${row.id}`" class="channel-tag active campaign-grid__lead-link" title="Visualizar lista completa de leads desta campanha">
              <i class="ri-eye-line"></i> Ver Leads
            </RouterLink>
            <select
              :value="discoveryLevels[row.id] ?? 'quick'"
              :disabled="isDiscovering(row.id)"
              title="Nível da busca"
              class="campaign-grid__level"
              @change="$emit('setDiscoveryLevel', row.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="nano">Nano (5 leads)</option>
              <option value="quick">Quick (10 leads)</option>
              <option value="medium">Medium (30 leads)</option>
              <option value="deep">Deep (60 leads)</option>
            </select>
            <button type="button" :disabled="isDiscovering(row.id)" class="compact" @click="$emit('discover', row.id)" title="Disparar busca automática por novos leads nesta campanha">
              <i class="ri-radar-line"></i> Buscar
            </button>
            <button type="button" class="danger compact" :disabled="!isDiscovering(row.id)" @click="$emit('stopDiscovery', row.id)" title="Interromper busca automática em andamento">
              <i class="ri-stop-circle-line"></i> Parar
            </button>
          </div>
        </template>
      </GenericGrid>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import GenericGrid, { type ColumnConfig } from "../../../components/GenericGrid.vue";
import { formatCampaignStatusLabel, type Campaign, type DiscoverySearchLevel } from "../../../services/api";

const emit = defineEmits<{
  "update:selectedCampaigns": [value: Record<number, boolean>];
  bulkStart: [];
  bulkPause: [];
  bulkEmbeddings: [];
  bulkValidate: [];
  bulkDownloadCsv: [];
  bulkDelete: [];
  clearSelection: [];
  discover: [id: number];
  stopDiscovery: [id: number];
  setDiscoveryLevel: [id: number, value: string];
}>();

const props = defineProps<{
  campaigns: Campaign[];
  columns: ColumnConfig[];
  selectedCampaigns: Record<number, boolean>;
  discoveryLevels: Record<number, DiscoverySearchLevel>;
  discoveringCampaignIds: number[];
}>();

const selectedMap = computed({
  get: () => props.selectedCampaigns,
  set: (value) => emit("update:selectedCampaigns", value)
});

const hasSelection = computed(() => props.campaigns.some((campaign) => props.selectedCampaigns[campaign.id]));
const selectedCount = computed(() => props.campaigns.filter((campaign) => props.selectedCampaigns[campaign.id]).length);

function isDiscovering(id: number) {
  return props.discoveringCampaignIds.includes(id);
}
</script>

