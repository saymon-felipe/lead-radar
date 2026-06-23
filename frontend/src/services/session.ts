import { computed, reactive } from "vue";
import { api, clearApiToken, setApiToken, type AuthSessionResponse, type AuthenticatedUser } from "./api";

const TOKEN_KEY = "lead-radar.token";

const state = reactive({
  ready: false,
  token: localStorage.getItem(TOKEN_KEY) ?? "",
  user: null as AuthenticatedUser | null
});

function applySession(session: AuthSessionResponse) {
  state.token = session.token;
  state.user = session.user;
  localStorage.setItem(TOKEN_KEY, session.token);
  setApiToken(session.token);
}

async function bootstrap() {
  if (state.ready) return;
  if (!state.token) {
    clearApiToken();
    state.ready = true;
    return;
  }

  setApiToken(state.token);
  try {
    state.user = await api.me();
  } catch {
    logout();
  } finally {
    state.ready = true;
  }
}

async function register(payload: { name: string; email: string; password: string; organizationName?: string }) {
  const session = await api.register(payload);
  applySession(session);
  return session;
}

async function login(payload: { email: string; password: string }) {
  const session = await api.login(payload);
  applySession(session);
  return session;
}

function logout() {
  state.token = "";
  state.user = null;
  localStorage.removeItem(TOKEN_KEY);
  clearApiToken();
}

export const authSession = {
  state,
  isAuthenticated: computed(() => Boolean(state.user && state.token)),
  bootstrap,
  register,
  login,
  applySession,
  logout
};
