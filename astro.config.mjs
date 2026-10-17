// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// output: 'static' → todo se pre-renderiza en build time, ideal para hosting estático (Pages/R2/S3/GH Pages).
// DB queries corren en Bun al construir, no en runtime. La URL final es HTML+JSON estáticos.
export default defineConfig({
  output: 'static',
  // Base path para GitHub Pages user/repo → https://<user>.github.io/<repo>
  // Cambiar al nombre real del repo antes del primer deploy.
  base: process.env.BASE_PATH ?? '/ai-recommender',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
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
