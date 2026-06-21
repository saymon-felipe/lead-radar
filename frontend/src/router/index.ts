import { createRouter, createWebHistory } from "vue-router";
import { authSession } from "../services/session";
import DashboardView from "../views/Dashboard/DashboardView.vue";
import CampaignsView from "../views/Campaigns/CampaignsView.vue";
import LeadsView from "../views/Leads/LeadsView.vue";
import LeadDetailsView from "../views/LeadDetails/LeadDetailsView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/dashboard" },
    { path: "/auth", redirect: "/dashboard" },
    { path: "/dashboard", component: DashboardView, meta: { title: "Dashboard" } },
    { path: "/campaigns", component: CampaignsView, meta: { title: "Campanhas" } },
    { path: "/leads", component: LeadsView, meta: { title: "Leads" } },
    { path: "/leads/:id", component: LeadDetailsView, props: true, meta: { title: "Detalhes do lead" } }
  ]
});

router.beforeEach(async (to) => {
  await authSession.bootstrap();
  if (to.path === "/auth") {
    return "/dashboard";
  }
  return true;
});
