<template>
  <div v-if="report" class="panel fade-in campaign-report">
    <h2><i class="ri-bar-chart-2-line"></i> Relatorio Analitico de Desempenho</h2>
    <div class="grid cols-3">
      <div class="campaign-report__card">
        <h3><i class="ri-briefcase-line"></i> Por Nicho</h3>
        <div class="campaign-report__rows">
          <div v-for="row in report.byNiche" :key="row.key" class="campaign-report__row">
            <span>{{ row.key }}</span>
            <strong class="text-highlight">{{ row.conversionRate }}% conv.</strong>
          </div>
        </div>
      </div>

      <div class="campaign-report__card">
        <h3><i class="ri-map-pin-line"></i> Por Cidade</h3>
        <div class="campaign-report__rows">
          <div v-for="row in report.byCity" :key="row.key" class="campaign-report__row">
            <span>{{ row.key }}</span>
            <strong class="text-highlight">{{ row.responseRate }}% resp.</strong>
          </div>
        </div>
      </div>

      <div class="campaign-report__card">
        <h3><i class="ri-shake-hands-line"></i> Por Oferta</h3>
        <div class="campaign-report__rows">
          <div v-for="row in report.byOffer" :key="row.key" class="campaign-report__row">
            <span>{{ formatOfferLabel(row.key) }}</span>
            <strong>{{ row.won }} vendas</strong>
          </div>
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

<style scoped>
.campaign-report__card {
  display: flex;
  flex-direction: column;
  background: rgba(30, 41, 59, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 1.15rem;
}

.campaign-report__card h3 {
  margin-top: 0;
  margin-bottom: 0.85rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-highlight);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.campaign-report__card h3 i {
  color: #38bdf8;
}

.campaign-report__rows {
  max-height: 200px;
  overflow-y: auto;
  padding-right: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Custom scrollbar for report rows */
.campaign-report__rows::-webkit-scrollbar {
  width: 4px;
}
.campaign-report__rows::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.01);
}
.campaign-report__rows::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
.campaign-report__rows::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.campaign-report__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-muted);
}

.campaign-report__row span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 8px;
}

.campaign-report__row strong {
  flex-shrink: 0;
}
</style>
