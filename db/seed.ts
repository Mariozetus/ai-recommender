// db/seed.ts — carga el seed inicial en la DB.
// Asume que db/migrate.ts ya se ejecutó (tablas existentes).
// Idempotente: borra el snapshot anterior llamado 'seed-initial' y lo reemplaza.

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';

const DB = './db/data/ai-recommender.db';
const db = new Database(DB);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const SNAPSHOT_ID = 'seed-initial';
const TAKEN_AT = '2026-10-16T00:00:00Z';

type Provider = { id: string; name: string; type: string; homepage_url: string|null; docs_url: string|null; api_docs_url: string|null; icon_url: string|null; status: string };
type Benchmark = { id: string; name: string; category: string; source_url: string|null; description?: string|null; unit: string|null; higher_is_better: number; cost_dimension: string|null };
type ScoreSeed = { benchmark_id: string; score: number };
type OfferingSeed = { provider_id: string; region: string; input_cost_per_million_usd: number|null; output_cost_per_million_usd: number|null; cache_read_cost_per_million_usd: number|null; context_window: number|null; max_output: number|null; rate_limit: string|null; status: string; deprecation_date: string|null; source_url: string; fetched_at: string };
type ModelSeed = {
  id: string; family: string|null; name: string; description: string|null;
  homepage_url: string|null; hf_repo: string|null; license: string|null;
  parameter_count: string|null; context_window: number|null; max_output: number|null;
  release_date: string|null; deprecation_date: string|null;
  modalities: Record<string, number>; capabilities: Record<string, number>;
  offerings: OfferingSeed[]; scores: ScoreSeed[];
};

const providers: Provider[] = JSON.parse(readFileSync('./seed/providers.json', 'utf8'));
const benchmarks: Benchmark[] = JSON.parse(readFileSync('./seed/benchmarks.json', 'utf8'));
const models: ModelSeed[] = JSON.parse(readFileSync('./seed/models.json', 'utf8'));

console.log(`Seed: ${providers.length} providers, ${benchmarks.length} benchmarks, ${models.length} models`);

const tx = db.transaction(() => {
  // 1. Wipe previous seed snapshot
  db.run('DELETE FROM model_benchmark_score WHERE snapshot_id = ?', [SNAPSHOT_ID]);
  db.run('DELETE FROM model_provider_offering WHERE snapshot_id = ?', [SNAPSHOT_ID]);
  db.run('DELETE FROM model_alias');
  db.run('DELETE FROM sync_run WHERE source = ?', ['seed']);
  db.run('DELETE FROM snapshot WHERE id = ?', [SNAPSHOT_ID]);

  // 2. Insert snapshot
  db.run(
    `INSERT INTO snapshot (id, taken_at, source, source_version, status, created_at)
     VALUES (?, ?, 'seed', '0.1', 'applied', ?)`,
    [SNAPSHOT_ID, TAKEN_AT, TAKEN_AT]
  );

  // 3. Upsert providers (don't touch status if exists)
  const upsertProvider = db.prepare(`
    INSERT INTO provider (id, name, type, homepage_url, docs_url, api_docs_url, icon_url, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      homepage_url = excluded.homepage_url,
      docs_url = excluded.docs_url,
      api_docs_url = excluded.api_docs_url,
      icon_url = excluded.icon_url,
      status = excluded.status
  `);
  for (const p of providers) {
    upsertProvider.run(p.id, p.name, p.type, p.homepage_url, p.docs_url, p.api_docs_url, p.icon_url, p.status);
  }

  // 4. Upsert benchmarks
  const upsertBenchmark = db.prepare(`
    INSERT INTO benchmark (id, name, category, source_url, description, higher_is_better, unit, cost_dimension)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      source_url = excluded.source_url,
      description = excluded.description,
      unit = excluded.unit,
      cost_dimension = excluded.cost_dimension
  `);
  for (const b of benchmarks) {
    upsertBenchmark.run(b.id, b.name, b.category, b.source_url, b.description ?? null, b.higher_is_better, b.unit, b.cost_dimension);
  }

  // 5. Upsert models + add their offerings + scores
  const upsertModel = db.prepare(`
    INSERT INTO model (
      id, family, name, description, homepage_url, hf_repo, license,
      parameter_count, context_window, max_output, release_date, deprecation_date,
      mod_text_in, mod_text_out, mod_image_in, mod_image_out, mod_audio_in, mod_audio_out, mod_embedding,
      cap_function_calling, cap_json_mode, cap_system_messages, cap_prompt_caching,
      cap_reasoning, cap_tool_browse, cap_tool_code_exec, cap_tool_file_search, cap_long_horizon
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      family = excluded.family,
      name = excluded.name,
      description = excluded.description,
      homepage_url = excluded.homepage_url,
      hf_repo = excluded.hf_repo,
      license = excluded.license,
      parameter_count = excluded.parameter_count,
      context_window = excluded.context_window,
      max_output = excluded.max_output,
      release_date = excluded.release_date,
      deprecation_date = excluded.deprecation_date,
      mod_text_in = excluded.mod_text_in,
      mod_text_out = excluded.mod_text_out,
      mod_image_in = excluded.mod_image_in,
      mod_image_out = excluded.mod_image_out,
      mod_audio_in = excluded.mod_audio_in,
      mod_audio_out = excluded.mod_audio_out,
      mod_embedding = excluded.mod_embedding,
      cap_function_calling = excluded.cap_function_calling,
      cap_json_mode = excluded.cap_json_mode,
      cap_system_messages = excluded.cap_system_messages,
      cap_prompt_caching = excluded.cap_prompt_caching,
      cap_reasoning = excluded.cap_reasoning,
      cap_tool_browse = excluded.cap_tool_browse,
      cap_tool_code_exec = excluded.cap_tool_code_exec,
      cap_tool_file_search = excluded.cap_tool_file_search,
      cap_long_horizon = excluded.cap_long_horizon,
      updated_at = datetime('now')
  `);

  const insertOffering = db.prepare(`
    INSERT INTO model_provider_offering (
      id, model_id, provider_id, region,
      input_cost_per_million_usd, output_cost_per_million_usd, cache_read_cost_per_million_usd,
      context_window, max_output, rate_limit,
      status, deprecation_date,
      source_priority, source_url, fetched_at, snapshot_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertScore = db.prepare(`
    INSERT INTO model_benchmark_score (
      model_id, benchmark_id, snapshot_id, score, source_url, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  let offerings = 0, scores = 0;
  for (const m of models) {
    const md = m.modalities;
    const ca = m.capabilities;
    upsertModel.run(
      m.id, m.family, m.name, m.description, m.homepage_url, m.hf_repo, m.license,
      m.parameter_count, m.context_window, m.max_output, m.release_date, m.deprecation_date,
      md.text_in ?? 0, md.text_out ?? 0, md.image_in ?? 0, md.image_out ?? 0, md.audio_in ?? 0, md.audio_out ?? 0, md.embedding ?? 0,
      ca.function_calling ?? 0, ca.json_mode ?? 0, ca.system_messages ?? 0, ca.prompt_caching ?? 0,
      ca.reasoning ?? 0, ca.tool_browse ?? 0, ca.tool_code_exec ?? 0, ca.tool_file_search ?? 0, ca.long_horizon ?? 0,
    );

    for (const o of m.offerings) {
      const oid = `${m.id}::${o.provider_id}::${o.region}::${SNAPSHOT_ID}`;
      insertOffering.run(
        oid, m.id, o.provider_id, o.region,
        o.input_cost_per_million_usd, o.output_cost_per_million_usd, o.cache_read_cost_per_million_usd,
        o.context_window, o.max_output, o.rate_limit,
        o.status, o.deprecation_date,
        5, // source_priority 5 = manual seed (overrides others)
        o.source_url, o.fetched_at, SNAPSHOT_ID
      );
      offerings++;
    }

    for (const s of m.scores) {
      insertScore.run(
        m.id, s.benchmark_id, SNAPSHOT_ID, s.score,
        `seed://${SNAPSHOT_ID}/${m.id}/${s.benchmark_id}`, TAKEN_AT
      );
      scores++;
    }

    // aliases: keep manual minimum — at least the canonical id under 'manual'
    db.run(
      `INSERT OR IGNORE INTO model_alias (alias, source, model_id) VALUES (?, 'manual', ?)`,
      [m.id, m.id]
    );
  }

  // 6. Record sync_run
  db.run(
    `INSERT INTO sync_run (id, source, trigger, started_at, finished_at, status, models_fetched, models_added, models_updated, models_removed)
     VALUES (?, 'seed', 'seed', ?, ?, 'succeeded', ?, ?, ?, 0)`,
    [`seed-${TAKEN_AT}`, TAKEN_AT, TAKEN_AT, models.length, models.length, 0]
  );

  return { offerings, scores };
});

const counts = tx();
console.log(`✓ Seed cargado: ${models.length} modelos, ${counts.offerings} offerings, ${counts.scores} benchmark scores`);
console.log(`  Snapshot: ${SNAPSHOT_ID}`);
db.close();
