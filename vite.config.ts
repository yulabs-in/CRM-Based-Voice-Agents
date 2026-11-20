// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// The Lovable config only exposes VITE_* variables. Load server-side settings from .env / .env.local
// (SUPABASE_SERVICE_ROLE_KEY, SARVAM_API_KEY, PUBLIC_APP_URL…) into process.env for local dev and builds.
// Real environment variables (e.g. host secrets) always win.
const fileEnv = loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", process.cwd(), "");
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Let Sarvam reach the local dev server through a Cloudflare quick tunnel (PUBLIC_APP_URL).
    server: { allowedHosts: [".trycloudflare.com"] },
  },
});
