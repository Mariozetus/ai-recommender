# Architecture

> v0.1 — F2 in progress. Companion del README; detalles en `docs/`.

## Diagrama lógico

```mermaid
flowchart LR
  subgraph Upstream
    A1[models.dev/api.json]
    A2[litellm model_prices.json]
    A3[artificialanalysis.ai API]
    A4[LiveBench HF datasets]
    A5[replicate dump]
  end

  subgraph Pipeline[Github Actions · cron + manual]
    B1[Sync workers<br/>retry 3x · 5*(n+1)s]
    B2[Ajv schema validation]
    B3[Normalizer + alias table]
    B4[Snapshot inmutable]
    B5[sync_run + logs → R2]
  end

  subgraph Store
    C1[(D1 SQLite · prod)]
    C2[(SQLite local · dev)]
    C3[(R2 · raw artifacts)]
  end

  subgraph App[Astro · CF Pages]
    D1[Pages SSG<br/>i18n ES + EN]
    D2[API routes<br/>/api/health]
    D3[React islands<br/>recomendador · comparador · filtros]
  end

  A1 --> B1
  A2 --> B1
  A3 --> B1
  A4 --> B1
  A5 --> B1
  B1 --> B2 --> B3 --> B4
  B4 --> C1 & C2
  B1 --> C3
  B1 --> B5
  C1 & C2 --> D2
  C1 & C2 --> D3
```

## Decisiones clave

| Decisión | Por qué |
|----------|---------|
| **Bun runtime** | El sistema tiene `bun` nativo; SST/models.dev (referencia) corre sobre Bun. Más rápido que Node, TypeScript-first. |
| **Astro + React islands** | SSG para contenido educativo (SEO, 0 JS por defecto). React islands solo donde hay estado: comparador, recomendador, filtros. |
| **Drizzle ORM** | Type-safe, código de schema portable a otros dialectos, mismo DDL en dev (SQLite) y prod (D1). |
| **SQLite local + D1 prod** | Mismo dialecto, sin reescribir queries. `bun:sqlite` en dev, binding `DB` en CF Pages Workers. |
| **Snapshots inmutables** | Cualquier fila histórica se conserva; rollback = nuevo snapshot que la restaura. Ver `docs/SCHEMA.md`. |
| **`source_priority`** | Cuando dos fuentes discrepan (precio, capacidades), gana la de mayor prioridad. Valores en `db/schema.ts` y `db/seed.ts`. |
| **Sin auth** | localStorage + URL state para shortlist compartido. Mantiene BD mínima (modelos + benchmarks, no usuarios). |
| **CC0 datos** | Cualquiera puede reaprovechar el dataset construido; las fuentes conservadas en `source_url` dan atribución. |

## Capas

### 1. Datos (F0–F3)

- `drizzle/*.sql` — DDL origen de verdad.
- `db/schema.ts` — espejo Drizzle para queries.
- `seed/*.json` — snapshot manual inicial (F2); los syncs reales (F3) lo sobrescriben parcialmente.
- `sync/<source>.ts` — workers por fuente (F3).
- `db/data/ai-recommender.db` — gitignored, regenerable con `bun run db:reset`.

### 2. Aplicación (F2–F4)

- `src/pages/*` — rutas Astro: SSG para contenido, server endpoints para `/api/health`.
- `src/layouts/Layout.astro` — chrome común con i18n switcher.
- `src/i18n/{en,es}.json` — strings de UI. i18n routing via `astro.config.mjs > i18n`.
- `src/lib/i18n.ts` — helper `t()` tipado.
- (F4) `src/components/*` — islas React: filters, comparator, recommender UI.

### 3. Operación (F3+)

- `.github/workflows/sync-*.yml` — cron + manual dispatch.
- `wrangler.toml` — D1 binding, R2 binding opcional para artefactos.
- `docs/STATUS.md` — health vivo + próximos syncs esperados.

## Flujo de un sync (referencia)

```
cron → fetch (retry 3x) → parse → ajv schema check
  → normalize (slug + alias) → diff vs snapshot anterior
    → UPSERT model + offering + score (idempotente)
      → INSERT snapshot (status='applied')
        → INSERT sync_run (status='succeeded'|'partial'|'failed')
          → commit & PR if models_added > N
```

Total cost esperado: 5–10 min por fuente por ejecución diaria, ≈ $0/month en CF Pages free tier.

## Modo de fallo → mitigación

| Modo | Síntoma | Mitigación |
|------|---------|------------|
| API upstream caída | fetch fail 3× | `sync_run.status='failed'`, no commit, alerta Discord. |
| Schema upstream cambió | ajv rejects | Sync falla; schema actualizado por humano en PR. |
| D1 caída en deploy | `bun run dev` no se inicia local | Dev usa SQLite local, prod usa D1 binding; entornos aislados. |
| Discrepancia entre sources | `offering_conflicts` > 5% | Mostrar UI con ambos precios + ⚠; score usa prioridad. |

## Performance esperada

- Home `/`: <50 KB JS (solo i18n + Astro runtime, sin React island).
- `/status`: server-rendered; query a SQLite local (~5 ms en dev).
- `/api/health`: 1 query agregada, ~5 ms.
- (F4) Catalog y recommender: client island, sin recargas; tamaño de bundle objetivo < 60 KB gzip.

## Limitaciones conocidas

- Sin búsqueda full-text aún (F4).
- Sin UI de admin (no podemos editar modelos manualmente desde la web; toca `seed/*.json`).
- No hay webhooks de providers; polling diario.
- Sin telemetría; no sabemos qué recomendaciones convierten (F5+).
