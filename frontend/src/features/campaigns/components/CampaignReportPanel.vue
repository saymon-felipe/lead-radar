<template>
  <div v-if="report" class="panel fade-in campaign-report">
    <h2><i class="ri-bar-chart-2-line"></i> Relatorio Analitico de Desempenho</h2>
    <div class="grid cols-3">
      <div class="campaign-report__card">
        <h3><i class="ri-briefcase-line"></i> Por Nicho</h3>
        <div v-for="row in report.byNiche" :key="row.key" class="campaign-report__row">
          <span>{{ row.key }}</span>
          <strong class="text-highlight">{{ row.conversionRate }}% conv.</strong>
        </div>
      </div>

      <div class="campaign-report__card">
        <h3><i class="ri-map-pin-line"></i> Por Cidade</h3>
        <div v-for="row in report.byCity" :key="row.key" class="campaign-report__row">
          <span>{{ row.key }}</span>
          <strong class="text-highlight">{{ row.responseRate }}% resp.</strong>
        </div>
      </div>

      <div class="campaign-report__card">
        <h3><i class="ri-shake-hands-line"></i> Por Oferta</h3>
        <div v-for="row in report.byOffer" :key="row.key" class="campaign-report__row">
          <span>{{ formatOfferLabel(row.key) }}</span>
          <strong>{{ row.won }} vendas</strong>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatOfferLabel, type CommercialReport } from "../../../services/api";

defineProps<{
  report?: CommercialReport;
}>();
</script>
