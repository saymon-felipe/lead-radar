<template>
  <form class="panel campaign-form" @submit.prevent="$emit('create')">
    <h2><i class="ri-add-circle-line"></i> Nova Campanha</h2>
    <div class="grid cols-4 campaign-form__grid">
      <label>
        Nome da Campanha
        <input v-model="form.name" required placeholder="Psicólogos Londrina" />
      </label>
      <label>
        Nicho de Atuação
        <input v-model="form.niche" required placeholder="Psicólogos" />
      </label>
      <label>
        Cidade
        <input v-model="form.city" required placeholder="Londrina" />
      </label>
      <label>
        Estado (UF)
        <input v-model="form.state" required placeholder="PR" />
      </label>
    </div>
    <div class="actions campaign-form__actions">
      <button type="submit" title="Salvar e criar nova campanha no sistema">
        <i class="ri-save-line"></i> Criar Campanha
      </button>
    </div>
    <p v-if="error" class="error mt-2"><i class="ri-error-warning-line"></i> {{ error }}</p>
    <p v-if="lastResult" class="muted mt-2 campaign-form__result">
      <i class="ri-checkbox-circle-line"></i> {{ lastResult }}
    </p>
  </form>
</template>

<script setup lang="ts">
defineEmits<{
  create: [];
}>();

defineProps<{
  error: string;
  lastResult: string;
  form: {
    name: string;
    niche: string;
    city: string;
    state: string;
  };
}>();
</script>

