// sync/litellm.ts — ingiere model_prices_and_context_window.json de BerriAI/litellm.
// Repo: https://github.com/BerriAI/litellm
// URL:  https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
// Uso:
//   bun run sync/litellm.ts                              # live API + write
//   bun run sync/litellm.ts --dry-run                  # solo diff, sin escribir
//   bun run sync/litellm.ts --filter=anthropic,openai  # solo ciertos providers

import { Database } from 'bun:sqlite';
import { fetchWithRetry } from './common.ts';
import { writeFileSync, mkdirSync } from 'node:fs';

const API = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const SOURCE = 'litellm';
const SOURCE_PRIORITY = 15; // menor que models.dev (20) — precios de models.dev ganan en conflicto
const DB_FILE = './db/data/ai-recommender.db';

// Normaliza un model ID de LiteLLM a un formato comparable.
// Ejemplos:
//   "anthropic.claude-3-5-haiku-20241022-v1:0"  → "anthropic/claude-3-5-haiku"
//   "openai/gpt-4o"                              → "openai/gpt-4o"
//   "bedrock/anthropic.claude-3-5-haiku-20241022-v1:0" → "bedrock/anthropic/claude-3-5-haiku"
function normalizeId(id: string): string {
  // Quitar trailing version como :0, :v1, -v1, -20241022
  let n = id.replace(/:0$|:v\d+$|-v\d+$|-\d{8}$/g, '');
  //provider.model → provider/model (el primer segmento antes de . es el provider LiteLLM)
  const firstDot = n.indexOf('.');
  if (firstDot > 0) {
    const provider = n.slice(0, firstDot);
    const rest = n.slice(firstDot + 1);
    n = `${provider}/${rest}`;
  }
  // Cualquier . residual → /
  n = n.replace(/\./g, '/');
  return n;
}

interface LiteLLMModel {
  litellm_provider?: string;
  mode?: string;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_system_messages?: boolean;
  supports_prompt_caching?: boolean;
  supports_reasoning?: boolean;
  supports_audio_input?: boolean;
  supports_audio_output?: boolean;
  deprecation_date?: string;
}

type LiteLLMJson = Record<string, LiteLLMModel>;

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const filterArg = argv.find((a) => a.startsWith('--filter='));
const filterSet: Set<string> | null = filterArg
  ? new Set(filterArg.slice('--filter='.length).split(','))
  : null;

const takenAt = new Date().toISOString();
const snapshotId = `${takenAt.slice(0, 10)}-${SOURCE}`;

async function loadRaw(): Promise<LiteLLMJson> {
  console.log(`→ fetch ${API}`);
  const res = await fetchWithRetry(API);
  const json = (await res.json()) as LiteLLMJson;
  mkdirSync('./db/data/raw', { recursive: true });
  const cachePath = `./db/data/raw/litellm-${takenAt.slice(0, 10)}.json`;
  writeFileSync(cachePath, JSON.stringify(json));
  console.log(`  cached to ${cachePath} (${Object.keys(json).length} entries)`);
  return json;
}

function capabilityFlags(m: LiteLLMModel): Record<string, number> {
  return {
    cap_function_calling: m.supports_function_calling ? 1 : 0,
    cap_json_mode: 0,           // LiteLLM no expone esto claramente
    cap_system_messages: m.supports_system_messages ? 1 : 0,
    cap_prompt_caching: m.supports_prompt_caching ? 1 : 0,
    cap_reasoning: m.supports_reasoning ? 1 : 0,
    cap_tool_browse: 0,         // no disponible en este schema
    cap_tool_code_exec: 0,
    cap_tool_file_search: 0,
    cap_long_horizon: (m.max_input_tokens ?? 0) >= 100000 ? 1 : 0,
  };
}

function modalityFlags(m: LiteLLMModel): Record<string, number> {
  return {
    mod_text_in: 1,             // la mayoría son chat/texto
    mod_text_out: m.mode !== 'embedding' ? 1 : 0,
    mod_image_in: m.supports_vision ? 1 : 0,
    mod_image_out: 0,
    mod_audio_in: m.supports_audio_input ? 1 : 0,
    mod_audio_out: m.supports_audio_output ? 1 : 0,
    mod_embedding: m.mode === 'embedding' ? 1 : 0,
  };
}

async function main() {
  const t0 = Date.now();
  const raw = await loadRaw();

  // Construir mapa de model_id normalizado → entrada LiteLLM
  // Filtrar: skip sample_spec, skip non-chat/embedding, skip filtered providers
  const entries: Array<{ litellmId: string; normalizedId: string; provider: string; data: LiteLLMModel }> = [];
  const skippedNoProvider: string[] = [];

  for (const [k, v] of Object.entries(raw)) {
    if (k === 'sample_spec' || typeof v !== 'object') continue;
    const provider = v.litellm_provider ?? '';
    if (!provider) { skippedNoProvider.push(k); continue; }
    if (filterSet && !filterSet.has(provider)) continue;
    // Solo chat y embedding — skip image_generation, audio, etc.
    if (v.mode !== 'chat' && v.mode !== 'embedding' && v.mode !== 'completion') continue;

    entries.push({
      litellmId: k,
      normalizedId: normalizeId(k),
      provider,
      data: v,
    });
  }

  if (skippedNoProvider.length > 0) {
    console.log(`  ⚠ skipped ${skippedNoProvider.length} entries without litellm_provider`);
  }
  console.log(`  ${entries.length} entries (chat/embedding, filtered)`);

  if (dryRun) {
    console.log(`→ dry-run: would upsert ${entries.length} offerings`);
    // Mostrar muestra
    for (const e of entries.slice(0, 3)) {
      const ic = e.data.input_cost_per_token != null
        ? `$${(e.data.input_cost_per_token * 1e6).toFixed(4)}/M in`
        : 'no-price';
      const oc = e.data.output_cost_per_token != null
        ? `$${(e.data.output_cost_per_token * 1e6).toFixed(4)}/M out`
        : 'no-price';
      console.log(`  ${e.normalizedId} [${e.provider}] ${ic} ${oc}`);
    }
    return;
  }

  // Load existing model IDs from DB for matching
  const db = new Database(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  const existingModelIds = new Set(
    (db.prepare('SELECT id FROM model').all() as Array<{ id: string }>).map((r) => r.id)
  );
  const existingProviders = new Set(
    (db.prepare('SELECT id FROM provider').all() as Array<{ id: string }>).map((r) => r.id)
  );

  // Upsert providers (solo los que tengan pricing)
  const upsertProvider = db.prepare(`
    INSERT INTO provider (id, name, type, status)
    VALUES (?, ?, 'cloud-api', 'active')
    ON CONFLICT(id) DO NOTHING
  `);

  // Upsert offerings — si ya existe una con priority mayor, no sobreescribir
  const upsertOffering = db.prepare(`
    INSERT INTO model_provider_offering (
      id, model_id, provider_id, region,
      input_cost_per_million_usd, output_cost_per_million_usd,
      cache_read_cost_per_million_usd, cache_creation_cost_per_million_usd,
      context_window, max_output,
      status, deprecation_date,
      source_priority, source_url, fetched_at, snapshot_id
    ) VALUES (?, ?, ?, 'global', ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    ON CONFLICT(model_id, provider_id, region, snapshot_id)
    DO UPDATE SET
      input_cost_per_million_usd = excluded.input_cost_per_million_usd,
      output_cost_per_million_usd = excluded.output_cost_per_million_usd,
      cache_read_cost_per_million_usd = excluded.cache_read_cost_per_million_usd,
      cache_creation_cost_per_million_usd = excluded.cache_creation_cost_per_million_usd,
      context_window = excluded.context_window,
      max_output = excluded.max_output,
      source_priority = excluded.source_priority,
      source_url = excluded.source_url,
      fetched_at = excluded.fetched_at
    WHERE excluded.source_priority > source_priority
  `);

  const tx = db.transaction(() => {
    // Snapshot
    db.run(
      `INSERT INTO snapshot (id, taken_at, source, status)
       VALUES (?, ?, ?, 'applied')
       ON CONFLICT(id) DO NOTHING`,
      [snapshotId, takenAt, SOURCE]
    );

    let offeringsAdded = 0;
    let providersUpserted = 0;
    const seenProviders = new Set<string>();

    for (const e of entries) {
      const { litellmId, normalizedId, provider, data } = e;

      // Upsert provider
      if (!seenProviders.has(provider)) {
        upsertProvider.run(provider, provider);
        seenProviders.add(provider);
        providersUpserted++;
      }

      // Solo insertar offering si el modelo existe en la DB
      // (LiteLLM no crea modelos, solo añade pricing a modelos existentes)
      if (!existingModelIds.has(normalizedId)) continue;

      const inputCost = data.input_cost_per_token != null
        ? data.input_cost_per_token * 1e6 : null;
      const outputCost = data.output_cost_per_token != null
        ? data.output_cost_per_token * 1e6 : null;
      const cacheReadCost = data.cache_read_input_token_cost != null
        ? data.cache_read_input_token_cost * 1e6 : null;
      const cacheCreationCost = data.cache_creation_input_token_cost != null
        ? data.cache_creation_input_token_cost * 1e6 : null;

      const contextWindow = data.max_input_tokens ?? data.max_tokens ?? null;
      const maxOutput = data.max_output_tokens ?? null;

      const oid = `${normalizedId}::${provider}::global::${snapshotId}::${crypto.randomUUID().slice(0, 8)}`;
      upsertOffering.run(
        oid, normalizedId, provider,
        inputCost, outputCost, cacheReadCost, cacheCreationCost,
        contextWindow, maxOutput,
        data.deprecation_date ?? null,
        SOURCE_PRIORITY, API, takenAt, snapshotId
      );
      offeringsAdded++;
    }

    return { providersUpserted, offeringsAdded };
  });

  const counts = tx();

  // Record sync_run
  db.run(
    `INSERT INTO sync_run (id, source, trigger, started_at, finished_at, status, models_fetched, models_added, models_updated, models_removed)
     VALUES (?, ?, 'manual', ?, ?, 'succeeded', ?, ?, ?, 0)
     ON CONFLICT(id) DO NOTHING`,
    [`sync-${snapshotId}`, SOURCE, takenAt, takenAt, entries.length, counts.offeringsAdded, 0]
  );

  db.close();
  const dur = Date.now() - t0;
  console.log(`✓ ${SOURCE} sync en ${dur}ms: ${counts.providersUpserted} providers, ${counts.offeringsAdded} offerings`);
  console.log(`  snapshot: ${snapshotId}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
