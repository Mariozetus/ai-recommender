# Schema del catálogo

> Estado: v0.1 (F1). Se itera con cualquier cambio en alcance; ver `README.md` para visión global.

## Principios

1. **Identidad desacoplada del nombre comercial.** La `model.id` canónica es estable; los aliases se resuelven en tabla aparte. Esto protege contra renames upstream (e.g. `gpt-5-2` → `gpt-5.2`, `z-ai/*` → `zai/*`).
2. **Snapshot inmutable por fuente.** Cada ejecución de un sync produce un `snapshot` con `status = draft|validated|applied|rolled-back`. Los scores y precios nunca se borran: se desmarcan con `deprecation_date` o se "rollbackan" con un snapshot nuevo que restaura el anterior.
3. **Trazabilidad por fila.** Toda celda derivada lleva `source_url` + `fetched_at` + (cuando exista) `source_priority`. Si dos fuentes discrepan, gana la de mayor prioridad y se conserva el resto en `_conflicts`.
4. **Deduplicación por `(model, benchmark, snapshot)` y `(model, provider, region)`.** Estas tripletas son las unicas claves únicas funcionales.
5. **Schema versionado.** Cada `snapshot` lleva `source_version`. Migrar el schema upstream es no-breaking si versionamos también nuestros DDL (`migrations/00X_*.sql`).

## Diagrama entidad-relación (resumen)

```mermaid
erDiagram
  provider ||--o{ model_provider_offering : offers
  model ||--o{ model_provider_offering : priced_at
  model ||--o{ model_benchmark_score : scored_in
  benchmark ||--o{ model_benchmark_score : measures
  snapshot ||--o{ model_benchmark_score : captured_in
  snapshot ||--o{ model_provider_offering : captured_in
  model ||--o{ model_alias : known_as
  sync_run ||--o{ snapshot : produces

  provider {
    TEXT id PK
    TEXT name
    TEXT type -- cloud-api | self-hosted | hybrid
    TEXT homepage_url
    TEXT docs_url
    TEXT api_docs_url
    TEXT icon_url
    TEXT status -- active | deprecated
  }
  model {
    TEXT id PK
    TEXT family
    TEXT name
    TEXT description
    TEXT homepage_url
    TEXT hf_repo
    TEXT license
    TEXT parameter_count
    INTEGER context_window
    INTEGER max_output
    TEXT release_date
    TEXT deprecation_date
    -- modalities (1 fila cada uno)
    INTEGER mod_text_in
    INTEGER mod_text_out
    INTEGER mod_image_in
    INTEGER mod_image_out
    INTEGER mod_audio_in
    INTEGER mod_audio_out
    INTEGER mod_embedding
    -- capabilities
    INTEGER cap_function_calling
    INTEGER cap_json_mode
    INTEGER cap_system_messages
    INTEGER cap_prompt_caching
    INTEGER cap_reasoning
    INTEGER cap_tool_browse
    INTEGER cap_tool_code_exec
    INTEGER cap_tool_file_search
    INTEGER cap_long_horizon
  }
  model_provider_offering {
    TEXT id PK
    TEXT model_id FK
    TEXT provider_id FK
    TEXT region
    REAL input_cost_per_million_usd
    REAL output_cost_per_million_usd
    REAL cache_read_cost_per_million_usd
    INTEGER context_window
    INTEGER max_output
    TEXT rate_limit
    TEXT status -- active | preview | deprecated
    TEXT deprecation_date
    INTEGER source_priority
    TEXT source_url
    TEXT fetched_at
  }
  benchmark {
    TEXT id PK
    TEXT name
    TEXT category -- general|coding|math|reasoning|agent|long-context|multilingual|vision|live
    TEXT source_url
    TEXT description
    INTEGER higher_is_better
    TEXT unit
    TEXT cost_dimension -- task | 1m-tokens | NULL
  }
  model_benchmark_score {
    INTEGER id PK
    TEXT model_id FK
    TEXT benchmark_id FK
    TEXT snapshot_id FK
    REAL score
    REAL ci_low
    REAL ci_high
    INTEGER rank_in_benchmark
    REAL cost_normalized -- $/task si aplica
    TEXT source_url
    TEXT fetched_at
  }
  snapshot {
    TEXT id PK -- 2026-10-16-modelsdev
    TEXT taken_at
    TEXT source -- models.dev|litellm|aa|livebench|manual-seed
    TEXT source_version
    TEXT parent_snapshot
    TEXT raw_artifact_url
    TEXT status -- draft|validated|applied|rolled-back
    TEXT diff_summary -- JSON {added, updated, removed, aliases_resolved}
    TEXT created_at
  }
  model_alias {
    TEXT alias
    TEXT source -- models.dev|litellm|aa|hf|manual
    TEXT model_id FK
  }
  sync_run {
    TEXT id PK
    TEXT source
    TEXT trigger -- cron|manual|webhook
    TEXT started_at
    TEXT finished_at
    TEXT status -- running|succeeded|failed|partial
    INTEGER models_fetched
    INTEGER models_added
    INTEGER models_updated
    TEXT errors_json
    TEXT logs_url
  }
  page_content {
    TEXT slug
    TEXT locale -- es|en
    TEXT title
    TEXT body_md
    TEXT updated_at
  }
```

## DDL SQLite inicial (`migrations/0001_init.sql`)

> Drizzle-kit generará esto desde `db/schema.ts`. Lo dejo aquí legible para revisión humana.

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE provider (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('cloud-api','self-hosted','hybrid')),
  homepage_url TEXT,
  docs_url     TEXT,
  api_docs_url TEXT,
  icon_url     TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE model (
  id               TEXT PRIMARY KEY,
  family           TEXT,
  name             TEXT NOT NULL,
  description      TEXT,
  homepage_url     TEXT,
  hf_repo          TEXT,
  license          TEXT,
  parameter_count  TEXT,
  context_window   INTEGER,
  max_output       INTEGER,
  release_date     TEXT,
  deprecation_date TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_model_family ON model(family);
CREATE INDEX idx_model_license ON model(license);

-- Una columna por modality para legibilidad de queries; costes de NULL triviales.
ALTER TABLE model ADD COLUMN mod_text_in     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN mod_text_out    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN mod_image_in    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN mod_image_out   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN mod_audio_in    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN mod_audio_out   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN mod_embedding   INTEGER NOT NULL DEFAULT 0;

ALTER TABLE model ADD COLUMN cap_function_calling INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN cap_json_mode        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN cap_system_messages  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN cap_prompt_caching   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN cap_reasoning        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN cap_tool_browse      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN cap_tool_code_exec   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN cap_tool_file_search INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model ADD COLUMN cap_long_horizon     INTEGER NOT NULL DEFAULT 0;

CREATE TABLE benchmark (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  source_url        TEXT,
  description       TEXT,
  higher_is_better  INTEGER NOT NULL DEFAULT 1,
  unit              TEXT,
  cost_dimension    TEXT
);
CREATE INDEX idx_bench_category ON benchmark(category);

CREATE TABLE snapshot (
  id                 TEXT PRIMARY KEY,
  taken_at           TEXT NOT NULL,
  source             TEXT NOT NULL,
  source_version     TEXT,
  parent_snapshot    TEXT REFERENCES snapshot(id),
  raw_artifact_url   TEXT,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','validated','applied','rolled-back')),
  diff_summary       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_snapshot_source_taken ON snapshot(source, taken_at);

CREATE TABLE model_provider_offering (
  id                              TEXT PRIMARY KEY,
  model_id                        TEXT NOT NULL REFERENCES model(id) ON DELETE CASCADE,
  provider_id                     TEXT NOT NULL REFERENCES provider(id) ON DELETE RESTRICT,
  region                          TEXT NOT NULL DEFAULT 'global',
  input_cost_per_million_usd      REAL,
  output_cost_per_million_usd     REAL,
  cache_read_cost_per_million_usd REAL,
  context_window                  INTEGER,
  max_output                      INTEGER,
  rate_limit                      TEXT,
  status                          TEXT NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','preview','deprecated')),
  deprecation_date                TEXT,
  source_priority                 INTEGER NOT NULL DEFAULT 100,
  source_url                      TEXT NOT NULL,
  fetched_at                      TEXT NOT NULL,
  snapshot_id                     TEXT NOT NULL REFERENCES snapshot(id) ON DELETE RESTRICT,
  UNIQUE (model_id, provider_id, region, snapshot_id)
);
CREATE INDEX idx_offering_provider ON model_provider_offering(provider_id);
CREATE INDEX idx_offering_snapshot ON model_provider_offering(snapshot_id);

CREATE TABLE model_benchmark_score (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id          TEXT NOT NULL REFERENCES model(id) ON DELETE CASCADE,
  benchmark_id      TEXT NOT NULL REFERENCES benchmark(id) ON DELETE RESTRICT,
  snapshot_id       TEXT NOT NULL REFERENCES snapshot(id) ON DELETE RESTRICT,
  score             REAL NOT NULL,
  ci_low            REAL,
  ci_high           REAL,
  rank_in_benchmark INTEGER,
  cost_normalized   REAL,
  source_url        TEXT,
  fetched_at        TEXT NOT NULL,
  UNIQUE (model_id, benchmark_id, snapshot_id)
);
CREATE INDEX idx_score_benchmark_snapshot
  ON model_benchmark_score(benchmark_id, snapshot_id);

CREATE TABLE model_alias (
  alias     TEXT NOT NULL,
  source    TEXT NOT NULL,
  model_id  TEXT NOT NULL REFERENCES model(id) ON DELETE CASCADE,
  PRIMARY KEY (alias, source)
);

CREATE TABLE sync_run (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,
  trigger         TEXT NOT NULL CHECK (trigger IN ('cron','manual','webhook','seed')),
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  status          TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','partial')),
  models_fetched  INTEGER,
  models_added    INTEGER,
  models_updated  INTEGER,
  models_removed  INTEGER,
  errors_json     TEXT,
  logs_url        TEXT
);
CREATE INDEX idx_sync_run_source_started ON sync_run(source, started_at);

CREATE TABLE page_content (
  slug       TEXT NOT NULL,
  locale     TEXT NOT NULL CHECK (locale IN ('es','en')),
  title      TEXT NOT NULL,
  body_md    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (slug, locale)
);
```

## Decisiones explícitas

### ¿Por qué columnas booleanas separadas y no bitmask?

Las queries del recomendador y los filtros UI necesitan leer capabilities específicas. `WHERE cap_long_horizon = 1` es legible y SQLite lo evalúa con índice trivial. Un bitmask nos obligaría a un `bitwise and` por cada filtro; cero ahorro real, mucha fricción.

### ¿Por qué `snapshot` separado de `sync_run`?

`sync_run` describe **la ejecución** (estado, errores, logs); `snapshot` describe **el dato** (filas concretas, parent). Un sync puede generar cero o varios snapshots (e.g. `models.dev` produce snapshot de offerings pero no de scores; `LiveBench` al revés). Separarlos evita acoplamiento espurio.

### ¿Por qué `parent_snapshot` y no versionado semántico?

El changelog se reconstruye vía SQL recursivo `WITH RECURSIVE parents AS …`. Es trazable, ramificable y soporta rollback parcial sin reescribir historia.

### Resolución de aliases

Cada fuente upstream aporta aliases en `model_alias` (con su `source`). El lookup es:

```
given -> lowercase(.) replace('-preview','-preview') …
       -> SELECT model_id FROM model_alias WHERE alias = ? AND source = ?
       -> si NULL, fallback a modelo cuyo slug canónico == given
       -> si NULL, crear stub con status='pending' y sync_run.errors_json
```

Aliases canónicos entre fuentes (cross-source) viven en una segunda tabla **`alias_canonical`** (a añadir en `0002_aliases.sql` cuando lo necesitemos):

```sql
CREATE TABLE alias_canonical (
  alias_lowercase TEXT NOT NULL,
  model_id        TEXT NOT NULL REFERENCES model(id) ON DELETE CASCADE,
  confidence      REAL NOT NULL DEFAULT 1.0,
  source_hint     TEXT,
  PRIMARY KEY (alias_lowercase, model_id)
);
```

### Conflictos entre fuentes

`model_provider_offering.source_priority` desempata. Por defecto:
- `litellm`: 10 (precios granulares, cache)
- `models.dev`: 20 (capacidades, precios base)
- `aa`: 30 (index compuesto y velocidad)
- `manual-seed`: 5 (override humano gana)

Si dos snapshots diferentes aportan precios distintos para el mismo `(model, provider, region)`, conservamos ambas filas (`snapshot_id` lo distingue) y la API sirve la del snapshot de mayor prioridad vigente.

### `_conflicts` view

Vista SQL materializada nightly:

```sql
CREATE VIEW offering_conflicts AS
SELECT o1.model_id, o1.provider_id, o1.region,
       o1.input_cost_per_million_usd AS cost_a,
       o2.input_cost_per_million_usd AS cost_b,
       abs(o1.input_cost_per_million_usd - o2.input_cost_per_million_usd) AS delta
FROM   model_provider_offering o1
JOIN   model_provider_offering o2
       ON o1.model_id = o2.model_id
       AND o1.provider_id = o2.provider_id
       AND o1.region = o2.region
       AND o1.id <> o2.id
       AND abs(o1.input_cost_per_million_usd - o2.input_cost_per_million_usd) > 0.05;
```

El panel de estado muestra conflictos > 5%.

## Future-proof hooks

- **`source_priority` global configurable**: a partir del segundo trimestre, tabla `source_registry(source, priority, enabled, last_seen_at)`.
- **Modality `mod_video_in/out`**: añadir cuando entre image gen + video en scope.
- **`page_content` se extiende a `page_revision`** cuando introduzcamos workflow editorial.
