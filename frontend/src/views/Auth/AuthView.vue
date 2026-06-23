<template>
  <section class="auth-layout">
    <div class="auth-showcase">
      <span class="eyebrow">Lead Radar</span>
      <h1>Operacao comercial mais clara, previsivel e pronta para ganhar ritmo.</h1>
      <p>
        Entre para acompanhar campanhas, leads priorizados, sinais digitais e o funil comercial em uma interface mais
        organizada.
      </p>

      <div class="auth-feature-list">
        <div class="auth-feature">
          <strong>Priorizacao de leads</strong>
          <span>Veja quem merece contato primeiro com score, temperatura e oferta sugerida.</span>
        </div>
        <div class="auth-feature">
          <strong>Campanhas por nicho e cidade</strong>
          <span>Organize a prospeccao em frentes claras, com leitura rapida do desempenho comercial.</span>
        </div>
        <div class="auth-feature">
          <strong>Analise de presenca digital</strong>
          <span>Entenda sinais de site, redes sociais e oportunidades antes de escrever a abordagem.</span>
        </div>
      </div>
    </div>

    <div class="auth-card">
      <div class="auth-tabs">
        <button :class="{ active: mode === 'login' }" class="tab-button" type="button" @click="mode = 'login'">
          Entrar
        </button>
        <button :class="{ active: mode === 'register' }" class="tab-button" type="button" @click="mode = 'register'">
          Criar conta
        </button>
      </div>

      <div class="auth-card-header">
        <h2>{{ mode === "login" ? "Acessar conta" : "Criar conta" }}</h2>
        <p>
          {{ mode === "login" ? "Use suas credenciais para entrar no painel." : "Cadastre-se para iniciar na plataforma." }}
        </p>
      </div>

      <form v-if="mode === 'login'" class="auth-form" @submit.prevent="submitLogin">
        <label>
          E-mail
          <input v-model="loginForm.email" autocomplete="email" type="email" required />
        </label>
        <label>
          Senha
          <input v-model="loginForm.password" autocomplete="current-password" type="password" required />
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button :disabled="loading" class="primary-action" type="submit">
          {{ loading ? "Entrando..." : "Entrar" }}
        </button>
      </form>

      <form v-else class="auth-form" @submit.prevent="submitRegister">
        <label>
          Nome
          <input v-model="registerForm.name" autocomplete="name" required />
        </label>
        <label>
          E-mail
          <input v-model="registerForm.email" autocomplete="email" type="email" required />
        </label>
        <label>
          Senha
          <input v-model="registerForm.password" autocomplete="new-password" minlength="6" type="password" required />
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button :disabled="loading" class="primary-action" type="submit">
          {{ loading ? "Cadastrando..." : "Criar conta" }}
        </button>
      </form>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { authSession } from "../../services/session";

export default defineComponent({
  name: "AuthView",
  data() {
    return {
      mode: "login" as "login" | "register",
      loading: false,
      error: "",
      loginForm: {
        email: "",
        password: ""
      },
      registerForm: {
        name: "",
        email: "",
        password: ""
      }
    };
  },
  methods: {
    async submitLogin() {
      this.loading = true;
      this.error = "";
      try {
        await authSession.login(this.loginForm);
        await this.$router.push("/dashboard");
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao entrar";
      } finally {
        this.loading = false;
      }
    },
    async submitRegister() {
      this.loading = true;
      this.error = "";
      try {
        await authSession.register(this.registerForm);
        await this.$router.push("/dashboard");
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao criar empresa";
      } finally {
        this.loading = false;
      }
    }
  }
});
</script>
