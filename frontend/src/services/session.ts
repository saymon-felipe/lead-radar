import { computed, reactive } from "vue";
import { clearApiToken, type AuthSessionResponse, type AuthenticatedUser } from "./api";

const LOCAL_USER: AuthenticatedUser = {
  id: 1,
  name: "Operacao Lead Radar",
  email: "local@lead-radar.app",
  role: "admin",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
};

const state = reactive({
  ready: false,
  token: "",
  user: LOCAL_USER as AuthenticatedUser | null
});

async function bootstrap() {
  state.token = "";
  state.user = LOCAL_USER;
  clearApiToken();
  state.ready = true;
}

async function register(_: { name: string; email: string; password: string }) {
  await bootstrap();
  return {
    token: "",
    user: LOCAL_USER
  } satisfies AuthSessionResponse;
}

async function login(_: { email: string; password: string }) {
  await bootstrap();
  return {
    token: "",
    user: LOCAL_USER
  } satisfies AuthSessionResponse;
}

function logout() {
  state.token = "";
  state.user = LOCAL_USER;
  clearApiToken();
}

export const authSession = {
  state,
  isAuthenticated: computed(() => Boolean(state.user)),
  bootstrap,
  register,
  login,
  logout
};
