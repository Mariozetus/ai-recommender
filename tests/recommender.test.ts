// tests/recommender.test.ts — unit tests de la lógica pura del recomendador.
// Ejecutar con: bun test

import { describe, test, expect } from 'bun:test';
import { recommend, parseQuizFromUrl, type Candidate, type QuizState, type ModelFlags } from '../src/lib/recommender';

const ZERO_FLAGS: ModelFlags = {
  mod_text_in: 0, mod_text_out: 0, mod_image_in: 0, mod_image_out: 0,
  mod_audio_in: 0, mod_audio_out: 0, mod_embedding: 0,
  cap_function_calling: 0, cap_json_mode: 0, cap_system_messages: 0,
  cap_prompt_caching: 0, cap_reasoning: 0, cap_tool_browse: 0,
  cap_tool_code_exec: 0, cap_tool_file_search: 0, cap_long_horizon: 0,
};

function mk(over: Partial<Candidate> & { model_id: string }): Candidate {
  return {
    model_id: over.model_id,
    model_name: over.model_name ?? over.model_id,
    family: over.family ?? null,
    license: over.license ?? null,
    provider_id: over.provider_id ?? 'p',
    provider_name: over.provider_name ?? 'Provider',
    provider_type: over.provider_type ?? 'cloud-api',
    region: over.region ?? 'global',
    input_cost: over.input_cost ?? null,
    output_cost: over.output_cost ?? null,
    cache_read: over.cache_read ?? null,
    context_window: over.context_window ?? null,
    flags: over.flags ?? { ...ZERO_FLAGS },
    benchmark_scores: over.benchmark_scores ?? {},
  };
}

const CANDIDATES: Candidate[] = [
  mk({
    model_id: 'openai/gpt-5',
    model_name: 'GPT-5',
    family: 'gpt-5',
    license: 'proprietary',
    input_cost: 1.25, output_cost: 10.0,
    context_window: 400000,
    flags: { ...ZERO_FLAGS, mod_text_in: 1, mod_text_out: 1, mod_image_in: 1, cap_function_calling: 1, cap_json_mode: 1, cap_system_messages: 1, cap_prompt_caching: 1, cap_reasoning: 1, cap_long_horizon: 1 },
    benchmark_scores: { 'mmlu-pro': 87, 'gpqa-diamond': 81, 'swe-bench-verified': 72, 'mmmu': 81, 'tau-bench': 68 },
  }),
  mk({
    model_id: 'anthropic/claude-4-sonnet',
    model_name: 'Claude 4 Sonnet',
    license: 'proprietary',
    input_cost: 3.0, output_cost: 15.0,
    context_window: 200000,
    flags: { ...ZERO_FLAGS, mod_text_in: 1, mod_text_out: 1, mod_image_in: 1, cap_function_calling: 1, cap_system_messages: 1, cap_prompt_caching: 1, cap_reasoning: 1, cap_long_horizon: 1, cap_tool_browse: 1, cap_tool_code_exec: 1, cap_tool_file_search: 1 },
    benchmark_scores: { 'mmlu-pro': 86.5, 'gpqa-diamond': 79.8, 'swe-bench-verified': 75.4, 'mmmu': 79, 'tau-bench': 73 },
  }),
  mk({
    model_id: 'meta/llama-3.3-70b',
    model_name: 'Llama 3.3 70B',
    license: 'llama-community',
    input_cost: 0, output_cost: 0,
    context_window: 128000,
    provider_id: 'ollama', provider_name: 'Ollama', provider_type: 'self-hosted',
    flags: { ...ZERO_FLAGS, mod_text_in: 1, mod_text_out: 1, cap_function_calling: 1, cap_json_mode: 1, cap_system_messages: 1 },
    benchmark_scores: { 'mmlu-pro': 72, 'gpqa-diamond': 50, 'livecodebench': 28, 'ruler-128k': 85 },
  }),
  mk({
    model_id: 'qwen/qwen-3-embedding',
    model_name: 'Qwen 3 Embedding',
    license: 'apache-2.0',
    input_cost: 0.05, output_cost: 0,
    context_window: 8192,
    flags: { ...ZERO_FLAGS, mod_text_in: 1, mod_embedding: 1 },
    benchmark_scores: {},
  }),
  mk({
    model_id: 'openai/text-embedding-3-small',
    model_name: 'text-embedding-3-small',
    license: 'proprietary',
    input_cost: 0.02, output_cost: 0,
    context_window: 8191,
    flags: { ...ZERO_FLAGS, mod_embedding: 1 },
    benchmark_scores: {},
  }),
  mk({
    model_id: 'meta/code-no-fc',
    model_name: 'Code Model No FC',
    license: 'mit',
    input_cost: 0.5, output_cost: 1.0,
    context_window: 32000,
    flags: { ...ZERO_FLAGS, mod_text_in: 1, mod_text_out: 1 },
    benchmark_scores: { 'swe-bench-verified': 50, 'mmlu-pro': 70 },
  }),
];

const baseQuiz: QuizState = {
  useCase: 'chat-general',
  deployment: 'any',
  budget: 'no-limit',
  language: 'multi',
  qualityWeight: 0.5,
};

describe('recommend() · ranking', () => {
  test('returns sorted by total desc, ranks 1..N', () => {
    const recs = recommend(baseQuiz, CANDIDATES);
    expect(recs.length).toBeGreaterThan(0);
    for (let i = 0; i < recs.length - 1; i++) {
      expect(recs[i].total).toBeGreaterThanOrEqual(recs[i + 1].total);
    }
    expect(recs.map((r) => r.rank)).toEqual(recs.map((_, i) => i + 1));
  });

  test('qualityWeight=1.0 ranks gpt-5 (best benchmarks) first', () => {
    const recs = recommend({ ...baseQuiz, qualityWeight: 1.0 }, CANDIDATES);
    expect(recs[0].model_id).toBe('openai/gpt-5');
  });

  test('qualityWeight=0 ranks cheapest first', () => {
    const recs = recommend({ ...baseQuiz, qualityWeight: 0 }, CANDIDATES);
    expect(recs[0].offering.input_cost).toBe(0);
  });

  test('empty candidates returns empty array', () => {
    expect(recommend(baseQuiz, [])).toEqual([]);
  });
});

describe('recommend() · filters', () => {
  test('embedding use case only shows embedding models', () => {
    const recs = recommend({ ...baseQuiz, useCase: 'embedding' }, CANDIDATES);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.model_id.includes('embedding'))).toBe(true);
  });

  test('agent use case requires function_calling', () => {
    const recs = recommend({ ...baseQuiz, useCase: 'agent' }, CANDIDATES);
    expect(recs.find((r) => r.model_id === 'meta/code-no-fc')).toBeUndefined();
  });

  test('vision use case requires mod_image_in', () => {
    const recs = recommend({ ...baseQuiz, useCase: 'vision' }, CANDIDATES);
    expect(recs.find((r) => r.model_id === 'meta/llama-3.3-70b')).toBeUndefined();
    expect(recs.find((r) => r.model_id === 'openai/gpt-5')).toBeDefined();
  });

  test('free budget only shows $0 offerings', () => {
    const recs = recommend({ ...baseQuiz, budget: 'free' }, CANDIDATES);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.offering.input_cost === 0 && r.offering.output_cost === 0)).toBe(true);
  });

  test('openSourceOnly filters proprietary', () => {
    const recs = recommend({ ...baseQuiz, openSourceOnly: true }, CANDIDATES);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => /apache|mit|llama|community/i.test(r.license ?? ''))).toBe(true);
  });

  test('minContext filters out small-context models', () => {
    const recs = recommend({ ...baseQuiz, minContext: 200000 }, CANDIDATES);
    expect(recs.every((r) => (r.offering.context_window ?? 0) >= 200000)).toBe(true);
  });

  test('deployment=self-hosted-gpu keeps only self-hosted or hybrid', () => {
    const recs = recommend({ ...baseQuiz, deployment: 'self-hosted-gpu' }, CANDIDATES);
    expect(recs.every((r) => r.provider_type === 'self-hosted' || r.provider_type === 'hybrid')).toBe(true);
  });

  test('requiresFunctionCalling hard filter', () => {
    const recs = recommend({ ...baseQuiz, requiresFunctionCalling: true }, CANDIDATES);
    expect(recs.every((r) => r.model_id !== 'meta/code-no-fc')).toBe(true);
  });
});

describe('recommend() · scoring math', () => {
  test('monthly cost in middle bin: GPT-5 ≈ 0.5·1.25 + 2·10 = 20.625 USD/mes', () => {
    const recs = recommend({ ...baseQuiz, useCase: 'chat-general', budget: 'middle' }, CANDIDATES);
    const gpt5 = recs.find((r) => r.model_id === 'openai/gpt-5');
    expect(gpt5).toBeDefined();
    expect(gpt5!.offering.monthly_usd!).toBeCloseTo(20.625, 2);
  });

  test('penalty for missing critical cap (now hard filter, so noFc is excluded)', () => {
    const recs = recommend({ ...baseQuiz, useCase: 'coding' }, CANDIDATES);
    expect(recs.find((r) => r.model_id === 'meta/code-no-fc')).toBeUndefined();
  });
});

describe('recommend() · output fields', () => {
  test('confidence is high for ≥ 2 benchmarks', () => {
    const recs = recommend(baseQuiz, CANDIDATES);
    const gpt5 = recs.find((r) => r.model_id === 'openai/gpt-5');
    expect(gpt5?.confidence).toBe('high');
  });

  test('confidence is low for embedding models with no benchmarks', () => {
    const recs = recommend({ ...baseQuiz, useCase: 'embedding' }, CANDIDATES);
    expect(recs.every((r) => r.confidence === 'low')).toBe(true);
  });

  test('notes mention caps for filtered-in models', () => {
    const recs = recommend({ ...baseQuiz, useCase: 'coding' }, CANDIDATES);
    const llama = recs.find((r) => r.model_id === 'meta/llama-3.3-70b');
    expect(llama?.notes.some((n) => n.includes('Cumple'))).toBe(true);
  });

  test('notes mention open source for $0 models', () => {
    const recs = recommend(baseQuiz, CANDIDATES);
    const llama = recs.find((r) => r.model_id === 'meta/llama-3.3-70b');
    expect(llama?.notes.some((n) => n.includes('Open source') || n.includes('gratis'))).toBe(true);
  });
});

describe('parseQuizFromUrl()', () => {
  test('parses params', () => {
    const q = parseQuizFromUrl(new URLSearchParams('use=coding&budget=low&qw=0.8'));
    expect(q.useCase).toBe('coding');
    expect(q.budget).toBe('low');
    expect(q.qualityWeight).toBe(0.8);
  });

  test('default values when no params', () => {
    const q = parseQuizFromUrl(new URLSearchParams(''));
    expect(q.useCase).toBe('chat-general');
    expect(q.budget).toBe('middle');
    expect(q.qualityWeight).toBe(0.5);
  });

  test('clamps qualityWeight to [0, 1]', () => {
    expect(parseQuizFromUrl(new URLSearchParams('qw=1.5')).qualityWeight).toBe(1);
    expect(parseQuizFromUrl(new URLSearchParams('qw=-0.5')).qualityWeight).toBe(0);
  });

  test('parses boolean toggles', () => {
    const q = parseQuizFromUrl(new URLSearchParams('open=1&req_fc=1&req_reasoning=0'));
    expect(q.openSourceOnly).toBe(true);
    expect(q.requiresFunctionCalling).toBe(true);
    expect(q.requiresReasoning).toBe(false);
  });
});
