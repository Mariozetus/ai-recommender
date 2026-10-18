// sync/hf-benchmarks.ts — ingiere benchmark scores desde HuggingFace public leaderboard APIs.
//
// Fuentes:
//   1. cais/hle          → HLE (Humanity's Last Exam) leaderboard API
//   2. SWE-bench/SWE-bench_Verified → SWE-bench Verified leaderboard API
//
// Uso:
//   HF_TOKEN=hf_xxx bun run sync/hf-benchmarks.ts     # live + write
//   HF_TOKEN=hf_xxx bun run sync/hf-benchmarks.ts --dry-run # diff only
//   bun run sync/hf-benchmarks.ts                       # sin token → usa fuentes públicas sin auth
//
// El token HF (opcional) desbloquea más endpoints si están disponibles.

import { Database } from 'bun:sqlite';
import { fetchWithRetry } from './common.ts';
import { writeFileSync, mkdirSync } from 'node:fs';

const SOURCE = 'manual';
const SOURCE_PRIORITY = 15;
const DB_FILE = './db/data/ai-recommender.db';
const normId = (id: string) => id.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9./-]/g, '-');

// ─── Sources ───────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number;
  modelId: string;
  value: number;
  source?: { url?: string; name?: string };
  num_parameters?: number;
  notes?: string;
}

interface BenchmarkDef {
  id: string;
  name: string;
  category: string;
  sourceUrl: string;
  unit: string;
  hfUrl: string;
}

const BENCHMARKS: BenchmarkDef[] = [
  {
    id: 'hle',
    name: "Humanity's Last Exam",
    category: 'reasoning',
    sourceUrl: 'https://agi.safe.ai/HLE',
    unit: '%',
    hfUrl: 'https://huggingface.co/api/datasets/cais/hle/leaderboard',
  },
  {
    id: 'swe-bench-verified',
    name: 'SWE-bench Verified',
    category: 'coding',
    sourceUrl: 'https://www.swebench.com',
    unit: '%',
    hfUrl: 'https://huggingface.co/api/datasets/SWE-bench/SWE-bench_Verified/leaderboard',
  },
];

const takenAt = new Date().toISOString();
const snapshotId = `${takenAt.slice(0, 10)}-${SOURCE}`;

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchLeaderboard(bench: BenchmarkDef): Promise<LeaderboardEntry[]> {
  console.log(`→ fetch ${bench.hfUrl}`);
  const res = await fetchWithRetry(bench.hfUrl, { timeoutMs: 30_000 });
  if (!res.ok) {
    // Si 401/403 sin token, no es crítico — skip gracefully
    if (res.status === 401 || res.status === 403) {
      console.log(`  ⚠ auth required (${res.status}), skipping ${bench.id}`);
      return [];
    }
    throw new Error(`HF API ${res.status} for ${bench.id}`);
  }
  const json = (await res.json()) as LeaderboardEntry[];
  console.log(`  ${json.length} entries for ${bench.id}`);
  return json;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  mkdirSync('./db/data/raw', { recursive: true });
  const cachePath = `./db/data/raw/${SOURCE}-${takenAt.slice(0, 10)}.json`;

  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');

  // Fetch all leaderboards
  const allEntries = new Map<string, LeaderboardEntry[]>(); // benchId → entries
  for (const bench of BENCHMARKS) {
    const entries = await fetchLeaderboard(bench);
    allEntries.set(bench.id, entries);
  }

  const totalEntries = [...allEntries.values()].reduce((s, e) => s + e.length, 0);
  console.log(`  Total: ${totalEntries} entries across ${allEntries.size} benchmarks`);

  if (dryRun) {
    for (const [benchId, entries] of allEntries) {
      console.log(`\n  ${benchId} (${entries.length} entries):`);
      for (const e of entries.slice(0, 3)) {
        console.log(`    ${e.modelId}: ${e.value}`);
      }
    }
    return;
  }

  writeFileSync(cachePath, JSON.stringify(Object.fromEntries(allEntries), null, 2));
  console.log(`  cached to ${cachePath}`);

  const db = new Database(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Load existing model IDs and names
  const existingModels = (
    db.prepare('SELECT id, name FROM model').all() as Array<{ id: string; name: string }>
  );
  const modelById = new Map<string, string>();
  const modelByLowerName = new Map<string, string>();
  for (const m of existingModels) {
    modelById.set(m.id, m.id);
    modelByLowerName.set(m.name.toLowerCase(), m.id);
  }

  // Ensure benchmarks exist
  const upsertBenchmark = db.prepare(`
    INSERT INTO benchmark (id, name, category, source_url, higher_is_better, unit, cost_dimension)
    VALUES (?, ?, ?, ?, 1, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, source_url=excluded.source_url
  `);

  for (const bench of BENCHMARKS) {
    upsertBenchmark.run(bench.id, bench.name, bench.category, bench.sourceUrl, bench.unit);
  }

  // Upsert snapshot
  db.run(
    `INSERT INTO snapshot (id, taken_at, source, status)
     VALUES (?, ?, ?, 'applied')
     ON CONFLICT(id) DO NOTHING`,
    [snapshotId, takenAt, SOURCE]
  );

  const upsertScore = db.prepare(`
    INSERT INTO model_benchmark_score (
      model_id, benchmark_id, snapshot_id, score,
      source_url, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id, benchmark_id, snapshot_id)
    DO UPDATE SET score = excluded.score, source_url = excluded.source_url, fetched_at = excluded.fetched_at
  `);

  const tx = db.transaction(() => {
    let scoresUpserted = 0;
    let modelsMatched = 0;
    const unmatchedSamples: string[] = [];

    for (const [benchId, entries] of allEntries) {
      for (const entry of entries) {
        const hfId = normId(entry.modelId);
        let matchedId = modelById.get(hfId);

        // Fallback: match by extracting model name from org/name
        if (!matchedId) {
          const parts = entry.modelId.split('/');
          const modelPart = parts.at(-1) ?? entry.modelId;
          matchedId = modelById.get(normId(modelPart));
        }

        // Fallback: match by lowercased name
        if (!matchedId) {
          matchedId = modelByLowerName.get(entry.modelId.toLowerCase());
        }

        if (!matchedId) {
          if (unmatchedSamples.length < 20) {
            unmatchedSamples.push(entry.modelId);
          }
          continue;
        }

        const sourceUrl = entry.source?.url ?? `https://huggingface.co/${entry.modelId}`;
        upsertScore.run(matchedId, benchId, snapshotId, entry.value, sourceUrl, takenAt);
        scoresUpserted++;
        modelsMatched++;
      }
    }

    return { scoresUpserted, modelsMatched, unmatchedSamples };
  });

  const counts = tx();

  db.run(
    `INSERT INTO sync_run (id, source, trigger, started_at, finished_at, status, models_fetched, models_added, models_updated, models_removed)
     VALUES (?, ?, 'manual', ?, ?, 'succeeded', ?, ?, ?, 0)
     ON CONFLICT(id) DO NOTHING`,
    [`sync-${snapshotId}`, SOURCE, takenAt, takenAt, totalEntries, counts.scoresUpserted, 0]
  );

  db.close();
  const dur = Date.now() - t0;
  console.log(`\n✓ ${SOURCE} sync en ${dur}ms`);
  console.log(`  ${counts.modelsMatched} model scores upserted (${counts.scoresUpserted} total)`);
  if (counts.unmatchedSamples.length > 0) {
    console.log(`  unmatched (sample): ${counts.unmatchedSamples.slice(0, 5).join(', ')}`);
  }
  console.log(`  snapshot: ${snapshotId}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
