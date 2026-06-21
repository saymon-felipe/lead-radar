<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="sidebar-inner">
        <div class="brand">
          <span class="brand-mark">LR</span>
          <div>
            <strong>Lead Radar</strong>
            <small>Operacao comercial</small>
          </div>
        </div>

        <div class="sidebar-section">
          <span class="sidebar-label">Navegacao</span>
          <nav class="nav">
            <RouterLink to="/dashboard">Dashboard</RouterLink>
            <RouterLink to="/campaigns">Campanhas</RouterLink>
            <RouterLink to="/leads">Leads</RouterLink>
          </nav>
        </div>

        <div class="sidebar-card">
          <span class="sidebar-label">Status</span>
          <strong>Acesso livre</strong>
          <p>Painel pronto para acompanhar campanhas, leads e o andamento do funil comercial.</p>
        </div>
      </div>
    </aside>

    <div class="shell-main">
      <header class="topbar">
        <div>
          <p class="topbar-kicker">Painel operacional</p>
          <h1>{{ pageTitle }}</h1>
        </div>

        <div class="topbar-actions">
          <div class="user-pill">
            <span class="user-avatar">{{ initials }}</span>
            <div>
              <strong>{{ authSession.state.user?.name }}</strong>
              <small>{{ authSession.state.user?.email }}</small>
            </div>
          </div>
        </div>
      </header>

      <main class="content-shell">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { authSession } from "./services/session";

const route = useRoute();

const pageTitle = computed(() => String(route.meta.title ?? "Lead Radar"));
const initials = computed(() =>
  (authSession.state.user?.name ?? "LR")
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
);
</script>
