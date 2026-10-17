-- 0001_init.sql
-- Mirror del SCHEMA.md. Mantener sincronizado con db/schema.ts.
-- Aplicar manualmente con `bun run db:migrate` o regenerar con drizzle-kit.

PRAGMA foreign_keys = ON;

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
  mod_text_in      INTEGER NOT NULL DEFAULT 0,
  mod_text_out     INTEGER NOT NULL DEFAULT 0,
  mod_image_in     INTEGER NOT NULL DEFAULT 0,
  mod_image_out    INTEGER NOT NULL DEFAULT 0,
  mod_audio_in     INTEGER NOT NULL DEFAULT 0,
  mod_audio_out    INTEGER NOT NULL DEFAULT 0,
  mod_embedding    INTEGER NOT NULL DEFAULT 0,
  cap_function_calling INTEGER NOT NULL DEFAULT 0,
  cap_json_mode        INTEGER NOT NULL DEFAULT 0,
  cap_system_messages  INTEGER NOT NULL DEFAULT 0,
  cap_prompt_caching   INTEGER NOT NULL DEFAULT 0,
  cap_reasoning        INTEGER NOT NULL DEFAULT 0,
  cap_tool_browse      INTEGER NOT NULL DEFAULT 0,
  cap_tool_code_exec   INTEGER NOT NULL DEFAULT 0,
  cap_tool_file_search INTEGER NOT NULL DEFAULT 0,
  cap_long_horizon     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_model_family  ON model(family);
CREATE INDEX idx_model_license ON model(license);

CREATE TABLE benchmark (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('general','coding','math','reasoning','agent','long-context','multilingual','vision','live','embedding')),
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
  source             TEXT NOT NULL CHECK (source IN ('models.dev','litellm','aa','livebench','replicate','seed','manual')),
  source_version     TEXT,
  parent_snapshot    TEXT,
  raw_artifact_url   TEXT,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','applied','rolled-back')),
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
  status                          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','preview','deprecated')),
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
CREATE INDEX idx_score_benchmark_snapshot ON model_benchmark_score(benchmark_id, snapshot_id);

CREATE TABLE model_alias (
  alias     TEXT NOT NULL,
  source    TEXT NOT NULL CHECK (source IN ('models.dev','litellm','aa','hf','manual')),
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
  locale     TEXT NOT NULL CHECK (locale IN ('en','es')),
  title      TEXT NOT NULL,
  body_md    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (slug, locale)
);
