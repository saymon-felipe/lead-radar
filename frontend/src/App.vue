<template>
  <RouterView v-if="isAuthRoute" />
  <div v-else class="shell">
    <!-- Backdrop overlay for mobile sidebar -->
    <div v-if="isSidebarOpen" class="sidebar-overlay" @click="closeSidebar"></div>

    <aside class="sidebar" :class="{ open: isSidebarOpen }">
      <div class="sidebar-inner">
        <div class="brand">
          <span class="brand-mark"><i class="ri-radar-line"></i></span>
          <div>
            <strong>Lead Radar</strong>
            <small>Operação comercial</small>
          </div>
        </div>

        <div class="sidebar-section">
          <span class="sidebar-label">Navegação</span>
          <nav class="nav">
            <RouterLink to="/dashboard" @click="closeSidebar">
              <i class="ri-dashboard-3-line"></i>
              Dashboard
            </RouterLink>
            <RouterLink to="/campaigns" @click="closeSidebar">
              <i class="ri-rocket-2-line"></i>
              Campanhas
            </RouterLink>
            <RouterLink to="/leads" @click="closeSidebar">
              <i class="ri-user-search-line"></i>
              Leads
            </RouterLink>
            <RouterLink to="/organization" @click="closeSidebar">
              <i class="ri-building-line"></i>
              Empresa
            </RouterLink>
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
        <div class="topbar-left">
          <button class="hamburger-btn" type="button" @click="toggleSidebar">
            <i class="ri-menu-line"></i>
          </button>
          <div>
            <p class="topbar-kicker">Painel operacional</p>
            <h1>{{ pageTitle }}</h1>
          </div>
        </div>

        <div class="topbar-actions">
          <div class="dropdown-wrapper">
            <button class="user-pill" type="button" @click="toggleDropdown">
              <span class="user-avatar"><i class="ri-user-line"></i></span>
              <div>
                <strong>{{ authSession.state.user?.name }}</strong>
                <small>{{ authSession.state.user?.organizationName ?? 'Sem empresa' }}</small>
              </div>
              <i class="ri-arrow-down-s-line dropdown-arrow" :class="{ rotated: isDropdownOpen }"></i>
            </button>
            
            <div v-if="isDropdownOpen" class="dropdown-menu">
              <div class="dropdown-header">
                <strong>{{ authSession.state.user?.name }}</strong>
                <span>{{ authSession.state.user?.email }}</span>
              </div>
              
              <div class="dropdown-divider"></div>
              
              <div class="dropdown-section">
                <span class="dropdown-label">Minhas Empresas</span>
                <div class="org-list">
                  <button 
                    v-for="org in organizations" 
                    :key="org.id" 
                    class="org-item"
                    :class="{ active: org.id === authSession.state.user?.organizationId }"
                    type="button"
                    @click="selectOrganization(org.id)"
                  >
                    <i class="ri-building-line"></i>
                    <span class="org-name">{{ org.name }}</span>
                    <i v-if="org.id === authSession.state.user?.organizationId" class="ri-checkbox-circle-fill active-check"></i>
                  </button>
                </div>
              </div>
              
              <div class="dropdown-divider"></div>
              
              <RouterLink to="/create-organization" class="dropdown-action" @click="closeDropdown">
                <i class="ri-add-circle-line"></i> Criar nova empresa
              </RouterLink>
              
              <button class="dropdown-action danger" type="button" @click="logout">
                <i class="ri-logout-box-r-line"></i> Sair
              </button>
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
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { authSession } from "./services/session";
import { api, type UserOrganization } from "./services/api";

const route = useRoute();

const pageTitle = computed(() => String(route.meta.title ?? "Lead Radar"));
const isAuthRoute = computed(() => route.path === "/auth" || route.path.startsWith("/invite/") || route.path === "/create-organization");

// Sidebar collapsible state
const isSidebarOpen = ref(false);
function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value;
}
function closeSidebar() {
  isSidebarOpen.value = false;
}

// User / Organization Dropdown
const isDropdownOpen = ref(false);
const organizations = ref<UserOrganization[]>([]);

async function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value;
  if (isDropdownOpen.value) {
    try {
      organizations.value = await api.listOrganizations();
    } catch (err) {
      console.error("Failed to load organizations:", err);
    }
  }
}

function closeDropdown() {
  isDropdownOpen.value = false;
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest(".dropdown-wrapper")) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

async function selectOrganization(orgId: number) {
  if (orgId === authSession.state.user?.organizationId) return;
  try {
    const session = await api.switchOrganization(orgId);
    authSession.applySession(session);
    closeDropdown();
    window.location.href = "/dashboard";
  } catch (err) {
    console.error("Failed to switch organization:", err);
  }
}

function logout() {
  authSession.logout();
  window.location.href = "/auth";
}
</script>
