# Repository Guidelines

> AI-assistant-targeted guide to the `ai-recommender` codebase. Astro 5 static site, Bun runtime, i18n EN/ES, deploys to GitHub Pages.

## Project Overview

**ai-recommender** is a fully static, no-login, no-backend public web tool that helps people understand AI models and pick one. Three pillars: educational glossary, side-by-side catalog, and a quiz-based recommender with a 6×5×4 input space. Data is auto-synced daily from `models.dev` (and a seed of curated handpicked models) and rebuilt into static JSON+TS modules on every CI run. Live at `https://mariozetus.github.io/ai-recommender/`.

## Architecture & Data Flow

```
models.dev API ──┐
                 ├──▶ sync/modelsdev.ts ──▶ SQLite (db/data/ai-recommender.db)
curated seed ────┘                              │
                                                ▼
                               scripts/build-data.ts (READ-ONLY sqlite query)
                                                │
                       ┌────────────────────────┼─────────────────────────────┐
                       ▼                        ▼                             ▼
           src/lib/data/*.ts            public/data/                 public/api/
           (imported by .astro          catalog-lite.json            health.json
            components in               compare.json                  (prerender)
            build-time)                 benchmarks.json
                                       providers.json
                                       snapshots.json
                                       concepts.json
                                                │
        ┌───────────────────────────────────────┼────────────────────────────────┐
        ▼                                       ▼                                ▼
  Astro pages (pre-render)            /catalog client filter            /compare client
  /  /catalog  /recommender           src/scripts/catalog-filter.ts     src/scripts/compare.ts
  /compare  /status  /concepts         (lazy-fetch + cache + re-render)  (lazy-fetch + cache)
  /api/health (prerender)
```

**Key invariants:**
- The DB exists at build time only; production has no DB, no Node, no server.
- `src/lib/data/*.ts` files are generated; **do not edit by hand** (header says so).
- All internal navigation uses `path(locale, p)` from `src/lib/i18n.ts` so the base path (`/ai-recommender`) and locale prefix (`/es`) are composed correctly.
- `output: 'static'` means query params are NOT honored at build time. Filter/compare UIs run client-side over the lazy-fetched JSON.

## Key Directories

| Path | Purpose | Edit by hand? |
|---|---|---|
| `src/pages/` | Astro pages. EN at root, ES at `es/`. `index.astro`, `catalog.astro`, `recommender.astro`, `compare.astro`, `status.astro`, `concepts/[slug].astro`, `api/health.ts`. | yes |
| `src/layouts/Layout.astro` | Site shell: header nav, footer, hreflang/canonical/og:url. | yes |
| `src/lib/i18n.ts` | `t()`, `pickLocale()`, **`path(locale, p)`** URL helper. Pure, no DOM. | yes |
| `src/lib/cost.ts` | `monthlyCostUsd()`, `costLabel()`, `VOLUME_BINS` (`free/low/middle/premium/no-limit`). | yes |
| `src/lib/recommender.ts` | `recommend(quiz, candidates)`, `parseQuizFromUrl()`. Pure scoring; ~12KB. | yes |
| `src/lib/data/index.ts` | Typed re-exports of the 6 generated `*.ts` data modules. | yes |
| `src/lib/data/*.ts` | **Generated** by `scripts/build-data.ts`. `// GENERATED ... Do not edit.` | NO |
| `src/scripts/` | Client-side: `catalog-filter.ts` (lazy-fetch + filter + re-render the catalog table), `compare.ts` (lazy-fetch + side-by-side render + URL state + localStorage). | yes |
| `src/i18n/{en,es}.json` | String tables; dotted keys (`catalog.filter.apply`). | yes |
| `public/data/*.json` | **Generated** JSON, served as static. `catalog-lite.json` (1.6MB), `compare.json` (1.4MB), `benchmarks.json` (765B), `models.json` (4.7MB), `providers.json` (19KB), `concepts.json` (26KB), `snapshots.json` (315B). | NO |
| `public/api/health.json` | **Generated** health snapshot. | NO |
| `tests/` | `recommender.test.ts` only (22 unit tests). | yes |
| `scripts/` | `build-data.ts` (main pipeline), `build-data-lite.ts`, `build-data-compare.ts`, `smoke.ts` (E2E). | yes |
| `db/` | Drizzle: `schema.ts`, `migrate.ts`, `seed.ts`, `seed-pages.ts`. | yes |
| `sync/` | External data fetchers: `modelsdev.ts` (HTML scraper → JSON via `models.dev/api.json`). | yes |
| `drizzle/` | SQL migrations (0001_init.sql). | NO (managed by drizzle-kit) |
| `docs/` | Living design docs: `PIPELINE.md`, `SCHEMA.md`, `RECOMMENDER.md`, `STATUS.md`, `ROADMAP.md`. | yes |
| `.github/workflows/` | `ci.yml` (test + smoke), `pages build and deployment` (auto GH Pages), `sync-modelsdev.yml` (manual trigger for sync). | yes |

## Development Commands

| Task | Command |
|---|---|
| **Full pipeline (DB reset → sync → seed pages → build data → build site)** | `bun run build:data && bun run build` (or `bun run build:static`) |
| **Dev server** | `bun run dev` (port 4321) |
| **Build (assumes data already built)** | `bun run build` |
| **Unit tests** | `bun test` |
| **E2E smoke** (boots dev + asserts HTTP) | `bun run smoke` |
| **Typecheck** | `bunx astro check` |
| **DB reset** | `bun run db:reset` (rm + migrate + seed) |
| **DB migrate** | `bun run db:migrate` |
| **DB seed** | `bun run db:seed` |
| **DB studio** (Drizzle visual) | `bun run db:studio` |
| **Manual sync** (e.g., from a CI dispatch) | `bun run sync/modelsdev.ts` |
| **Lint** | `eslint .` (ESLint 9, no Prettier/Biome) |

**CI triggers**: push to `main` runs `ci` (test+smoke+build+deploy to GH Pages) and the auto `pages build and deployment`. Manual `sync-modelsdev` workflow can be dispatched.

## Code Conventions & Common Patterns

### TypeScript
- Extends `astro/tsconfigs/strict`. `noUncheckedIndexedAccess: true` — **`arr[i]` is `T | undefined`**, guard or assert.
- `allowImportingTsExtensions: true` — imports can use `.ts` extension.
- `moduleResolution: "bundler"`. Path alias `~/*` → `src/*` (tsconfig), `~data` → `./src/lib/data` (Vite alias).
- `@types/bun` is globally available; prefer Bun APIs (`Bun.serve`, `Bun.file`, `bun:sqlite`) over Node equivalents in scripts/db/sync.

### Imports
- **Static imports only** for known modules. No `await import('./foo')` with literal paths.
- **Top-level `import type`** for type-only dependencies. Never `import('pkg').Type` inside signatures.

### Functions
- **No one-line wrappers.** If a function body is one expression, inline it at the call site unless: it has 3+ call sites needing lockstep behavior, it's an exported domain concept, it's a public API / test seam, or the name documents a non-obvious formula.
- **Named return types for non-trivial signatures.** Avoid `ReturnType<typeof fn>` across module boundaries; export a named interface from the owner module.

### Data structures
- `Record<string, V>` for static string-keyed lookups. `Set`/`Map` only when you need `.size`, `.clear()`, dynamic insertion, non-string keys, or stable insertion order.

### URLs
- Always compose URLs with `path(locale, p)` from `src/lib/i18n.ts`. Never hardcode `/catalog` or `/es/...` in hrefs.
- The helper reads `import.meta.env.BASE_URL` (set via `astro.config.mjs base: process.env.BASE_PATH ?? ''`) and adds `/es` only for non-default locales.
- For Astro server-side rendering of hreflang/canonical/og:url, use `Astro.site?.origin` (not a hardcoded domain).

### i18n
- All user-facing strings go in `src/i18n/{en,es}.json` with dotted keys (`section.subsection.label`).
- In `.astro` files: `const dict = (key: string) => t(locale, key);` then `{dict('catalog.title')}`.
- In client scripts: pass i18n via `<script define:vars={{ catalogI18n: { ... } }}>`. The bundle will inline the JSON.

### Client-side data loading
- Lazy-fetch `public/data/*.json` on first user action or first render with query params.
- Cache the data in a module-level variable, share the in-flight promise to avoid concurrent fetches.
- Re-render via `innerHTML` of a `<tbody>` / container element, with `data-*` attrs as hooks.
- Use `data-catalog-filter`, `data-catalog-tbody`, `data-compare-root`, `data-compare-grid`, etc. — the script queries these, the page owns the markup.

### Generated data
- `src/lib/data/*.ts` and `public/data/*.json` are produced by `scripts/build-data.ts`. They are **checked into the repo** so the build works without re-running the pipeline locally. CI regenerates and overwrites them on every run.
- The generator reads SQLite (read-only) and emits both `.ts` (with `export default …` so Vite handles them reliably for large JSON) and `.json` (for client-side fetch).

### Errors / fallback
- `t(locale, key)` returns the raw key as last resort — UI shows `catalog.title` if missing instead of crashing.
- `recommend()` returns `[]` for empty input; never throws.
- Client scripts render an explicit "Could not load" row on fetch failure and surface the error via `loadingEl`.

### Async
- `scripts/smoke.ts` is `async/await` top-level (Bun supports it). All other scripts are `async function main() { ... }` with `await main()` at the bottom.

## Important Files

- `astro.config.mjs` — `output: 'static'`, `base: process.env.BASE_PATH ?? ''`, `site: process.env.SITE ?? 'https://mariozetus.github.io/ai-recommender'`, `integrations: [react()]`, Vite `~data` alias, `optimizeDeps.exclude: ['src/lib/recommender.ts', 'src/lib/cost.ts', 'src/lib/i18n.ts']`.
- `tsconfig.json` — strict + `noUncheckedIndexedAccess`, `~/*` alias, `types: ["@cloudflare/workers-types", "@types/bun"]`.
- `src/layouts/Layout.astro` — site shell, language toggle, `path()` everywhere, `og:url` + canonical + hreflang.
- `src/lib/i18n.ts` — `path(locale, p)` is the canonical URL builder.
- `src/lib/recommender.ts` — pure scoring, 12KB, 22 unit tests cover it.
- `src/lib/data/index.ts` — typed re-exports of the 6 generated data modules.
- `scripts/build-data.ts` — main pipeline. Calls `buildDataLite()` and `buildDataCompare()` at the end.
- `scripts/smoke.ts` — E2E smoke. Boots dev server, waits `/api/health=200`, asserts catalog/compare/recommender/concepts/status endpoints + data JSONs.
- `.github/workflows/ci.yml` — runs `bun install`, `bun test`, `db:reset`, `sync/modelsdev`, `build:data`, `smoke`.
- `.github/workflows/deploy.yml` — `test` + `build` + GH Pages upload (depends on test).
- `db/schema.ts` — Drizzle: `provider`, `model`, `model_provider_offering`, `model_benchmark_score`, `benchmark`, `snapshot`, `sync_run`, `page_content`, `deprecation_event`.
- `drizzle/0001_init.sql` — initial migration.
- `docs/ROADMAP.md` — vision, current state, sprint roadmap, backlog, no-goals, open questions. Update at end of each sprint.

## Runtime / Tooling Preferences

- **Bun, not Node.** `package.json` scripts use `bun`. `@types/bun` is in `devDependencies`. Tests use `bun test`. Dev DB is `bun:sqlite`. CI installs via `oven-sh/setup-bun@v2`.
- **No packageManager field** in package.json; `bun install` is the install command.
- **No Prettier, no Biome.** Lint is ESLint 9 only (`eslint .`). Formatting is not enforced by tooling — follow the existing style (2-space indent, single quotes, no semicolons in `astro` frontmatter, semicolons in `.ts`).
- **No coverage tooling.** No threshold. CI runs `bun test` for the unit tests and `bun run smoke` for E2E.
- **Two SSR adapters present in deps** (`@astrojs/cloudflare`, `@astrojs/node`) but **not wired** under `output: 'static'`. Do not add them to `astro.config.mjs` adapters unless you change `output` to `'server'`.
- **Tailwind v4** via `@tailwindcss/vite`, not the Astro integration. Custom theme tokens live in `src/styles/global.css` (CSS variables: `--color-fg`, `--color-muted`, `--color-border`, `--color-surface`, `--color-accent`, `--color-success`, `--color-warning`, `--color-error`).
- **React 18** for the React island in the recommender. The rest is plain Astro.
- **No tracking, no analytics, no cookies.** This site has no third-party scripts.

## Testing & QA

### Unit tests (`bun test`)

- Single file: `tests/recommender.test.ts`, 22 tests, ~9.5KB.
- Framework: `bun:test` built-ins (`describe`, `test`, `expect`).
- Patterns:
  - **Pure-function black-box.** No mocks, no spies, no async. The recommender is pure; tests pass synthetic `Candidate[]` and assert on `Recommendation[]`.
  - **Fixed fixtures inline.** `ZERO_FLAGS: ModelFlags`, `mk(over)` factory, 6 hardcoded `CANDIDATES` covering branches (proprietary with FC/vision, open-source $0, embedding-only, code-no-fc negative test).
  - **Floating-point via `toBeCloseTo(expected, 2)`.** Negation via `.toBeUndefined()` against known fixture IDs.
- Adding a test: drop a new `describe()` block in `tests/recommender.test.ts`. No mocks framework, no fixtures files. Bun's discovery is glob `*.test.ts`.

### E2E smoke (`bun run smoke`)

- `scripts/smoke.ts` is the smoke harness. It runs the full pipeline: `db:reset` → `sync/modelsdev` → `seed-pages` → spawn `astro dev` on `:4321` → poll `/api/health=200` (60s) → run ~30 HTTP asserts → kill server.
- Asserts:
  - `/api/health` returns `status: ok`, `db: true`, `models >= 1000`, `active_offerings >= 1000`, `sources.models.dev.last_status === 'succeeded'`.
  - `/catalog` 200, contains `data-catalog-filter` + `initCatalogFilter`, SSR renders 10+ rows.
  - `/data/catalog-lite.json` 200, 1000+ rows, < 2MB, schema with short keys `i/n/p`.
  - `/compare` 200, contains `data-compare-root` + `initCompare`.
  - `/data/compare.json` 200, 5000+ models, schema with `i/n/bs/bp/fl`, has at least one model with benchmark scores.
  - `/recommender` 200, shows the quiz form.
  - `/concepts/transformer` 200 in both EN and ES.
  - `/concepts/nonexistent` returns 404.
  - `/status` and `/es/status` both 200.

### Adding a smoke assert

- Open `scripts/smoke.ts`, add a `check(cond, msg)` line in the right block. Use `get(url)` (defined at the top, has 10s timeout). Don't add a real test framework — the script is intentionally hand-rolled.
- New JSON datasets under `public/data/` should be smoke-checked: `200`, `length >= N`, `schema presence` (e.g., `'i' in firstRow`).

### Pre-commit checklist

1. `bunx astro check` — 0 errors expected. (Hints are fine.)
2. `bun test` — 22/22 expected. Add tests if you change `src/lib/recommender.ts`.
3. `bun run smoke` — 30/30 expected. Update if you change a page or add a JSON dataset.
4. `bun run build` — 34 pages expected, no errors. If the page count changes, update `docs/STATUS.md`.
5. Manual sanity check: load `/`, switch EN↔ES, click around, verify all internal links are `/ai-recommender/...` (no `/en` or `/es` absolute paths).

### CI

- PR/push to `main` triggers `ci` (typecheck + test + smoke + build + deploy). The `pages build and deployment` action runs in parallel and auto-deploys to GH Pages.
- Workflows: `ci.yml` (the local pipeline), `pages build and deployment` (auto, on push to main), `sync-modelsdev.yml` (manual `workflow_dispatch` for out-of-band sync).
- Required GH Pages environment: `github-pages` (created automatically on first deploy). No secrets needed.
- `concurrency: deploy-pages` cancels in-flight deploys when a new push lands.
