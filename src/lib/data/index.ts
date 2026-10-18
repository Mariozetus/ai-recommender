// src/lib/data/index.ts — re-exports tipados de los data files generados por scripts/build-data.ts.
// Imports directos de los .ts (cada archivo es `export default ... as const`).

import modelsData from './models';
import providersData from './providers';
import benchmarksData from './benchmarks';
import healthData from './health';
import conceptsData from './concepts';
import snapshotsData from './snapshots';

export const models = modelsData as unknown as Array<{
  id: string; name: string; family: string | null; license: string | null; parameter_count: string | null;
  context_window: number | null; max_output: number | null; release_date: string | null;
  flags: Record<string, number>;
  benchmark_scores: Record<string, number>;
  offerings: Array<{ provider_id: string; provider_name: string; provider_type: string; region: string; input_cost: number | null; output_cost: number | null; cache_read: number | null; context_window: number | null }>;
}>;
export const providers = providersData as unknown as Array<{ id: string; name: string; type: string }>;
export const benchmarks = benchmarksData as unknown as Array<{ id: string; name: string; category: string }>;
export const health = healthData as {
  status: string; db: boolean;
  totals: { models: number; benchmarks: number; active_offerings: number };
  sources: Record<string, { last_success: string | null; last_status: string | null; lag_hours: number | null }>;
};
export const concepts = conceptsData as unknown as Array<{ slug: string; locale: string; title: string; body_md: string; updated_at: string }>;
export const snapshots = snapshotsData as unknown as Array<{ id: string; taken_at: string; source: string; status: string }>;
