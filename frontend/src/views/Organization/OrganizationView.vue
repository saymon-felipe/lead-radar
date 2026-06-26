<template>
  <section class="fade-in-up">
    <header class="page-header">
      <div>
        <h1>Empresa</h1>
        <p>{{ authSession.state.user?.organizationName }}</p>
      </div>
      <button class="secondary" type="button" @click="load">
        <i class="ri-refresh-line"></i> Atualizar
      </button>
    </header>

    <div class="grid cols-2 organization-page">
      <form class="panel" @submit.prevent="createCompany">
        <h2><i class="ri-building-line"></i> Criar empresa</h2>
        <p class="muted">Cria uma nova empresa e muda sua sessão atual para ela como administrador.</p>
        <label>
          Nome da empresa
          <input v-model="companyForm.name" required placeholder="Ex: Sonus Prime" />
        </label>
        <p v-if="companyMessage" class="muted">{{ companyMessage }}</p>
        <button type="submit" :disabled="loadingCompany">
          <i class="ri-add-circle-line"></i> {{ loadingCompany ? "Criando..." : "Criar empresa" }}
        </button>
      </form>

      <form v-if="canInvite" class="panel" @submit.prevent="sendInvite">
        <h2><i class="ri-mail-send-line"></i> Convidar usuário</h2>
        <p class="muted">O convite é enviado por email. O link abre uma tela externa para login ou criação de conta.</p>
        <label>
          E-mail
          <input v-model="inviteForm.email" type="email" required placeholder="pessoa@empresa.com" />
        </label>
        <label>
          Papel
          <select v-model="inviteForm.role">
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <p v-if="inviteMessage" class="muted">{{ inviteMessage }}</p>
        <p v-if="lastDevInviteUrl" class="muted organization-page__dev-link">
          Link local: <a :href="lastDevInviteUrl" target="_blank">{{ lastDevInviteUrl }}</a>
        </p>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="loadingInvite">
          <i class="ri-send-plane-line"></i> {{ loadingInvite ? "Enviando..." : "Enviar convite" }}
        </button>
      </form>

      <div v-else class="panel">
        <h2><i class="ri-mail-lock-line"></i> Convites</h2>
        <p class="muted">Apenas admin e manager podem convidar usuários para a empresa.</p>
      </div>
    </div>

    <div v-if="canInvite" class="panel">
      <h2><i class="ri-team-line"></i> Membros</h2>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Entrada</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in members" :key="member.id">
              <td class="text-highlight">{{ member.name }}</td>
              <td>{{ member.email }}</td>
              <td><span class="badge">{{ member.role }}</span></td>
              <td>{{ new Date(member.createdAt).toLocaleDateString("pt-BR") }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <h2><i class="ri-inbox-line"></i> Convites</h2>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Status</th>
              <th>Expira em</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="invitation in invitations" :key="invitation.id">
              <td class="text-highlight">{{ invitation.email }}</td>
              <td><span class="badge">{{ invitation.role }}</span></td>
              <td>{{ invitation.acceptedAt ? "Aceito" : invitation.expired ? "Expirado" : "Pendente" }}</td>
              <td>{{ new Date(invitation.expiresAt).toLocaleDateString("pt-BR") }}</td>
            </tr>
            <tr v-if="!invitations.length">
              <td colspan="4" class="muted">Nenhum convite registrado.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { api, type OrganizationInvitation, type OrganizationMember, type OrganizationRole } from "../../services/api";
import { authSession } from "../../services/session";

export default defineComponent({
  name: "OrganizationView",
  data() {
    return {
      authSession,
      members: [] as OrganizationMember[],
      invitations: [] as OrganizationInvitation[],
      companyForm: {
        name: ""
      },
      inviteForm: {
        email: "",
        role: "operator" as OrganizationRole
      },
      loadingCompany: false,
      loadingInvite: false,
      companyMessage: "",
      inviteMessage: "",
      lastDevInviteUrl: "",
      error: ""
    };
  },
  mounted() {
    void this.load();
  },
  computed: {
    canInvite(): boolean {
      return ["admin", "manager"].includes(authSession.state.user?.role ?? "");
    }
  },
  methods: {
    async load() {
      this.error = "";
      this.members = await api.organizationMembers();
      this.invitations = this.canInvite ? await api.organizationInvitations().catch(() => []) : [];
    },
    async createCompany() {
      this.loadingCompany = true;
      this.companyMessage = "";
      this.error = "";
      try {
        const session = await api.createOrganization(this.companyForm);
        authSession.applySession(session);
        this.companyForm.name = "";
        this.companyMessage = "Empresa criada e sessão alterada.";
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao criar empresa";
      } finally {
        this.loadingCompany = false;
      }
    },
    async sendInvite() {
      this.loadingInvite = true;
      this.inviteMessage = "";
      this.lastDevInviteUrl = "";
      this.error = "";
      try {
        const invitation = await api.inviteOrganizationMember(this.inviteForm);
        this.inviteForm.email = "";
        this.inviteForm.role = "operator";
        this.inviteMessage = "Convite enviado.";
        this.lastDevInviteUrl = invitation.devInviteUrl ?? "";
        await this.load();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao enviar convite";
      } finally {
        this.loadingInvite = false;
      }
    }
  }
});
</script>
