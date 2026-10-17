// src/lib/recommender-data.ts — carga candidatos del recomendador desde la DB.

import { Database } from 'bun:sqlite';
import type { Candidate } from './recommender';

const DB_FILE = './db/data/ai-recommender.db';

interface CandidateRow {
  model_id: string;
  model_name: string;
  family: string | null;
  license: string | null;
  provider_id: string;
  provider_name: string;
  provider_type: string;
  region: string;
  input_cost: number | null;
  output_cost: number | null;
  cache_read: number | null;
  context_window: number | null;
  mod_text_in: number;
  mod_text_out: number;
  mod_image_in: number;
  mod_image_out: number;
  mod_audio_in: number;
  mod_audio_out: number;
  mod_embedding: number;
  cap_function_calling: number;
  cap_json_mode: number;
  cap_system_messages: number;
  cap_prompt_caching: number;
  cap_reasoning: number;
  cap_tool_browse: number;
  cap_tool_code_exec: number;
  cap_tool_file_search: number;
  cap_long_horizon: number;
}

export function loadCandidates(opts: { providerTypes?: string[]; limit?: number } = {}): Candidate[] {
  const db = new Database(DB_FILE, { readonly: true });

  // Deduplica por model_id: si un modelo tiene varios providers, conservamos todos los offerings (1 fila por (model, provider))
  const args: unknown[] = [];
  let where = '';
  if (opts.providerTypes && opts.providerTypes.length > 0) {
    const placeholders = opts.providerTypes.map(() => '?').join(',');
    where = `WHERE p.type IN (${placeholders})`;
    args.push(...opts.providerTypes);
  }
  const limit = opts.limit ?? 5000;

  const rows = db
    .prepare(`
      SELECT
        m.id as model_id, m.name as model_name, m.family, m.license,
        p.id as provider_id, p.name as provider_name, p.type as provider_type,
        o.region,
        o.input_cost_per_million_usd as input_cost,
        o.output_cost_per_million_usd as output_cost,
        o.cache_read_cost_per_million_usd as cache_read,
        o.context_window as context_window,
        m.mod_text_in, m.mod_text_out, m.mod_image_in, m.mod_image_out, m.mod_audio_in, m.mod_audio_out, m.mod_embedding,
        m.cap_function_calling, m.cap_json_mode, m.cap_system_messages, m.cap_prompt_caching,
        m.cap_reasoning, m.cap_tool_browse, m.cap_tool_code_exec, m.cap_tool_file_search, m.cap_long_horizon
      FROM model m
      INNER JOIN model_provider_offering o ON o.model_id = m.id
      INNER JOIN provider p ON p.id = o.provider_id
      ${where}
      ORDER BY m.id, p.name
      LIMIT ? OFFSET 0
    `)
    .all(...args, limit) as CandidateRow[];

  // Carga scores en bloque
  const scores = db
    .prepare(`
      SELECT model_id, benchmark_id, score
      FROM model_benchmark_score
    `)
    .all() as Array<{ model_id: string; benchmark_id: string; score: number }>;

  const scoreMap: Record<string, Record<string, number>> = {};
  for (const s of scores) {
    (scoreMap[s.model_id] ??= {})[s.benchmark_id] = s.score;
  }

  db.close();

  return rows.map((r): Candidate => ({
    model_id: r.model_id,
    model_name: r.model_name,
    family: r.family,
    license: r.license,
    provider_id: r.provider_id,
    provider_name: r.provider_name,
    provider_type: r.provider_type,
    region: r.region,
    input_cost: r.input_cost,
    output_cost: r.output_cost,
    cache_read: r.cache_read,
    context_window: r.context_window,
    flags: {
      mod_text_in: r.mod_text_in, mod_text_out: r.mod_text_out,
      mod_image_in: r.mod_image_in, mod_image_out: r.mod_image_out,
      mod_audio_in: r.mod_audio_in, mod_audio_out: r.mod_audio_out,
      mod_embedding: r.mod_embedding,
      cap_function_calling: r.cap_function_calling, cap_json_mode: r.cap_json_mode,
      cap_system_messages: r.cap_system_messages, cap_prompt_caching: r.cap_prompt_caching,
      cap_reasoning: r.cap_reasoning, cap_tool_browse: r.cap_tool_browse,
      cap_tool_code_exec: r.cap_tool_code_exec, cap_tool_file_search: r.cap_tool_file_search,
      cap_long_horizon: r.cap_long_horizon,
    },
    benchmark_scores: scoreMap[r.model_id] ?? {},
  }));
}
