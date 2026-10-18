// sync/aa.ts — ingiere Artificial Analysis API (free tier).
// Fuente: https://artificialanalysis.ai/api/v2/language/models/free
// Auth: AA_API_KEY (opcional; si no existe, el sync es un no-op con warning).
// Uso:
//   AA_API_KEY=xxx bun run sync/aa.ts          # live API + write
//   AA_API_KEY=xxx bun run sync/aa.ts --dry-run # solo diff, sin escribir
//   bun run sync/aa.ts                         # sin key → warning + exit 0

import { Database } from 'bun:sqlite';
import { fetchWithRetry } from './common.ts';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://artificialanalysis.ai/api/v2';
const SOURCE = 'aa';
const SOURCE_PRIORITY = 15; // mismo que litellm; models.dev gana (20)
const DB_FILE = './db/data/ai-recommender.db';

const AA_API_KEY = process.env.AA_API_KEY;

interface AAEvaluation {
  artificial_analysis_intelligence_index?: number;
  coding_index?: number;
  agentic_index?: number;
  math_index?: number;
  science_index?: number;
  instruction_following_index?: number;
  language_understanding_index?: number;
}

interface AAPricing {
  input_cost_per_million?: number | null;
  output_cost_per_million?: number | null;
}

interface AAPerformance {
  median_latency_ms?: number | null;
  median_throughput_tokens_per_second?: number | null;
}

interface AAModel {
  id: string;
  name: string;
  slug: string;
  release_date?: string | null;
  model_creator: { id: string; name: string };
  evaluations: AAEvaluation;
  pricing: AAPricing;
  performance: AAPerformance;
}

interface AAPaginatedResponse {
  tier: string;
  intelligence_index_version: number;
  pagination: {
    page: number;
    page_size: number;
    total_pages: number;
    has_more: boolean;
  };
  data: AAModel[];
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');

const takenAt = new Date().toISOString();
const snapshotId = `${takenAt.slice(0, 10)}-${SOURCE}`;
const BENCHMARK_ID = 'aa-intelligence-index';

async function fetchPage(page: number): Promise<AAPaginatedResponse> {
  const url = `${BASE}/language/models/free?page=${page}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (AA_API_KEY) headers['x-api-key'] = AA_API_KEY;

  const res = await fetchWithRetry(url, { timeoutMs: 30_000 });
  if (!res.ok) throw new Error(`AA API HTTP ${res.status} for page ${page}`);
  return (await res.json()) as AAPaginatedResponse;
}

async function loadAll(): Promise<AAModel[]> {
  console.log(`→ fetch ${BASE}/language/models/free`);
  const first = await fetchPage(1);
  console.log(`  tier: ${first.tier}, total_pages: ${first.pagination.total_pages}`);

  const all: AAModel[] = [...first.data];
  for (let p = 2; p <= first.pagination.total_pages; p++) {
    const page = await fetchPage(p);
    all.push(...page.data);
    if (p % 5 === 0) console.log(`  page ${p}/${first.pagination.total_pages}`);
  }
  return all;
}

function normalizeSlug(slug: string): string {
  // AA slugs like "claude-3-5-haiku-20241022" → "anthropic/claude-3-5-haiku" when we can infer provider
  // We can't always infer, so also match by name
  return slug.toLowerCase().replace(/[^a-z0-9./-]/g, '-').replace(/-+/g, '-');
}

async function main() {
  const t0 = Date.now();

  if (!AA_API_KEY) {
    console.log('⚠ AA_API_KEY not set — skipping AA sync. Set it to enable benchmark ingestion.');
    console.log('  Free tier: https://artificialanalysis.ai/data-api (free API key)');
    process.exit(0);
  }

  mkdirSync('./db/data/raw', { recursive: true });
  const cachePath = `./db/data/raw/aa-${takenAt.slice(0, 10)}.json`;

  const models = await loadAll();
  writeFileSync(cachePath, JSON.stringify(models, null, 2));
  console.log(`  cached to ${cachePath} (${models.length} models)`);

  if (dryRun) {
    console.log(`→ dry-run: would upsert ${models.length} AA model scores`);
    for (const m of models.slice(0, 3)) {
      const idx = m.evaluations.artificial_analysis_intelligence_index;
      console.log(`  ${m.slug}: intelligence_index=${idx ?? 'N/A'}`);
    }
    return;
  }

  const db = new Database(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Load existing model IDs + names for matching
  const existingModels = (db.prepare('SELECT id, name FROM model').all() as Array<{ id: string; name: string }>);
  const modelById = new Map<string, string>();
  const modelByNameLower = new Map<string, string>();
  for (const m of existingModels) {
    modelById.set(m.id, m.id);
    modelByNameLower.set(m.name.toLowerCase(), m.id);
  }

  // Load existing benchmark IDs
  const existingBenchmarks = new Set(
    (db.prepare('SELECT id FROM benchmark').all() as Array<{ id: string }>).map((r) => r.id)
  );

  // Ensure the AA benchmark exists
  if (!existingBenchmarks.has(BENCHMARK_ID)) {
    db.prepare(`
      INSERT INTO benchmark (id, name, category, source_url, description, higher_is_better, unit, cost_dimension)
      VALUES (?, ?, 'general', ?, ?, 1, 'index', NULL)
    `).run(
      BENCHMARK_ID,
      'Artificial Analysis Intelligence Index',
      'https://artificialanalysis.ai',
      'Composite benchmark aggregating ten challenging evaluations across math, science, coding, etc.'
    );
    console.log(`  ✓ created benchmark '${BENCHMARK_ID}'`);
  }

  // Upsert provider (AA as a "provider" representing the benchmark source)
  db.prepare(`
    INSERT INTO provider (id, name, type, status)
    VALUES ('aa', 'Artificial Analysis', 'cloud-api', 'active')
    ON CONFLICT(id) DO NOTHING
  `).run();

  const upsertOffering = db.prepare(`
    INSERT INTO model_provider_offering (
      id, model_id, provider_id, region,
      input_cost_per_million_usd, output_cost_per_million_usd,
      cache_read_cost_per_million_usd, cache_creation_cost_per_million_usd,
      context_window, max_output,
      status, deprecation_date,
      source_priority, source_url, fetched_at, snapshot_id
    ) VALUES (?, ?, ?, 'global', ?, ?, NULL, NULL, NULL, NULL, 'active', NULL, ?, ?, ?, ?)
    ON CONFLICT(model_id, provider_id, region, snapshot_id)
    DO UPDATE SET
      input_cost_per_million_usd = excluded.input_cost_per_million_usd,
      output_cost_per_million_usd = excluded.output_cost_per_million_usd,
      source_priority = excluded.source_priority,
      source_url = excluded.source_url,
      fetched_at = excluded.fetched_at
    WHERE excluded.source_priority > source_priority
  `);

  const upsertScore = db.prepare(`
    INSERT INTO model_benchmark_score (
      model_id, benchmark_id, snapshot_id, score,
      source_url, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id, benchmark_id, snapshot_id)
    DO UPDATE SET score = excluded.score, source_url = excluded.source_url, fetched_at = excluded.fetched_at
  `);

  const tx = db.transaction(() => {
    // Snapshot
    db.run(
      `INSERT INTO snapshot (id, taken_at, source, status)
       VALUES (?, ?, ?, 'applied')
       ON CONFLICT(id) DO NOTHING`,
      [snapshotId, takenAt, SOURCE]
    );

    let scoresUpserted = 0;
    let offeringsUpserted = 0;
    let modelsMatched = 0;
    const unmatched: string[] = [];

    for (const m of models) {
      // Match: first by slug (normalized), then by name
      const normalizedSlug = normalizeSlug(m.slug);
      let matchedId: string | undefined = modelById.get(normalizedSlug);
      if (!matchedId) {
        matchedId = modelByNameLower.get(m.name.toLowerCase());
      }
      // Try fuzzy match: slug might be "claude-3-5-haiku-20241022" but model id is "anthropic/claude-3-5-haiku"
      if (!matchedId) {
        // Try removing trailing date/version segments from slug
        const fuzzySlug = normalizedSlug.replace(/-202\d{5}$/, '').replace(/-v\d+$/, '').replace(/:.*$/, '');
        matchedId = modelById.get(fuzzySlug) ?? modelById.get(fuzzySlug.replace(/-/g, '/'));
      }

      if (!matchedId) {
        unmatched.push(m.slug);
        continue;
      }
      modelsMatched++;

      // Upsert benchmark score
      const idx = m.evaluations.artificial_analysis_intelligence_index;
      if (idx != null && Number.isFinite(idx)) {
        upsertScore.run(
          matchedId, BENCHMARK_ID, snapshotId, idx,
          `https://artificialanalysis.ai/models/${m.slug}`, takenAt
        );
        scoresUpserted++;
      }

      // Upsert offering (pricing from AA)
      const ic = m.pricing.input_cost_per_million;
      const oc = m.pricing.output_cost_per_million;
      if (ic != null || oc != null) {
        const oid = `${matchedId}::aa::global::${snapshotId}::${crypto.randomUUID().slice(0, 8)}`;
        upsertOffering.run(
          oid, matchedId, 'aa',
          ic ?? null, oc ?? null,
          SOURCE_PRIORITY,
          `https://artificialanalysis.ai/models/${m.slug}`, takenAt, snapshotId
        );
        offeringsUpserted++;
      }
    }

    return { scoresUpserted, offeringsUpserted, modelsMatched, unmatched: unmatched.slice(0, 10) };
  });

  const counts = tx();

  db.run(
    `INSERT INTO sync_run (id, source, trigger, started_at, finished_at, status, models_fetched, models_added, models_updated, models_removed)
     VALUES (?, ?, 'manual', ?, ?, 'succeeded', ?, ?, ?, 0)
     ON CONFLICT(id) DO NOTHING`,
    [`sync-${snapshotId}`, SOURCE, takenAt, takenAt, models.length, counts.scoresUpserted, 0]
  );

  db.close();
  const dur = Date.now() - t0;
  console.log(`✓ ${SOURCE} sync en ${dur}ms: ${counts.modelsMatched}/${models.length} models matched`);
  console.log(`  scores: ${counts.scoresUpserted}, offerings: ${counts.offeringsUpserted}`);
  if (counts.unmatched.length > 0) {
    console.log(`  unmatched (sample): ${counts.unmatched.join(', ')}`);
  }
  console.log(`  snapshot: ${snapshotId}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
