import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { authSession } from "./services/session";
import "./styles.css";

void authSession.bootstrap().finally(() => {
  createApp(App).use(router).mount("#app");
});
