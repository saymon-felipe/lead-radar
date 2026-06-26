<template>
  <div class="tab-pane">
    <div class="grid cols-2 lead-overview__top">
      <div class="panel lead-overview__panel">
        <h2><i class="ri-profile-line"></i> Dados Básicos</h2>
        <div class="lead-overview__facts-list">
          <div class="lead-overview__fact">
            <span class="fact-label">Nome Comercial</span>
            <span class="fact-value text-highlight"><strong>{{ lead.businessName }}</strong></span>
          </div>
          <div class="lead-overview__fact">
            <span class="fact-label">Responsável</span>
            <span class="fact-value">{{ lead.personName ?? "-" }}</span>
          </div>
          <div class="lead-overview__fact">
            <span class="fact-label">WhatsApp</span>
            <span class="fact-value text-highlight" v-if="lead.whatsapp">{{ lead.whatsapp }}</span>
            <span class="fact-value muted" v-else>-</span>
          </div>
          <div class="lead-overview__fact">
            <span class="fact-label">E-mail</span>
            <span class="fact-value text-highlight" v-if="lead.email">{{ lead.email }}</span>
            <span class="fact-value muted" v-else>-</span>
          </div>
          <div class="lead-overview__fact">
            <span class="fact-label">Site Oficial</span>
            <span class="fact-value">
              <a v-if="lead.websiteUrl" :href="lead.websiteUrl" target="_blank" class="fact-link"><i class="ri-external-link-line"></i> Site</a>
              <span v-else class="muted">-</span>
            </span>
          </div>
          <div class="lead-overview__fact">
            <span class="fact-label">Instagram</span>
            <span class="fact-value">
              <a v-if="lead.instagramUrl" :href="lead.instagramUrl" target="_blank" class="fact-link"><i class="ri-instagram-line"></i> Perfil</a>
              <span v-else class="muted">-</span>
            </span>
          </div>
        </div>
      </div>

      <div class="panel lead-overview__panel">
        <h2><i class="ri-line-chart-line"></i> Avaliação do Score</h2>
        <template v-if="lead.score">
          <div class="score-gauge-container">
            <div class="lead-overview__score-header">
              <span class="badge" :class="lead.score.temperature">{{ formatTemperatureLabel(lead.score.temperature) }}</span>
              <strong>{{ lead.score.finalScore }} pts</strong>
            </div>
            <div class="score-bar-wrapper lead-overview__score-bar">
              <div class="score-bar-fill" :class="lead.score.temperature" :style="{ width: `${lead.score.finalScore}%` }"></div>
            </div>
          </div>

          <div class="lead-overview__score-summary">
            <p><strong>Oferta Comercial Recomendada:</strong></p>
            <p class="text-highlight"><i class="ri-gift-line"></i> {{ formatOfferLabel(lead.score.recommendedOffer) }}</p>
            <p><strong>Presença Digital Geral:</strong> <span class="text-highlight">{{ lead.score.digitalPresenceScore ?? "-" }} / 100</span></p>
          </div>

          <h3>Detalhamento da Pontuação</h3>
          <div class="table-responsive lead-overview__score-details">
            <table>
              <tbody>
                <tr v-for="item in lead.score.scoreBreakdownJson" :key="item.key">
                  <td>{{ item.label }}</td>
                  <td class="lead-overview__points">
                    <span v-if="item.applied">+{{ item.points }}</span>
                    <span v-else class="muted">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <p v-else class="muted">Nenhuma pontuação calculada.</p>
      </div>
    </div>

    <div class="lead-overview__bottom">
      <form class="panel" @submit.prevent="$emit('createInteraction')">
        <h2><i class="ri-user-follow-line"></i> Registrar Nova Interação</h2>
        <div class="grid cols-3 lead-overview__form-grid">
          <label>
            Novo Status Comercial
            <select v-model="interaction.status">
              <option value="contacted">Contatado</option>
              <option value="replied">Respondeu</option>
              <option value="interested">Interessado</option>
              <option value="meeting_scheduled">Reunião Agendada</option>
              <option value="proposal_sent">Proposta Enviada</option>
              <option value="won">Ganho (Fechou Contrato)</option>
              <option value="lost">Perdido</option>
              <option value="no_response">Sem Resposta</option>
              <option value="invalid_contact">Contato Inválido</option>
            </select>
          </label>
          <label>
            Canal Utilizado
            <input v-model="interaction.contactChannel" placeholder="Ex: whatsapp, instagram, ligação" />
          </label>
          <label>
            Notas do Contato
            <textarea v-model="interaction.notes" placeholder="Descreva o contato comercial..."></textarea>
          </label>
        </div>
        <div class="actions mt-3 lead-overview__actions">
          <button type="submit"><i class="ri-chat-follow-up-line"></i> Salvar Interação</button>
        </div>
      </form>

      <div class="panel">
        <h2><i class="ri-history-line"></i> Linha do Tempo Comercial</h2>
        <div class="lead-overview__timeline-container">
          <div class="timeline mt-1 lead-overview__timeline">
            <div v-for="item in lead.interactions" :key="item.id" class="timeline-item">
              <div class="timeline-marker"></div>
              <div class="timeline-content">
                <div class="lead-overview__timeline-head">
                  <span class="badge">{{ formatInteractionStatusLabel(item.status) }}</span>
                  <span v-if="item.contactedAt" class="muted">{{ new Date(item.contactedAt).toLocaleDateString("pt-BR") }}</span>
                </div>
                <p class="text-highlight"><strong>Canal:</strong> {{ item.contactChannel ?? "-" }}</p>
                <p>{{ item.notes ?? "Sem observações adicionais." }}</p>
              </div>
            </div>
            <div v-if="!lead.interactions?.length" class="muted lead-overview__empty">
              Nenhuma interação registrada. Registre um contato para iniciar a prospecção.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  formatInteractionStatusLabel,
  formatOfferLabel,
  formatTemperatureLabel,
  type Lead
} from "../../../services/api";

defineEmits<{
  createInteraction: [];
}>();

defineProps<{
  lead: Lead;
  interaction: {
    status: string;
    contactChannel?: string;
    notes?: string;
  };
}>();
</script>

<style scoped>
.lead-overview__facts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lead-overview__fact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  font-size: 13px;
}

.lead-overview__fact:last-child {
  border-bottom: none;
}

.fact-label {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.fact-value {
  color: var(--text-main);
  font-weight: 500;
  text-align: right;
}

.fact-link {
  color: #38bdf8;
  text-decoration: none;
  font-weight: 600;
}

.fact-link:hover {
  text-decoration: underline;
}

.lead-overview__score-details {
  max-height: 200px;
  overflow-y: auto;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: var(--radius-md);
  background: rgba(15, 23, 42, 0.2);
}

.lead-overview__score-details table thead th {
  position: sticky;
  top: 0;
  background: #131b2e;
  z-index: 10;
}

.lead-overview__timeline-container {
  max-height: 380px;
  overflow-y: auto;
  padding-right: 6px;
}

/* Custom scrollbar for timeline and score breakdown list */
.lead-overview__timeline-container::-webkit-scrollbar,
.lead-overview__score-details::-webkit-scrollbar {
  width: 4px;
}
.lead-overview__timeline-container::-webkit-scrollbar-track,
.lead-overview__score-details::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.01);
}
.lead-overview__timeline-container::-webkit-scrollbar-thumb,
.lead-overview__score-details::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
.lead-overview__timeline-container::-webkit-scrollbar-thumb:hover,
.lead-overview__score-details::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Better spacing and aesthetics for Score panel */
.score-gauge-container {
  background: rgba(30, 41, 59, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lead-overview__score-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lead-overview__score-header strong {
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--text-highlight);
}

.lead-overview__score-bar {
  margin-bottom: 0;
}

.lead-overview__score-summary {
  background: rgba(30, 41, 59, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lead-overview__score-summary p {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.lead-overview__score-summary p strong {
  color: var(--text-muted);
  font-weight: 600;
}

.lead-overview__score-summary p.text-highlight {
  font-size: 15px;
  font-weight: 700;
  color: #38bdf8 !important;
  display: flex;
  align-items: center;
  gap: 6px;
}

.lead-overview__score-summary p.text-highlight i {
  font-size: 1.1rem;
}

.lead-overview__panel h3 {
  font-size: 11px;
  font-weight: 700;
  margin-top: 16px;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}
</style>
