<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-backdrop" @click.self="$emit('close')">
        <div class="modal-content panel">
          <button type="button" class="secondary modal-close" @click="$emit('close')" title="Fechar formulário">
            <i class="ri-close-line"></i>
          </button>

          <h2><i class="ri-user-add-line"></i> Incluir Leads</h2>

          <div class="auth-tabs lead-entry-modal__tabs">
            <button type="button" :class="{ active: inputMode === 'single' }" @click="$emit('update:inputMode', 'single')">
              <i class="ri-user-add-line"></i> Novo Lead
            </button>
            <button type="button" :class="{ active: inputMode === 'csv' }" @click="$emit('update:inputMode', 'csv')">
              <i class="ri-file-upload-line"></i> Importar CSV
            </button>
          </div>

          <form v-if="inputMode === 'single'" @submit.prevent="$emit('create')">
            <div class="grid lead-entry-modal__form-grid">
              <label>
                Campanha
                <select v-model.number="form.campaignId">
                  <option :value="undefined">Sem campanha</option>
                  <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
                    {{ campaign.name }}
                  </option>
                </select>
              </label>
              <label>
                Nome da Empresa
                <input v-model="form.businessName" required placeholder="Ex: Clínica Radiológica Dental" />
              </label>
              <label>
                Nicho
                <input v-model="form.niche" required placeholder="Ex: Dentistas" />
              </label>
              <div class="grid cols-2 lead-entry-modal__inline-grid">
                <label>
                  Cidade
                  <input v-model="form.city" required placeholder="Londrina" />
                </label>
                <label>
                  Estado
                  <input v-model="form.state" required placeholder="PR" />
                </label>
              </div>
              <label>
                WhatsApp
                <input v-model="form.whatsapp" placeholder="43999999999" />
              </label>
              <label>
                Website URL
                <input v-model="form.websiteUrl" placeholder="https://exemplo.com" />
              </label>
              <label>
                Instagram URL
                <input v-model="form.instagramUrl" placeholder="https://instagram.com/perfil" />
              </label>
            </div>
            <div class="actions lead-entry-modal__actions">
              <button type="button" class="secondary" @click="$emit('close')">Cancelar</button>
              <button type="submit" class="primary"><i class="ri-check-line"></i> Cadastrar Lead</button>
            </div>
          </form>

          <form v-else @submit.prevent="$emit('import')">
            <div class="grid lead-entry-modal__form-grid">
              <label>
                Vincular à Campanha
                <select :value="importCampaignId" @change="updateImportCampaign">
                  <option :value="undefined">Sem campanha</option>
                  <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
                    {{ campaign.name }}
                  </option>
                </select>
              </label>
              <label>
                Dados do CSV
                <textarea
                  :value="csv"
                  required
                  rows="8"
                  placeholder="businessName,niche,city,state,whatsapp,websiteUrl,instagramUrl&#10;Dra Ana Silva,Psicólogos,Londrina,PR,5543999999999,,https://instagram.com/exemplo"
                  @input="$emit('update:csv', ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
              </label>
              <p class="muted lead-entry-modal__hint">
                Use cabeçalhos em inglês ou português: nome, nicho, cidade, estado, telefone/whatsapp, site, instagram.
              </p>
            </div>
            <div class="actions lead-entry-modal__actions">
              <button type="button" class="secondary" @click="$emit('close')">Cancelar</button>
              <button type="submit" class="primary"><i class="ri-upload-2-line"></i> Importar Lote</button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { Campaign } from "../../../services/api";

const emit = defineEmits<{
  close: [];
  create: [];
  import: [];
  "update:csv": [value: string];
  "update:inputMode": [value: "single" | "csv"];
  "update:importCampaignId": [value: number | undefined];
}>();

defineProps<{
  open: boolean;
  inputMode: "single" | "csv";
  campaigns: Campaign[];
  form: {
    campaignId?: number;
    businessName: string;
    niche: string;
    city: string;
    state: string;
    whatsapp: string;
    websiteUrl: string;
    instagramUrl: string;
  };
  csv: string;
  importCampaignId?: number;
}>();

function updateImportCampaign(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  emit("update:importCampaignId", value ? Number(value) : undefined);
}
</script>

<style scoped>
.modal-backdrop {
  align-items: center;
  background: rgba(5, 8, 17, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  height: 100vh;
  justify-content: center;
  left: 0;
  padding: 20px;
  position: fixed;
  top: 0;
  width: 100vw;
  z-index: 9999;
}

.modal-content {
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  margin-bottom: 0;
  max-height: calc(100vh - 40px);
  max-width: 100%;
  overflow-y: auto;
  position: relative;
  width: 580px;
}

.modal-close {
  border-radius: 50%;
  min-height: auto;
  padding: 6px;
  position: absolute;
  right: 20px;
  top: 20px;
}

.modal-close i {
  display: block;
  font-size: 20px;
  height: 20px;
  line-height: 20px;
  width: 20px;
}

.lead-entry-modal__tabs {
  margin-bottom: 20px;
}

.lead-entry-modal__form-grid {
  gap: 12px;
}

.lead-entry-modal__inline-grid {
  gap: 10px;
}

.lead-entry-modal__actions {
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.lead-entry-modal__hint {
  font-size: 11px;
  line-height: 1.5;
}

textarea {
  font-family: var(--font-mono);
  font-size: 12px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  opacity: 0;
  transform: scale(0.95) translateY(-15px);
}
</style>
