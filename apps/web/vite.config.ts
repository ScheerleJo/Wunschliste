import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { APP_NAME, APP_TAGLINE } from "../../packages/shared/src/index.ts";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // App-Name aus packages/shared in die index.html einsetzen
      name: "app-name",
      transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", APP_NAME).replaceAll("%APP_TAGLINE%", APP_TAGLINE),
    },
  ],
  server: {
    port: 5173,
    host: true,
    // In der Entwicklung leitet Vite API-Aufrufe an den Node-Server weiter
    proxy: { "/api": "http://localhost:3000" },
  },
});
