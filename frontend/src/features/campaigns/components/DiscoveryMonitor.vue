<template>
  <div v-if="liveDiscovery" class="panel fade-in discovery-monitor">
    <div class="page-header discovery-monitor__header">
      <div>
        <h2><i class="ri-terminal-box-line"></i> Monitor da Automação em Tempo Real</h2>
        <p>
          {{ liveDiscovery.running ? "Executando varredura" : "Última execução finalizada" }}
          <span v-if="liveDiscovery.currentProfessional"> · Foco: {{ liveDiscovery.currentProfessional }}</span>
        </p>
      </div>
      <button v-if="watchingCampaignId" class="secondary" @click="$emit('refresh', watchingCampaignId)" title="Forçar a atualização instantânea do monitor de status e logs">
        <i class="ri-refresh-line"></i> Atualizar Monitor
      </button>
    </div>

    <div class="grid cols-4 discovery-monitor__metrics">
      <div class="metric">
        <span>Etapa Atual</span>
        <strong>{{ liveDiscovery.currentStep ?? "-" }}</strong>
      </div>
      <div class="metric">
        <span>Coletados (Scraper)</span>
        <strong>{{ liveDiscovery.stats.collected }}</strong>
      </div>
      <div class="metric">
        <span>Extraídos (Filtro)</span>
        <strong>{{ liveDiscovery.stats.extractedProfessionals }}</strong>
      </div>
      <div class="metric">
        <span>Leads Inseridos</span>
        <strong>{{ liveDiscovery.stats.inserted }}</strong>
      </div>
    </div>

    <div class="grid cols-2">
      <div>
        <h3 class="mb-2 discovery-monitor__section-title"><i class="ri-computer-line"></i> Linha de Eventos</h3>
        <div class="terminal-console">
          <div class="terminal-header">
            <span>radar-console-logs v1.0.0</span>
            <div class="terminal-indicator">
              <span class="terminal-dot" :class="{ pulsing: liveDiscovery.running }"></span>
              <span>{{ liveDiscovery.running ? "ONLINE" : "OFFLINE" }}</span>
            </div>
          </div>
          <div v-for="event in [...liveDiscovery.events].reverse()" :key="event.id" class="terminal-log-item">
            <div class="discovery-monitor__event-title">
              <span>[{{ formatEventTime(event.at) }}]</span>
              <span>{{ event.title }}</span>
            </div>
            <p v-if="event.leadName">Lead: {{ event.leadName }}</p>
            <p v-if="event.detail">{{ event.detail }}</p>
            <p v-if="event.url">{{ event.url }}</p>
            <details v-if="event.payload">
              <summary>Visualizar Payload de Entrada</summary>
              <pre>{{ stringifyJson(event.payload) }}</pre>
            </details>
            <details v-if="event.response">
              <summary>Visualizar Resposta da IA</summary>
              <pre>{{ stringifyJson(event.response) }}</pre>
            </details>
          </div>
          <div v-if="!liveDiscovery.events?.length" class="discovery-monitor__empty">Nenhum evento registrado ainda.</div>
        </div>
      </div>

      <div class="panel discovery-monitor__metadata">
        <h3 class="mb-2"><i class="ri-file-info-line"></i> Metadados Operacionais</h3>
        <div class="discovery-monitor__metadata-list">
          <p><strong>Campanha Monitorada:</strong> #{{ watchingCampaignId }}</p>
          <p><strong>Nível de Busca Solicitado:</strong> <span class="badge">{{ liveDiscovery.searchLevel ?? "-" }}</span></p>
          <p><strong>Meta de Leads Finais:</strong> {{ liveDiscovery.targetFinalLeads ?? "-" }} leads</p>
          <p><strong>Última Sincronização:</strong> {{ formatEventTime(liveDiscovery.updatedAt) }}</p>
          <p><strong>Leads Revisados na Rodada:</strong> {{ liveDiscovery.stats.reviewed }}</p>
          <p><strong>Total de Eventos no Monitor:</strong> {{ liveDiscovery.events.length }}</p>
          <p class="muted">Este monitor acompanha a descoberta e a revisão automática antes da conversão em oportunidades.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DiscoveryStatus } from "../../../services/api";

defineEmits<{
  refresh: [campaignId: number];
}>();

defineProps<{
  liveDiscovery?: DiscoveryStatus;
  watchingCampaignId?: number;
}>();

function formatEventTime(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("pt-BR");
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}
</script>
