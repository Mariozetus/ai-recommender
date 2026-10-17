// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// output: 'server' → todas las páginas server-rendered por defecto. Dev respeta query params (catalog, recommender).
// Build requiere adapter (no incluido en MVP: deploy a Node host externo o Cloudflare con adapter swap).
// El smoke CI solo corre dev/tests, no el build.
export default defineConfig({
  output: 'server',
  // Base path para GitHub Pages user/repo → https://<user>.github.io/<repo>
  // Default '' (sin prefijo) para dev. En CI, BASE_PATH=/ai-recommender.
  base: process.env.BASE_PATH ?? '',
  integrations: [react()],
  vite: {
    plugins: [/** @type {any} */ (tailwindcss())],
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
});
