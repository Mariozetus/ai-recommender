// sync/modelsdev.ts — ingiere models.dev/api.json en la DB.
// Uso:
//   bun run sync/modelsdev.ts                              # live API + write
//   bun run sync/modelsdev.ts --dry-run                    # calcula diff sin escribir
//   bun run sync/modelsdev.ts --fixture db/data/raw/foo.json
//   bun run sync/modelsdev.ts --filter=openai,anthropic,google

import { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fetchWithRetry, validateOrThrow, slugify, normalizeCost } from './common.ts';
import { readFile as readJsonFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://models.dev/api.json';
const SOURCE = 'models.dev';
const SOURCE_PRIORITY = 20;
const DB_FILE = './db/data/ai-recommender.db';

interface ModelsDevModel {
  id: string;
  name: string;
  canonical_model_id?: string | null;
  family?: string | null;
  description?: string | null;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  open_weights?: boolean;
  release_date?: string | null;
  last_updated?: string | null;
  knowledge?: string | null;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number };
  cost?: { input?: number | null; output?: number | null; cache_read?: number | null };
}
interface ModelsDevProvider {
  id: string;
  name: string;
  doc?: string | null;
  models: Record<string, ModelsDevModel>;
}
type ModelsDevJson = Record<string, ModelsDevProvider>;

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const filterArg = argv.find((a) => a.startsWith('--filter='));
const filterSet: Set<string> | null = filterArg ? new Set(filterArg.slice('--filter='.length).split(',')) : null;
const fixtureArg = argv.find((a) => a.startsWith('--fixture='));
const fixturePath = fixtureArg ? fixtureArg.slice('--fixture='.length) : null;

const takenAt = new Date().toISOString();
const snapshotId = `${takenAt.slice(0, 10)}-${SOURCE}`;

async function loadRaw(): Promise<ModelsDevJson> {
  if (fixturePath) {
    console.log(`→ fixture: ${fixturePath}`);
    return JSON.parse(readFileSync(fixturePath, 'utf8')) as ModelsDevJson;
  }
  console.log(`→ fetch ${API}`);
  const res = await fetchWithRetry(API);
  const json = (await res.json()) as ModelsDevJson;
  mkdirSync('./db/data/raw', { recursive: true });
  const cachePath = `./db/data/raw/modelsdev-${takenAt.slice(0, 10)}.json`;
  writeFileSync(cachePath, JSON.stringify(json));
  console.log(`  cached to ${cachePath} (${Object.keys(json).length} providers)`);
  return json;
}

function modalityFlags(modalities: ModelsDevModel['modalities']): {
  mod_text_in: number; mod_text_out: number; mod_image_in: number;
  mod_image_out: number; mod_audio_in: number; mod_audio_out: number; mod_embedding: number;
} {
  const inp = new Set(modalities?.input ?? []);
  const out = new Set(modalities?.output ?? []);
  return {
    mod_text_in: inp.has('text') || inp.has('pdf') ? 1 : 0,
    mod_text_out: out.has('text') ? 1 : 0,
    mod_image_in: inp.has('image') || inp.has('attachment') ? 1 : 0,
    mod_image_out: out.has('image') ? 1 : 0,
    mod_audio_in: inp.has('audio') ? 1 : 0,
    mod_audio_out: out.has('audio') ? 1 : 0,
    mod_embedding: out.has('embedding') || out.has('vector') ? 1 : 0,
  };
}

function capabilityFlags(m: ModelsDevModel): {
  cap_function_calling: number; cap_json_mode: number; cap_system_messages: number;
  cap_prompt_caching: number; cap_reasoning: number; cap_tool_browse: number;
  cap_tool_code_exec: number; cap_tool_file_search: number; cap_long_horizon: number;
} {
  return {
    cap_function_calling: m.tool_call ? 1 : 0,
    cap_json_mode: m.structured_output ? 1 : 0,
    cap_system_messages: m.temperature === false ? 0 : 1, // si soporta temperature custom, soporta system
    cap_prompt_caching: m.cost && m.cost.cache_read != null ? 1 : 0,
    cap_reasoning: m.reasoning ? 1 : 0,
    cap_tool_browse: 0, // no podemos inferir sin info extra
    cap_tool_code_exec: 0,
    cap_tool_file_search: 0,
    cap_long_horizon: (m.limit?.context ?? 0) >= 100000 ? 1 : 0,
  };
}

async function main() {
  const schemaPath = join(process.cwd(), 'schemas/modelsdev.schema.json');
  const schema = JSON.parse(await readJsonFile(schemaPath, 'utf8'));

  const t0 = Date.now();
  const raw = await loadRaw();

  console.log('→ validating schema');
  validateOrThrow(schema, raw, 'models.dev');

  // Filter providers if requested
  const providerEntries = Object.entries(raw).filter(([id]) => !filterSet || filterSet.has(id));
  if (filterSet) console.log(`  filter applied: ${[...filterSet].join(', ')} → ${providerEntries.length}/${Object.keys(raw).length} providers`);

  // Flatten to (provider, model) rows
  const rows: Array<{
    provider: ModelsDevProvider;
    modelId: string; // canonical id (composed)
    m: ModelsDevModel;
  }> = [];
  for (const [, pdata] of providerEntries) {
    for (const [localId, m] of Object.entries(pdata.models)) {
      // Compose canonical id from provider + model id; if model already has a "/", keep it (e.g. openrouter/provider--name)
      const composedId = m.id.includes('/') ? m.id : `${pdata.id}/${m.id}`;
      rows.push({ provider: pdata, modelId: composedId, m });
    }
  }
  console.log(`→ ${rows.length} modelos tras filter`);

  if (dryRun) {
    const sample = rows.slice(0, 3).map((r) => ({
      provider: r.provider.id,
      model: r.modelId,
      name: r.m.name,
      modalities: r.m.modalities,
      cost: r.m.cost,
      ctx: r.m.limit?.context,
    }));
    console.log('Sample (dry-run):', JSON.stringify(sample, null, 2));
    console.log(`dry-run OK · ${rows.length} rows · ${Date.now() - t0}ms`);
    return;
  }

  // Write to DB
  const db = new Database(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  const upsertProvider = db.prepare(`
    INSERT INTO provider (id, name, type, homepage_url, docs_url, api_docs_url, status)
    VALUES (?, ?, 'cloud-api', NULL, ?, ?, 'active')
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      docs_url = excluded.docs_url,
      api_docs_url = excluded.api_docs_url
  `);
  const upsertModel = db.prepare(`
    INSERT INTO model (
      id, family, name, description, release_date,
      context_window, max_output,
      mod_text_in, mod_text_out, mod_image_in, mod_image_out, mod_audio_in, mod_audio_out, mod_embedding,
      cap_function_calling, cap_json_mode, cap_system_messages, cap_prompt_caching,
      cap_reasoning, cap_tool_browse, cap_tool_code_exec, cap_tool_file_search, cap_long_horizon,
      homepage_url, hf_repo, license, parameter_count, deprecation_date
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      NULL, NULL, NULL, NULL, NULL
    )
    ON CONFLICT(id) DO UPDATE SET
      family = excluded.family,
      name = excluded.name,
      description = excluded.description,
      release_date = excluded.release_date,
      context_window = excluded.context_window,
      max_output = excluded.max_output,
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
    ) VALUES (?, ?, ?, 'global', ?, ?, ?, ?, ?, NULL, 'active', NULL, ?, ?, ?, ?)
    ON CONFLICT(model_id, provider_id, region, snapshot_id) DO UPDATE SET
      input_cost_per_million_usd = excluded.input_cost_per_million_usd,
      output_cost_per_million_usd = excluded.output_cost_per_million_usd,
      cache_read_cost_per_million_usd = excluded.cache_read_cost_per_million_usd,
      context_window = excluded.context_window,
      max_output = excluded.max_output,
      source_priority = excluded.source_priority,
      source_url = excluded.source_url,
      fetched_at = excluded.fetched_at
  `);

  const tx = db.transaction(() => {
    // Insert snapshot
    db.run(
      `INSERT INTO snapshot (id, taken_at, source, source_version, parent_snapshot, raw_artifact_url, status)
       VALUES (?, ?, ?, NULL, (
         SELECT id FROM snapshot WHERE source = ? AND status = 'applied' ORDER BY taken_at DESC LIMIT 1
       ), ?, 'applied')
       ON CONFLICT(id) DO NOTHING`,
      [snapshotId, takenAt, SOURCE, SOURCE, `./db/data/raw/modelsdev-${takenAt.slice(0, 10)}.json`]
    );

    let modelsUpserted = 0;
    let offeringsAdded = 0;
    const seenProviders = new Set<string>();
    const seenModelIds = new Set<string>();

    for (const r of rows) {
      upsertProvider.run(r.provider.id, r.provider.name, r.provider.doc ?? null, r.provider.doc ?? null);
      seenProviders.add(r.provider.id);

      const md = modalityFlags(r.m.modalities);
      const ca = capabilityFlags(r.m);
      upsertModel.run(
        r.modelId, r.m.family ?? null, r.m.name, r.m.description ?? null, r.m.release_date ?? null,
        r.m.limit?.context ?? null, r.m.limit?.output ?? null,
        md.mod_text_in, md.mod_text_out, md.mod_image_in, md.mod_image_out, md.mod_audio_in, md.mod_audio_out, md.mod_embedding,
        ca.cap_function_calling, ca.cap_json_mode, ca.cap_system_messages, ca.cap_prompt_caching,
        ca.cap_reasoning, ca.cap_tool_browse, ca.cap_tool_code_exec, ca.cap_tool_file_search, ca.cap_long_horizon,
      );
      seenModelIds.add(r.modelId);
      modelsUpserted++;

      const inputCost = normalizeCost(r.m.cost?.input ?? null);
      const outputCost = normalizeCost(r.m.cost?.output ?? null);
      const cacheCost = normalizeCost(r.m.cost?.cache_read ?? null);
      const oid = `${r.modelId}::${r.provider.id}::global::${snapshotId}::${crypto.randomUUID().slice(0, 8)}`;
      insertOffering.run(
        oid, r.modelId, r.provider.id,
        inputCost, outputCost, cacheCost,
        r.m.limit?.context ?? null, r.m.limit?.output ?? null,
        SOURCE_PRIORITY, API, takenAt, snapshotId
      );
      offeringsAdded++;
    }
    return { providersTouched: seenProviders.size, modelsUpserted, offeringsAdded };
  });

  const counts = tx();
  const dur = Date.now() - t0;

  // Record sync_run
  db.run(
    `INSERT INTO sync_run (id, source, trigger, started_at, finished_at, status, models_fetched, models_added, models_updated, models_removed)
     VALUES (?, ?, 'manual', ?, ?, 'succeeded', ?, ?, ?, 0)
     ON CONFLICT(id) DO NOTHING`,
    [`sync-${snapshotId}`, SOURCE, takenAt, takenAt, counts.modelsUpserted, counts.offeringsAdded, 0]
  );

  db.close();
  console.log(`✓ ${SOURCE} sync en ${dur}ms: ${counts.providersTouched} providers, ${counts.modelsUpserted} modelos, ${counts.offeringsAdded} offerings`);
  console.log(`  snapshot: ${snapshotId}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
