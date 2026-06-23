<template>
  <section class="auth-layout">
    <div class="auth-showcase">
      <span class="eyebrow">Lead Radar</span>
      <h1>Quase lá! Crie a sua empresa para iniciar a operação.</h1>
      <p>
        Para acessar o painel comercial, as campanhas e a gestão de leads, você precisa ter uma empresa ativa.
      </p>
      
      <div class="auth-feature-list">
        <div class="auth-feature">
          <strong>Espaço exclusivo</strong>
          <span>Todas as suas campanhas e contatos de leads organizados em um único lugar.</span>
        </div>
        <div class="auth-feature">
          <strong>Convide sua equipe</strong>
          <span>Depois de criar a empresa, você poderá convidar outros membros como operadores ou gestores.</span>
        </div>
      </div>
    </div>

    <div class="auth-card">
      <div class="auth-card-header">
        <h2>Criar sua empresa</h2>
        <p>Preencha o nome da empresa ou organização para ativar o seu painel comercial.</p>
      </div>

      <form class="auth-form" @submit.prevent="createCompany">
        <label>
          Nome da empresa
          <input 
            v-model="companyForm.name" 
            required 
            placeholder="Ex: Minha Agência Digital" 
            autofocus
            :disabled="loading"
          />
        </label>
        
        <p v-if="error" class="error">{{ error }}</p>
        
        <button :disabled="loading" class="primary-action" type="submit">
          <i class="ri-add-circle-line"></i>
          {{ loading ? "Criando..." : "Criar e acessar painel" }}
        </button>

        <button class="secondary" type="button" @click="logout" style="width: 100%; margin-top: 12px;">
          <i class="ri-logout-box-r-line"></i> Sair da conta
        </button>
      </form>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { api } from "../../services/api";
import { authSession } from "../../services/session";

export default defineComponent({
  name: "CreateOrganizationView",
  data() {
    return {
      companyForm: {
        name: ""
      },
      loading: false,
      error: ""
    };
  },
  methods: {
    async createCompany() {
      this.loading = true;
      this.error = "";
      try {
        const session = await api.createOrganization(this.companyForm);
        authSession.applySession(session);
        // Redireciona para o dashboard
        this.$router.push("/dashboard");
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Falha ao criar empresa";
      } finally {
        this.loading = false;
      }
    },
    logout() {
      authSession.logout();
      this.$router.push("/auth");
    }
  }
});
</script>
