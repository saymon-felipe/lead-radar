<template>
  <section class="auth-layout">
    <div class="auth-showcase">
      <span class="eyebrow">Lead Radar</span>
      <h1>Voce foi convidado para uma empresa.</h1>
      <p v-if="invitation">
        Entre na empresa {{ invitation.organization.name }} usando o email {{ invitation.email }}.
      </p>
      <p v-else>Carregando detalhes do convite.</p>
    </div>

    <div class="auth-card">
      <div class="auth-card-header">
        <h2>{{ title }}</h2>
        <p v-if="invitation">
          Papel: {{ invitation.role }} | Expira em {{ new Date(invitation.expiresAt).toLocaleDateString("pt-BR") }}
        </p>
      </div>

      <div v-if="loadingDetails" class="auth-form">
        <p class="muted">Validando convite...</p>
      </div>

      <form v-else-if="invitation && !blocked" class="auth-form" @submit.prevent="accept">
        <label v-if="!invitation.userExists">
          Nome
          <input v-model="form.name" autocomplete="name" required />
        </label>
        <label>
          E-mail
          <input :value="invitation.email" type="email" disabled />
        </label>
        <label>
          Senha
          <input v-model="form.password" :autocomplete="invitation.userExists ? 'current-password' : 'new-password'" minlength="6" type="password" required />
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button :disabled="loadingAccept" class="primary-action" type="submit">
          {{ loadingAccept ? "Entrando..." : invitation.userExists ? "Entrar na empresa" : "Criar conta e entrar" }}
        </button>
      </form>

      <div v-else class="auth-form">
        <p class="error">{{ error || "Convite indisponivel." }}</p>
        <RouterLink class="primary-action invite-view__link" to="/auth">Ir para login</RouterLink>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { api, type OrganizationInvitation } from "../../services/api";
import { authSession } from "../../services/session";

export default defineComponent({
  name: "InviteView",
  props: {
    token: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      invitation: undefined as OrganizationInvitation | undefined,
      loadingDetails: true,
      loadingAccept: false,
      blocked: false,
      error: "",
      form: {
        name: "",
        password: ""
      }
    };
  },
  computed: {
    title(): string {
      if (!this.invitation) return "Convite";
      if (this.invitation.acceptedAt) return "Convite ja aceito";
      if (this.invitation.expired) return "Convite expirado";
      return this.invitation.userExists ? "Entrar com sua conta" : "Criar sua conta";
    }
  },
  mounted() {
    void this.load();
  },
  methods: {
    async load() {
      this.loadingDetails = true;
      this.error = "";
      try {
        this.invitation = await api.invitation(this.token);
        this.blocked = Boolean(this.invitation.acceptedAt || this.invitation.expired);
      } catch (error) {
        this.blocked = true;
        this.error = error instanceof Error ? error.message : "Convite invalido";
      } finally {
        this.loadingDetails = false;
      }
    },
    async accept() {
      this.loadingAccept = true;
      this.error = "";
      try {
        const session = await api.acceptInvitation(this.token, {
          name: this.invitation?.userExists ? undefined : this.form.name,
          password: this.form.password
        });
        authSession.applySession(session);
        await this.$router.push("/dashboard");
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao aceitar convite";
      } finally {
        this.loadingAccept = false;
      }
    }
  }
});
</script>
