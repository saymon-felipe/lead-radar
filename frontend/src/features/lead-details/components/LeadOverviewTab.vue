<template>
  <div class="tab-pane">
    <div class="grid cols-2 lead-overview__top">
      <div class="panel lead-overview__panel">
        <h2><i class="ri-profile-line"></i> Dados Basicos</h2>
        <div class="lead-overview__facts">
          <p><strong>Nome Comercial:</strong> <span class="text-highlight">{{ lead.businessName }}</span></p>
          <p><strong>Responsavel:</strong> {{ lead.personName ?? "-" }}</p>
          <p><strong>WhatsApp:</strong> <span v-if="lead.whatsapp" class="text-highlight">{{ lead.whatsapp }}</span><span v-else class="muted">-</span></p>
          <p><strong>E-mail:</strong> <span v-if="lead.email" class="text-highlight">{{ lead.email }}</span><span v-else class="muted">-</span></p>
          <p>
            <strong>Site Oficial:</strong>
            <a v-if="lead.websiteUrl" :href="lead.websiteUrl" target="_blank"><i class="ri-external-link-line"></i> {{ lead.websiteUrl }}</a>
            <span v-else class="muted">-</span>
          </p>
          <p>
            <strong>Instagram:</strong>
            <a v-if="lead.instagramUrl" :href="lead.instagramUrl" target="_blank"><i class="ri-instagram-line"></i> Perfil</a>
            <span v-else class="muted">-</span>
          </p>
        </div>
      </div>

      <div class="panel lead-overview__panel">
        <h2><i class="ri-line-chart-line"></i> Avaliacao do Score</h2>
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
            <p><strong>Presenca Digital Geral:</strong> <span class="text-highlight">{{ lead.score.digitalPresenceScore ?? "-" }} / 100</span></p>
          </div>

          <h3>Detalhamento da Pontuacao</h3>
          <div class="table-responsive">
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
        <p v-else class="muted">Nenhuma pontuacao calculada.</p>
      </div>
    </div>

    <div class="lead-overview__bottom">
      <form class="panel" @submit.prevent="$emit('createInteraction')">
        <h2><i class="ri-user-follow-line"></i> Registrar Nova Interacao</h2>
        <div class="grid cols-3 lead-overview__form-grid">
          <label>
            Novo Status Comercial
            <select v-model="interaction.status">
              <option value="contacted">Contatado</option>
              <option value="replied">Respondeu</option>
              <option value="interested">Interessado</option>
              <option value="meeting_scheduled">Reuniao Agendada</option>
              <option value="proposal_sent">Proposta Enviada</option>
              <option value="won">Ganho (Fechou Contrato)</option>
              <option value="lost">Perdido</option>
              <option value="no_response">Sem Resposta</option>
              <option value="invalid_contact">Contato Invalido</option>
            </select>
          </label>
          <label>
            Canal Utilizado
            <input v-model="interaction.contactChannel" placeholder="Ex: whatsapp, instagram, ligacao" />
          </label>
          <label>
            Notas do Contato
            <textarea v-model="interaction.notes" placeholder="Descreva o contato comercial..."></textarea>
          </label>
        </div>
        <div class="actions mt-3 lead-overview__actions">
          <button type="submit"><i class="ri-chat-follow-up-line"></i> Salvar Interacao</button>
        </div>
      </form>

      <div class="panel">
        <h2><i class="ri-history-line"></i> Linha do Tempo Comercial</h2>
        <div class="timeline mt-1 lead-overview__timeline">
          <div v-for="item in lead.interactions" :key="item.id" class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
              <div class="lead-overview__timeline-head">
                <span class="badge">{{ formatInteractionStatusLabel(item.status) }}</span>
                <span v-if="item.contactedAt" class="muted">{{ new Date(item.contactedAt).toLocaleDateString("pt-BR") }}</span>
              </div>
              <p class="text-highlight"><strong>Canal:</strong> {{ item.contactChannel ?? "-" }}</p>
              <p>{{ item.notes ?? "Sem observacoes adicionais." }}</p>
            </div>
          </div>
          <div v-if="!lead.interactions?.length" class="muted lead-overview__empty">
            Nenhuma interacao registrada. Registre um contato para iniciar a prospeccao.
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
