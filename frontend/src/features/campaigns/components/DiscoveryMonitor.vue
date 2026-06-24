<template>
  <div v-if="liveDiscovery" class="panel fade-in discovery-monitor">
    <!-- Header -->
    <div class="discovery-monitor__header">
      <div>
        <h2><i class="ri-terminal-box-line"></i> Monitor da Automação em Tempo Real</h2>
        <p>
          {{ liveDiscovery.running ? "Executando varredura" : "Última execução finalizada" }}
          <span v-if="liveDiscovery.currentProfessional" class="focus-text"> · Foco: {{ liveDiscovery.currentProfessional }}</span>
        </p>
      </div>
      <button v-if="watchingCampaignId" class="secondary refresh-btn" @click="$emit('refresh', watchingCampaignId)" title="Forçar a atualização instantânea do monitor de status e logs">
        <i class="ri-refresh-line"></i> Atualizar Monitor
      </button>
    </div>

    <!-- Metric Cards -->
    <div class="discovery-monitor__metrics">
      <div class="metric-card" :class="{ 'metric-card--active': liveDiscovery.running }">
        <span class="metric-card__label">Etapa Atual</span>
        <strong class="metric-card__value metric-card__value--step">{{ liveDiscovery.currentStep ?? "Iniciando..." }}</strong>
      </div>
      <div class="metric-card">
        <span class="metric-card__label">Coletados (Scraper)</span>
        <strong class="metric-card__value">{{ liveDiscovery.stats.collected }}</strong>
      </div>
      <div class="metric-card">
        <span class="metric-card__label">Extraídos (Filtro)</span>
        <strong class="metric-card__value">{{ liveDiscovery.stats.extractedProfessionals }}</strong>
      </div>
      <div class="metric-card">
        <span class="metric-card__label">Leads Inseridos</span>
        <strong class="metric-card__value">{{ liveDiscovery.stats.inserted }}</strong>
      </div>
    </div>

    <!-- Bottom Panels -->
    <div class="monitor-panels-row">
      <!-- Left Panel: Event Log (Terminal) -->
      <div class="monitor-panel">
        <div class="monitor-panel__header">
          <h3 class="monitor-panel__title"><i class="ri-terminal-line"></i> Linha de Eventos</h3>
          <div class="terminal-indicator">
            <span class="terminal-dot" :class="{ pulsing: liveDiscovery.running }"></span>
            <span class="terminal-status-text">
              {{ liveDiscovery.running ? "ONLINE" : "OFFLINE" }}
            </span>
          </div>
        </div>

        <div class="terminal-console-container">
          <div v-for="event in [...liveDiscovery.events].reverse()" :key="event.id" class="terminal-log-row">
            <div class="terminal-log-row__header">
              <span class="terminal-log-row__time">[{{ formatEventTime(event.at) }}]</span>
              <span class="terminal-log-row__title">{{ event.title }}</span>
            </div>
            <div class="terminal-log-row__meta">
              <p v-if="event.leadName" style="margin: 0 0 0.15rem 0;"><strong>Lead:</strong> {{ event.leadName }}</p>
              <p v-if="event.detail" style="margin: 0 0 0.15rem 0;">{{ event.detail }}</p>
              <p v-if="event.url" style="margin: 0 0 0.15rem 0; word-break: break-all;"><strong>URL:</strong> <a :href="event.url" target="_blank" class="terminal-link">{{ event.url }}</a></p>
            </div>
            <details v-if="event.payload">
              <summary>Visualizar Payload de Entrada</summary>
              <pre>{{ stringifyJson(event.payload) }}</pre>
            </details>
            <details v-if="event.response">
              <summary>Visualizar Resposta da IA</summary>
              <pre>{{ stringifyJson(event.response) }}</pre>
            </details>
          </div>
          <div v-if="!liveDiscovery.events?.length" class="terminal-empty">
            Nenhum evento registrado ainda.
          </div>
        </div>
      </div>

      <!-- Right Panel: Operational Metadata -->
      <div class="monitor-panel">
        <div class="monitor-panel__header">
          <h3 class="monitor-panel__title"><i class="ri-file-info-line"></i> Metadados Operacionais</h3>
        </div>

        <table class="metadata-table">
          <tbody>
            <tr>
              <td class="metadata-table__label">Campanha Monitorada</td>
              <td class="metadata-table__value">#{{ watchingCampaignId }}</td>
            </tr>
            <tr>
              <td class="metadata-table__label">Nível de Busca</td>
              <td class="metadata-table__value">
                <span class="badge metadata-badge">
                  {{ liveDiscovery.searchLevel ?? "-" }}
                </span>
              </td>
            </tr>
            <tr>
              <td class="metadata-table__label">Meta de Leads</td>
              <td class="metadata-table__value">{{ liveDiscovery.targetFinalLeads ?? "-" }} leads</td>
            </tr>
            <tr>
              <td class="metadata-table__label">Última Sincronização</td>
              <td class="metadata-table__value">{{ formatEventTime(liveDiscovery.updatedAt) }}</td>
            </tr>
            <tr>
              <td class="metadata-table__label">Leads Revisados</td>
              <td class="metadata-table__value">{{ liveDiscovery.stats.reviewed }}</td>
            </tr>
            <tr>
              <td class="metadata-table__label">Total de Eventos</td>
              <td class="metadata-table__value">{{ liveDiscovery.events.length }}</td>
            </tr>
          </tbody>
        </table>

        <p class="metadata-help-text">
          Este monitor acompanha a descoberta e a revisão automática antes da conversão em oportunidades no pipeline de vendas.
        </p>
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

<style scoped>
.discovery-monitor {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.25);
  margin-top: 1.75rem;
  padding: 1.75rem;
}

.discovery-monitor__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 1rem;
  margin-bottom: 0.25rem;
}

.discovery-monitor__header h2 {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-highlight);
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0;
}

.discovery-monitor__header h2 i {
  color: #38bdf8; /* sky-400 */
}

.discovery-monitor__header p {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0.35rem 0 0 0;
}

.focus-text {
  color: #38bdf8;
  font-weight: 500;
}

.refresh-btn {
  font-size: 0.8rem;
  padding: 0.4rem 0.8rem;
  height: auto;
}

.discovery-monitor__metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  align-items: stretch;
}

.metric-card {
  background: rgba(30, 41, 59, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 1.15rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100px;
  position: relative;
  overflow: hidden;
  transition: all 0.2s ease;
}

.metric-card:hover {
  background: rgba(30, 41, 59, 0.3);
  border-color: rgba(14, 165, 233, 0.2);
  transform: translateY(-1px);
}

.metric-card::after {
  content: '';
  position: absolute;
  width: 50px;
  height: 50px;
  background: radial-gradient(circle, rgba(14, 165, 233, 0.05) 0%, transparent 70%);
  top: -15px;
  right: -15px;
  pointer-events: none;
}

.metric-card--active {
  border-color: rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.02);
  box-shadow: inset 0 0 10px rgba(245, 158, 11, 0.02);
}

.metric-card--active::after {
  background: radial-gradient(circle, rgba(245, 158, 11, 0.08) 0%, transparent 70%);
}

.metric-card__label {
  color: var(--text-muted);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 0.75rem;
  display: block;
}

.metric-card__value {
  color: var(--text-highlight);
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.1;
  display: block;
}

.metric-card__value--step {
  font-size: 0.9rem;
  font-weight: 600;
  color: #fbbf24; /* amber-400 */
  line-height: 1.35;
  word-break: break-word;
  margin-top: 0.15rem;
}

.monitor-panels-row {
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  gap: 1.25rem;
  align-items: stretch;
  margin-top: 0.25rem;
}

.monitor-panel {
  background: rgba(15, 23, 42, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  height: 440px;
  box-sizing: border-box;
}

.monitor-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.85rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  padding-bottom: 0.65rem;
}

.monitor-panel__title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-highlight);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.monitor-panel__title i {
  color: #38bdf8; /* sky-400 */
  font-size: 1rem;
}

.terminal-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.terminal-dot {
  background: #64748b;
  border-radius: 50%;
  height: 7px;
  width: 7px;
}

.terminal-dot.pulsing {
  background: #10b981;
  animation: pulse-glow 1.5s infinite;
}

@keyframes pulse-glow {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

.terminal-status-text {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.terminal-console-container {
  flex-grow: 1;
  background: #030712;
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: var(--radius-sm);
  padding: 0.85rem 1rem;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: #10b981; /* emerald-500 */
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.7);
}

.terminal-console-container::-webkit-scrollbar {
  width: 6px;
}

.terminal-console-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.01);
}

.terminal-console-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
}

.terminal-console-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

.terminal-log-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
  padding: 0.45rem 0;
}

.terminal-log-row:last-child {
  border-bottom: none;
}

.terminal-log-row__header {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-weight: 500;
}

.terminal-log-row__time {
  color: #475569; /* slate-600 */
  font-size: 0.7rem;
}

.terminal-log-row__title {
  color: #a7f3d0; /* emerald-200 */
}

.terminal-log-row__meta {
  margin: 0.2rem 0 0 0;
  padding-left: 0.5rem;
  font-size: 0.7rem;
  color: #64748b;
  border-left: 1px solid rgba(255, 255, 255, 0.05);
  line-height: 1.4;
}

.terminal-link {
  color: #38bdf8;
  text-decoration: none;
}

.terminal-link:hover {
  text-decoration: underline;
}

.terminal-log-row details {
  margin-top: 0.3rem;
}

.terminal-log-row summary {
  color: #475569;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  cursor: pointer;
  user-select: none;
}

.terminal-log-row summary:hover {
  color: #64748b;
}

.terminal-log-row pre {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 4px;
  padding: 0.45rem;
  color: #34d399;
  max-height: 130px;
  overflow-y: auto;
  font-size: 0.7rem;
  margin-top: 0.2rem;
}

.terminal-empty {
  color: #475569;
  text-align: center;
  padding: 3rem 0;
}

.metadata-table {
  width: 100%;
  border-collapse: collapse;
}

.metadata-table td {
  padding: 0.6rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  font-size: 0.8rem;
}

.metadata-table tr:last-child td {
  border-bottom: none;
}

.metadata-table__label {
  color: var(--text-muted);
  font-weight: 500;
  width: 55%;
}

.metadata-table__value {
  color: var(--text-highlight);
  text-align: right;
  font-weight: 600;
}

.metadata-badge {
  text-transform: uppercase;
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  letter-spacing: 0.5px;
}

.metadata-help-text {
  margin-top: auto;
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.4;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  margin-bottom: 0;
}
</style>
