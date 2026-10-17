// scripts/build-data.ts — genera los JSON estáticos que el sitio necesita.
// Ejecutar ANTES de `astro build` para que el build encuentre los datos.
//
//   bun run scripts/build-data.ts
//
// Outputs:
//   public/api/health.json     → consumido por src/pages/api/health.ts (prerender = true)
//   public/data/models.json    → todos los modelos (formato compacto) para el recomendador client-side
//   public/data/snapshots.json → mini-changelog de los últimos 5 syncs
//   public/data/providers.json → lista de providers
//   public/data/benchmarks.json → lista de benchmarks

import { Database } from 'bun:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DB_FILE = './db/data/ai-recommender.db';
const OUT = './public';

const db = new Database(DB_FILE, { readonly: true });
mkdirSync(join(OUT, 'api'), { recursive: true });
mkdirSync(join(OUT, 'data'), { recursive: true });

const totals = {
  models: db.query<{ n: number }, []>(`SELECT COUNT(*) as n FROM model`).get()?.n ?? 0,
  benchmarks: db.query<{ n: number }, []>(`SELECT COUNT(*) as n FROM benchmark`).get()?.n ?? 0,
  active_offerings: db.query<{ n: number }, []>(`SELECT COUNT(*) as n FROM model_provider_offering WHERE status='active'`).get()?.n ?? 0,
  providers: db.query<{ n: number }, []>(`SELECT COUNT(*) as n FROM provider`).get()?.n ?? 0,
};

const sources = ['models.dev', 'litellm', 'aa', 'livebench', 'replicate', 'seed'] as const;
const sourcesObj: Record<string, { last_success: string | null; last_status: string | null; lag_hours: number | null; errors: number | null }> = {};
for (const s of sources) {
  const row = db.query<{ status: string; finished_at: string | null }, [string]>(
    `SELECT status, finished_at FROM sync_run WHERE source = ? AND status IN ('succeeded','partial') ORDER BY started_at DESC LIMIT 1`
  ).get(s);
  const lag = row?.finished_at ? Math.round((Date.now() - Date.parse(row.finished_at)) / 36e5) : null;
  sourcesObj[s] = { last_success: row?.finished_at ?? null, last_status: row?.status ?? null, lag_hours: lag, errors: null };
}

const health = {
  status: 'ok',
  db: true,
  sources: sourcesObj,
  totals,
  generated_at: new Date().toISOString(),
};
writeFileSync(join(OUT, 'api/health.json'), JSON.stringify(health, null, 2));
console.log(`✓ health.json: models=${totals.models} offerings=${totals.active_offerings}`);

// providers
const providers = db.query<{ id: string; name: string; type: string }, []>(`SELECT id, name, type FROM provider ORDER BY name`).all();
writeFileSync(join(OUT, 'data/providers.json'), JSON.stringify(providers, null, 2));
console.log(`✓ providers.json: ${providers.length}`);

// benchmarks
const benchmarks = db.query<{ id: string; name: string; category: string }, []>(`SELECT id, name, category FROM benchmark ORDER BY category, name`).all();
writeFileSync(join(OUT, 'data/benchmarks.json'), JSON.stringify(benchmarks, null, 2));
console.log(`✓ benchmarks.json: ${benchmarks.length}`);

// snapshots (últimos 5)
const snaps = db.query<{ id: string; taken_at: string; source: string; status: string; diff_summary: string | null }, []>(
  `SELECT id, taken_at, source, status, diff_summary FROM snapshot WHERE status='applied' ORDER BY taken_at DESC LIMIT 5`
).all();
writeFileSync(join(OUT, 'data/snapshots.json'), JSON.stringify(snaps, null, 2));
console.log(`✓ snapshots.json: ${snaps.length}`);

// models (formato compacto para el recomendador client-side)
const modelsRaw = db.query<{
  id: string; name: string; family: string | null; license: string | null; parameter_count: string | null;
  context_window: number | null; max_output: number | null;
  mod_text_in: number; mod_text_out: number; mod_image_in: number; mod_image_out: number;
  mod_audio_in: number; mod_audio_out: number; mod_embedding: number;
  cap_function_calling: number; cap_json_mode: number; cap_system_messages: number;
  cap_prompt_caching: number; cap_reasoning: number; cap_tool_browse: number;
  cap_tool_code_exec: number; cap_tool_file_search: number; cap_long_horizon: number;
}, []>(`SELECT * FROM model`).all();

const offeringsRaw = db.query<{
  model_id: string; provider_id: string; provider_name: string; provider_type: string;
  region: string; input_cost_per_million_usd: number | null; output_cost_per_million_usd: number | null;
  cache_read_cost_per_million_usd: number | null; context_window: number | null;
}, []>(`SELECT o.model_id, o.provider_id, p.name as provider_name, p.type as provider_type, o.region, o.input_cost_per_million_usd, o.output_cost_per_million_usd, o.cache_read_cost_per_million_usd, o.context_window FROM model_provider_offering o INNER JOIN provider p ON p.id = o.provider_id WHERE o.status='active'`).all();

const scoresRaw = db.query<{ model_id: string; benchmark_id: string; score: number }, []>(`SELECT model_id, benchmark_id, score FROM model_benchmark_score`).all();

const scoreMap: Record<string, Record<string, number>> = {};
for (const s of scoresRaw) (scoreMap[s.model_id] ??= {})[s.benchmark_id] = s.score;

const offerMap: Record<string, Array<{ provider_id: string; provider_name: string; provider_type: string; region: string; input_cost: number | null; output_cost: number | null; cache_read: number | null; context_window: number | null }>> = {};
for (const o of offeringsRaw) {
  (offerMap[o.model_id] ??= []).push({
    provider_id: o.provider_id,
    provider_name: o.provider_name,
    provider_type: o.provider_type,
    region: o.region,
    input_cost: o.input_cost_per_million_usd,
    output_cost: o.output_cost_per_million_usd,
    cache_read: o.cache_read_cost_per_million_usd,
    context_window: o.context_window,
  });
}

const models = modelsRaw.map((m) => ({
  id: m.id, name: m.name, family: m.family, license: m.license, parameter_count: m.parameter_count,
  context_window: m.context_window, max_output: m.max_output,
  flags: {
    mod_text_in: m.mod_text_in, mod_text_out: m.mod_text_out, mod_image_in: m.mod_image_in, mod_image_out: m.mod_image_out,
    mod_audio_in: m.mod_audio_in, mod_audio_out: m.mod_audio_out, mod_embedding: m.mod_embedding,
    cap_function_calling: m.cap_function_calling, cap_json_mode: m.cap_json_mode, cap_system_messages: m.cap_system_messages,
    cap_prompt_caching: m.cap_prompt_caching, cap_reasoning: m.cap_reasoning, cap_tool_browse: m.cap_tool_browse,
    cap_tool_code_exec: m.cap_tool_code_exec, cap_tool_file_search: m.cap_tool_file_search, cap_long_horizon: m.cap_long_horizon,
  },
  benchmark_scores: scoreMap[m.id] ?? {},
  offerings: offerMap[m.id] ?? [],
}));

writeFileSync(join(OUT, 'data/models.json'), JSON.stringify(models));
console.log(`✓ models.json: ${models.length} modelos, ${(JSON.stringify(models).length / 1024 / 1024).toFixed(2)} MB`);

db.close();
console.log('✓ build-data: done');
