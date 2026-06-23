import { createRouter, createWebHistory } from "vue-router";
import { authSession } from "../services/session";
import DashboardView from "../views/Dashboard/DashboardView.vue";
import CampaignsView from "../views/Campaigns/CampaignsView.vue";
import LeadsView from "../views/Leads/LeadsView.vue";
import LeadDetailsView from "../views/LeadDetails/LeadDetailsView.vue";
import AuthView from "../views/Auth/AuthView.vue";
import InviteView from "../views/Invite/InviteView.vue";
import OrganizationView from "../views/Organization/OrganizationView.vue";
import CreateOrganizationView from "../views/Organization/CreateOrganizationView.vue";

const publicPaths = new Set(["/auth"]);

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/dashboard" },
    { path: "/auth", component: AuthView, meta: { title: "Acesso" } },
    { path: "/invite/:token", component: InviteView, props: true, meta: { title: "Convite", public: true } },
    { path: "/dashboard", component: DashboardView, meta: { title: "Dashboard" } },
    { path: "/campaigns", component: CampaignsView, meta: { title: "Campanhas" } },
    { path: "/organization", component: OrganizationView, meta: { title: "Empresa" } },
    { path: "/create-organization", component: CreateOrganizationView, meta: { title: "Criar Empresa" } },
    { path: "/leads", component: LeadsView, meta: { title: "Leads" } },
    { path: "/leads/:id", component: LeadDetailsView, props: true, meta: { title: "Detalhes do lead" } }
  ]
});

router.beforeEach(async (to) => {
  await authSession.bootstrap();
  const isPublic = Boolean(to.meta.public) || publicPaths.has(to.path);
  
  if (to.path === "/auth" && authSession.isAuthenticated.value) {
    const hasOrg = Boolean(authSession.state.user?.organizationId);
    return hasOrg ? "/dashboard" : "/create-organization";
  }
  
  if (!isPublic && !authSession.isAuthenticated.value) {
    return "/auth";
  }
  
  if (authSession.isAuthenticated.value) {
    const hasOrg = Boolean(authSession.state.user?.organizationId);
    if (!hasOrg && to.path !== "/create-organization" && !to.path.startsWith("/invite/")) {
      return "/create-organization";
    }
    if (hasOrg && to.path === "/create-organization") {
      return "/dashboard";
    }
  }
  
  return true;
});
