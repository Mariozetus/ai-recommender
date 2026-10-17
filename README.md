# AI Recommender

> Encuentra el modelo de IA que encaja con tu trabajo — y tu bolsillo.

Catálogo auto‑actualizado de modelos de IA (texto + visión + embeddings + capacidades agenticas), recomendador explicable y sección educativa de conceptos. Sin login, sin tracking, datos abiertos.

- **Stack:** Astro 5 · React islands · Tailwind v4 · Drizzle ORM · SQLite (dev) / Cloudflare D1 (prod) · Bun runtime.
- **Licencia:** código MIT, datos CC0.
- **Idiomas:** español + inglés desde día 1.

## Quickstart

```bash
# Requisitos: Bun >= 1.1
bun install
bun run db:migrate
bun run db:seed
bun run dev          # http://localhost:4321

# Build estático (para GH Pages / R2 / S3 / cualquier static host)
bun run build:data   # vuelca health/models/etc a public/
bun run build        # pre-renderiza 54 páginas a dist/
bun run preview      # sirve dist/ en :4321

# Tests
bun test            # 22 unit tests del recomendador (9ms)
bun run smoke       # 22 asserts E2E (reset+sync+seed+start+curl)
```

## Deploy

### GitHub Pages (recomendado para MVP)

El workflow `.github/workflows/deploy.yml` se dispara en cada push a `main`:
1. `bun install`
2. `bun run db:reset` + `bun run sync/modelsdev.ts` + `bun run db/seed-pages.ts`
3. `bun run build:static` con `BASE_PATH=/${{ github.event.repository.name }}`
4. `bun run preview` + smoke
5. Sube `dist/` a GitHub Pages

**Setup inicial** (una vez):
```bash
# En GitHub repo → Settings → Pages → Source: GitHub Actions
# Confirmar que el repo se llama "ai-recommender" (o cambiar BASE_PATH en astro.config.mjs)
git push origin main  # trigger el workflow
# URL final: https://<tu-usuario>.github.io/ai-recommender
```

### Cloudflare Pages (alternativa, sin dominio custom)
```bash
wrangler pages deploy dist --project-name=ai-recommender
```
Requiere refactor `bun:sqlite` → D1 binding (Drizzle driver dual). Documentado en `docs/PIPELINE.md`.

## Estructura

```
.
├── astro.config.mjs
├── db/
│   ├── schema.ts                 # Drizzle mirror de drizzle/*.sql
│   ├── migrate.ts                # Aplica migrations a SQLite local
│   └── seed.ts                   # Carga el seed inicial
├── drizzle/
│   └── 0001_init.sql             # DDL versionado (origen de verdad)
├── docs/                         # Diseño (F1)
│   ├── SCHEMA.md
│   ├── PIPELINE.md
│   ├── RECOMMENDER.md
│   └── STATUS.md
├── seed/                         # Snapshot manual inicial
│   ├── providers.json
│   ├── benchmarks.json
│   └── models.json
├── src/
│   ├── i18n/{en,es}.json
│   ├── layouts/Layout.astro
│   ├── lib/i18n.ts
│   ├── pages/
│   │   ├── index.astro
│   │   ├── status.astro
│   │   └── api/health.ts
│   └── styles/global.css
├── sync/                         # (F3) workers por fuente
├── wrangler.toml                 # CF Pages + D1 binding
└── package.json
```

## URLs

| Locale | URL                  | Descripción                                        |
|--------|----------------------|----------------------------------------------------|
| en     | `/en`                | Home                                               |
| en     | `/en/status`         | Pipeline status panel                              |
| es     | `/es`                | Home                                               |
| es     | `/es/status`         | Pipeline status panel                              |
| *      | `/api/health`        | JSON health (synced per source, totals, conflicts) |

## Pipeline

Sincronización diaria desde [models.dev](https://models.dev), [LiteLLM](https://github.com/BerriAI/litellm), [Artificial Analysis](https://artificialanalysis.ai), [LiveBench](https://github.com/LiveBench/LiveBench). Configurable via GH Actions. Ver `docs/PIPELINE.md`.

## Roadmap

| Fase | Estado | Contenido                                       |
|------|--------|-------------------------------------------------|
| F0   | ✅     | Definición, selección de stack, investigación |
| F1   | ✅     | Schema, pipeline, recomendador (docs)           |
| F2   | 🚧     | Bootstrap, seed, status, i18n shell             |
| F3   | ⏳     | Primer sync real (models.dev), GH Actions        |
| F4   | ⏳     | Catálogo interactivo, recomendador UI, glosario  |
| F5   | ⏳     | QA end-to-end, deploy público                    |

## Contribuir

PRs bienvenidos. Para añadir un modelo manualmente, edita `seed/models.json` y ejecuta `bun run db:seed`.

## Privacidad

- Sin auth, sin cookies de terceros.
- Sin telemetría.
- localStorage solo para "shortlist" personal; el usuario puede borrar.

## Atribuciones de datos

Datos derivados de registros públicos:

- [sst/models.dev](https://github.com/sst/models.dev) — MIT
- [BerriAI/litellm](https://github.com/BerriAI/litellm) — MIT (core)
- [Artificial Analysis](https://artificialanalysis.ai) — consultado vía su API pública
- [LiveBench](https://github.com/LiveBench/LiveBench) — license permisiva, ver repo

Cualquier fila conservamos su `source_url` original para auditoría.
