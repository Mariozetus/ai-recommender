// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// output: 'static' → todas las páginas pre-renderizadas en build time, output a dist/.
// Pages son 100% Node-compatibles (JSON imports), no requieren adapter.
// Para dev/smoke CI: el dev server respeta query params (catalog/recommender).
// Para GH Pages: `BASE_PATH=/ai-recommender bun run build` produce dist/ con base path.
export default defineConfig({
  output: 'static',
  // Base path para GitHub Pages user/repo → https://<user>.github.io/<repo>
  // Default '' (sin prefijo) para dev. En CI, BASE_PATH=/ai-recommender.
  base: process.env.BASE_PATH ?? '',
  // Site URL (usado por hreflang/canonical/og:url absolutos). Override con SITE env.
  site: process.env.SITE ?? 'https://mariozetus.github.io/ai-recommender',
  integrations: [react()],
  vite: {
    plugins: [/** @type {any} */ (tailwindcss())],
    resolve: {
      alias: {
        '~data': /** @type {any} */ (new URL('./src/lib/data', import.meta.url).pathname),
      },
    },
    optimizeDeps: {
      exclude: ['src/lib/recommender.ts', 'src/lib/cost.ts', 'src/lib/i18n.ts'],
    },
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
