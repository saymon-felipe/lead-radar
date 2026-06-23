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

