<template>
  <div v-if="validation" class="panel fade-in campaign-validation">
    <h2><i class="ri-checkbox-multiple-line"></i> Validação Comercial da Campanha</h2>
    <div class="campaign-validation__layout">
      <div>
        <div class="grid cols-4 campaign-validation__metrics">
          <div class="metric">
            <span>Leads Totais</span>
            <strong>{{ validation.collectedLeads }}</strong>
          </div>
          <div class="metric">
            <span>Qualificados (Hot/Warm)</span>
            <strong>{{ validation.reviewedHotWarm }}</strong>
          </div>
          <div class="metric">
            <span>Contatos Executados</span>
            <strong>{{ validation.manualContacts }}</strong>
          </div>
          <div class="metric">
            <span>Vendas (Won)</span>
            <strong>{{ validation.wonDeals }}</strong>
          </div>
        </div>

        <h3 class="mb-1">Metas e Criterios Operacionais</h3>
        <div class="table-responsive campaign-validation__table-container">
          <table>
            <thead>
              <tr>
                <th>Meta / Criterio</th>
                <th>Progresso Realizado</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in validation.checklist" :key="item.label">
                <td class="text-highlight">{{ item.label }}</td>
                <td>
                  <div class="flex-row-center">
                    <strong>{{ item.current }} / {{ item.target }}</strong>
                    <div class="score-bar-wrapper campaign-validation__bar">
                      <div class="score-bar-fill" :style="{ width: progressWidth(item.current, item.target) }"></div>
                    </div>
                  </div>
                </td>
                <td>
                  <span v-if="item.done" class="badge campaign-validation__done">
                    <i class="ri-checkbox-circle-fill"></i> Ok
                  </span>
                  <span v-else class="badge campaign-validation__pending">
                    <i class="ri-time-line"></i> Pendente
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside class="campaign-validation__decision">
        <span>Decisão Recomendada</span>
        <div class="mt-1 mb-2">
          <span class="badge hot">
            <i class="ri-guide-line"></i> {{ formatDecisionLabel(validation.recommendedDecision) }}
          </span>
        </div>
        <h3 class="mt-2">Parecer Técnico da IA</h3>
        <p>{{ validation.interpretation }}</p>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDecisionLabel, type CampaignValidationReport } from "../../../services/api";

defineProps<{
  validation?: CampaignValidationReport;
}>();

function progressWidth(current: number, target: number) {
  if (!target) return "0%";
  return `${Math.min((current / target) * 100, 100)}%`;
}
</script>

<style scoped>
.campaign-validation__table-container {
  max-height: 280px;
  overflow-y: auto;
  position: relative;
}
.campaign-validation__table-container table thead th {
  position: sticky;
  top: 0;
  background: #131b2e; /* matches --bg-panel-solid */
  z-index: 10;
}
</style>
