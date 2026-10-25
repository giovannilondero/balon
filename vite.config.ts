import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: true,
    proxy: { "/ws": { target: "ws://localhost:3001", ws: true } },
  },
});
