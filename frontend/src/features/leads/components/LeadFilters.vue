<template>
  <div class="panel lead-filters">
    <h2>
      <i class="ri-filter-3-line"></i> Filtros Rápidos
    </h2>
    <div class="toolbar lead-filters__toolbar">
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
        <input v-model="filters.city" placeholder="Ex: Londrina" />
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
        Possui Site?
        <select v-model="filters.hasWebsite">
          <option value="">Todos</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      </label>
      <label class="lead-filters__score">
        Score Mín.
        <input v-model="filters.minScore" type="number" placeholder="0" />
      </label>
      <button type="button" @click="$emit('load')">
        <i class="ri-search-line"></i> Filtrar
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Campaign } from "../../../services/api";

defineEmits<{
  load: [];
}>();

defineProps<{
  campaigns: Campaign[];
  filters: {
    campaignId: string;
    city: string;
    temperature: string;
    hasWebsite: string;
    minScore: string;
  };
}>();
</script>

<style scoped>
.lead-filters {
  background: rgba(20, 28, 47, 0.45);
  border-color: rgba(255, 255, 255, 0.05);
}

.lead-filters h2 {
  font-size: 0.95rem;
  margin-bottom: 1.25rem;
  font-weight: 700;
  color: var(--text-highlight);
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  padding-bottom: 0.5rem;
}

.lead-filters__toolbar {
  gap: 14px;
}

.lead-filters__toolbar button {
  background: linear-gradient(135deg, var(--primary), #0284c7);
  font-weight: 700;
  transition: all var(--transition-fast);
}

.lead-filters__toolbar button:hover {
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
}
</style>

