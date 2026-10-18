import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// SCHEMA.md mirror. Mantenerlos sincronizados manualmente hasta migrar a drizzle-kit generate.

export const provider = sqliteTable('provider', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['cloud-api', 'self-hosted', 'hybrid'] }).notNull(),
  homepageUrl: text('homepage_url'),
  docsUrl: text('docs_url'),
  apiDocsUrl: text('api_docs_url'),
  iconUrl: text('icon_url'),
  status: text('status', { enum: ['active', 'deprecated'] }).notNull().default('active'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const model = sqliteTable('model', {
  id: text('id').primaryKey(),
  family: text('family'),
  name: text('name').notNull(),
  description: text('description'),
  homepageUrl: text('homepage_url'),
  hfRepo: text('hf_repo'),
  license: text('license'),
  parameterCount: text('parameter_count'),
  contextWindow: integer('context_window'),
  maxOutput: integer('max_output'),
  releaseDate: text('release_date'),
  deprecationDate: text('deprecation_date'),

  // modalities (0/1)
  modTextIn: integer('mod_text_in').notNull().default(0),
  modTextOut: integer('mod_text_out').notNull().default(0),
  modImageIn: integer('mod_image_in').notNull().default(0),
  modImageOut: integer('mod_image_out').notNull().default(0),
  modAudioIn: integer('mod_audio_in').notNull().default(0),
  modAudioOut: integer('mod_audio_out').notNull().default(0),
  modEmbedding: integer('mod_embedding').notNull().default(0),

  // capabilities (0/1)
  capFunctionCalling: integer('cap_function_calling').notNull().default(0),
  capJsonMode: integer('cap_json_mode').notNull().default(0),
  capSystemMessages: integer('cap_system_messages').notNull().default(0),
  capPromptCaching: integer('cap_prompt_caching').notNull().default(0),
  capReasoning: integer('cap_reasoning').notNull().default(0),
  capToolBrowse: integer('cap_tool_browse').notNull().default(0),
  capToolCodeExec: integer('cap_tool_code_exec').notNull().default(0),
  capToolFileSearch: integer('cap_tool_file_search').notNull().default(0),
  capLongHorizon: integer('cap_long_horizon').notNull().default(0),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  familyIdx: index('idx_model_family').on(t.family),
  licenseIdx: index('idx_model_license').on(t.license),
}));

export const benchmark = sqliteTable('benchmark', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category', {
    enum: ['general', 'coding', 'math', 'reasoning', 'agent', 'long-context', 'multilingual', 'vision', 'live', 'embedding'],
  }).notNull(),
  sourceUrl: text('source_url'),
  description: text('description'),
  higherIsBetter: integer('higher_is_better').notNull().default(1),
  unit: text('unit'),
  costDimension: text('cost_dimension'),
}, (t) => ({
  categoryIdx: index('idx_bench_category').on(t.category),
}));

export const snapshot = sqliteTable('snapshot', {
  id: text('id').primaryKey(),
  takenAt: text('taken_at').notNull(),
  source: text('source', { enum: ['models.dev', 'litellm', 'aa', 'livebench', 'replicate', 'seed', 'manual', 'hf-benchmarks'] }).notNull(),
  sourceVersion: text('source_version'),
  parentSnapshot: text('parent_snapshot'),
  rawArtifactUrl: text('raw_artifact_url'),
  status: text('status', { enum: ['draft', 'validated', 'applied', 'rolled-back'] }).notNull().default('draft'),
  diffSummary: text('diff_summary'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  sourceTakenIdx: index('idx_snapshot_source_taken').on(t.source, t.takenAt),
}));

export const modelProviderOffering = sqliteTable('model_provider_offering', {
  id: text('id').primaryKey(),
  modelId: text('model_id').notNull().references(() => model.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull().references(() => provider.id, { onDelete: 'restrict' }),
  region: text('region').notNull().default('global'),
  inputCostPerMillionUsd: real('input_cost_per_million_usd'),
  outputCostPerMillionUsd: real('output_cost_per_million_usd'),
  cacheReadCostPerMillionUsd: real('cache_read_cost_per_million_usd'),
  cacheCreationCostPerMillionUsd: real('cache_creation_cost_per_million_usd'),
  contextWindow: integer('context_window'),
  maxOutput: integer('max_output'),
  rateLimit: text('rate_limit'),
  status: text('status', { enum: ['active', 'preview', 'deprecated'] }).notNull().default('active'),
  deprecationDate: text('deprecation_date'),
  sourcePriority: integer('source_priority').notNull().default(100),
  sourceUrl: text('source_url').notNull(),
  fetchedAt: text('fetched_at').notNull(),
  snapshotId: text('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'restrict' }),
}, (t) => ({
  uniqueOffering: uniqueIndex('uq_offering').on(t.modelId, t.providerId, t.region, t.snapshotId),
  providerIdx: index('idx_offering_provider').on(t.providerId),
  snapshotIdx: index('idx_offering_snapshot').on(t.snapshotId),
}));

export const modelBenchmarkScore = sqliteTable('model_benchmark_score', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  modelId: text('model_id').notNull().references(() => model.id, { onDelete: 'cascade' }),
  benchmarkId: text('benchmark_id').notNull().references(() => benchmark.id, { onDelete: 'restrict' }),
  snapshotId: text('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'restrict' }),
  score: real('score').notNull(),
  ciLow: real('ci_low'),
  ciHigh: real('ci_high'),
  rankInBenchmark: integer('rank_in_benchmark'),
  costNormalized: real('cost_normalized'),
  sourceUrl: text('source_url'),
  fetchedAt: text('fetched_at').notNull(),
}, (t) => ({
  uniqueScore: uniqueIndex('uq_score').on(t.modelId, t.benchmarkId, t.snapshotId),
  benchmarkSnapshotIdx: index('idx_score_benchmark_snapshot').on(t.benchmarkId, t.snapshotId),
}));

export const modelAlias = sqliteTable('model_alias', {
  alias: text('alias').notNull(),
  source: text('source', { enum: ['models.dev', 'litellm', 'aa', 'hf', 'manual'] }).notNull(),
  modelId: text('model_id').notNull().references(() => model.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.alias, t.source] }),
}));

export const syncRun = sqliteTable('sync_run', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  trigger: text('trigger', { enum: ['cron', 'manual', 'webhook', 'seed'] }).notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  status: text('status', { enum: ['running', 'succeeded', 'failed', 'partial'] }).notNull(),
  modelsFetched: integer('models_fetched'),
  modelsAdded: integer('models_added'),
  modelsUpdated: integer('models_updated'),
  modelsRemoved: integer('models_removed'),
  errorsJson: text('errors_json'),
  logsUrl: text('logs_url'),
}, (t) => ({
  sourceStartedIdx: index('idx_sync_run_source_started').on(t.source, t.startedAt),
}));

export const pageContent = sqliteTable('page_content', {
  slug: text('slug').notNull(),
  locale: text('locale', { enum: ['en', 'es'] }).notNull(),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.slug, t.locale] }),
}));
