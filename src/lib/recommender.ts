// src/lib/recommender.ts — función pura recommend(quiz, ctx): Recommendation[].
// Ver docs/RECOMMENDER.md v0.2 para el contrato. Sin red, sin DB, sin LLM.

import { VOLUME_BINS, type BudgetBin } from './cost';

export type UseCase = 'chat-general' | 'coding' | 'agent' | 'vision' | 'embedding' | 'long-context-rag';
export type Deployment = 'cloud-api' | 'self-hosted-cpu' | 'self-hosted-gpu' | 'browser-wasm' | 'any';
export type LanguagePref = 'en' | 'es' | 'multi' | 'non-en';

export interface QuizState {
  useCase: UseCase;
  deployment: Deployment;
  budget: BudgetBin;
  language: LanguagePref;
  qualityWeight: number;       // 0..1
  minContext?: number;
  requiresFunctionCalling?: boolean;
  requiresReasoning?: boolean;
  openSourceOnly?: boolean;
}

export interface UseCaseProfile {
  benchmarks: { id: string; weight: number }[];
  criticalCapabilities: ReadonlyArray<keyof ModelFlags>;
  optionalCapabilities: ReadonlyArray<keyof ModelFlags>;
  modalityRequirements: Partial<ModelFlags>;
}

export interface ModelFlags {
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

export interface Candidate {
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
  flags: ModelFlags;
  benchmark_scores: Record<string, number>;
}

export interface Recommendation {
  rank: number;
  model_id: string;
  model_name: string;
  family: string | null;
  license: string | null;
  provider_id: string;
  provider_name: string;
  provider_type: string;
  region: string;
  total: number;
  breakdown: { calidad: number; costo: number; capabilities: number; despliegue: number; idioma: number };
  weights: { q: number; p: number; c: number; d: number; r: number };
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
  benchmarks_used: { id: string; score: number | null }[];
  offering: { input_cost: number | null; output_cost: number | null; context_window: number | null; monthly_usd: number | null };
}

export const USE_CASE_PROFILES: Record<UseCase, UseCaseProfile> = {
  'chat-general': {
    benchmarks: [
      { id: 'mmlu-pro', weight: 0.30 }, { id: 'gpqa-diamond', weight: 0.25 },
      { id: 'hle', weight: 0.20 }, { id: 'mmmu', weight: 0.25 },
    ],
    criticalCapabilities: ['mod_text_in', 'mod_text_out'],
    optionalCapabilities: ['cap_json_mode', 'cap_system_messages'],
    modalityRequirements: { mod_text_in: 1, mod_text_out: 1 },
  },
  'coding': {
    benchmarks: [
      { id: 'swe-bench-verified', weight: 0.40 }, { id: 'livecodebench', weight: 0.30 },
      { id: 'mmlu-pro', weight: 0.20 }, { id: 'gpqa-diamond', weight: 0.10 },
    ],
    criticalCapabilities: ['mod_text_in', 'mod_text_out', 'cap_function_calling'],
    optionalCapabilities: ['cap_long_horizon', 'cap_tool_code_exec'],
    modalityRequirements: { mod_text_in: 1, mod_text_out: 1 },
  },
  'agent': {
    benchmarks: [
      { id: 'swe-bench-verified', weight: 0.30 }, { id: 'livecodebench', weight: 0.20 },
      { id: 'mmlu-pro', weight: 0.20 }, { id: 'gpqa-diamond', weight: 0.15 },
      { id: 'hle', weight: 0.15 },
    ],
    criticalCapabilities: ['mod_text_in', 'mod_text_out', 'cap_function_calling', 'cap_long_horizon'],
    optionalCapabilities: ['cap_tool_browse', 'cap_tool_code_exec', 'cap_tool_file_search'],
    modalityRequirements: { mod_text_in: 1, mod_text_out: 1 },
  },
  'vision': {
    benchmarks: [
      { id: 'mmmu', weight: 0.50 }, { id: 'mmlu-pro', weight: 0.30 }, { id: 'gpqa-diamond', weight: 0.20 },
    ],
    criticalCapabilities: ['mod_text_in', 'mod_text_out', 'mod_image_in'],
    optionalCapabilities: ['cap_json_mode'],
    modalityRequirements: { mod_text_in: 1, mod_text_out: 1, mod_image_in: 1 },
  },
  'embedding': {
    benchmarks: [], // embedding quality medido por MTEB, no en seed
    criticalCapabilities: ['mod_embedding'],
    optionalCapabilities: ['mod_text_in'],
    modalityRequirements: { mod_embedding: 1 },
  },
  'long-context-rag': {
    benchmarks: [
      { id: 'ruler-128k', weight: 0.50 }, { id: 'mmlu-pro', weight: 0.30 }, { id: 'gpqa-diamond', weight: 0.20 },
    ],
    criticalCapabilities: ['mod_text_in', 'mod_text_out'],
    optionalCapabilities: ['cap_prompt_caching'],
    modalityRequirements: { mod_text_in: 1, mod_text_out: 1 },
  },
};

const QUALITY_DEFAULT = 0.5; // sin scores: asume mediana poblacional
const MAX_MONTHLY_FOR_NOLIMIT = 1000; // USD/mes donde costo → 0

export function recommend(quiz: QuizState, candidates: Candidate[]): Recommendation[] {
  const profile = USE_CASE_PROFILES[quiz.useCase];

  // Filter by deployment
  let filtered = candidates.filter((c) => {
    if (quiz.deployment === 'cloud-api') return c.provider_type === 'cloud-api';
    if (quiz.deployment === 'self-hosted-cpu' || quiz.deployment === 'self-hosted-gpu') {
      return c.provider_type === 'self-hosted' || c.provider_type === 'hybrid';
    }
    return true;
  });

  // Open source only
  if (quiz.openSourceOnly) {
    filtered = filtered.filter((c) => isOpenSourceLicense(c.license));
  }

  // Min context
  if (quiz.minContext) {
    filtered = filtered.filter((c) => (c.context_window ?? 0) >= quiz.minContext!);
  }

  // Hard requirements from advanced filters
  if (quiz.requiresFunctionCalling) filtered = filtered.filter((c) => c.flags.cap_function_calling);
  if (quiz.requiresReasoning) filtered = filtered.filter((c) => c.flags.cap_reasoning);

  // Free budget: hard filter
  if (quiz.budget === 'free') {
    filtered = filtered.filter((c) => c.input_cost === 0 && c.output_cost === 0);
  }

  // Modality + critical capabilities: hard filter
  for (const [key, val] of Object.entries(profile.modalityRequirements)) {
    if (val === 1) {
      const k = key as keyof ModelFlags;
      filtered = filtered.filter((c) => c.flags[k]);
    }
  }
  filtered = filtered.filter((c) => profile.criticalCapabilities.every((cap) => c.flags[cap]));

  // Score each
  const w_q = quiz.qualityWeight;
  const w_p = 1 - quiz.qualityWeight;
  const w_c = 0.20;
  const w_d = 0.05;
  const w_r = 0.05;
  const wSum = w_q + w_p + w_c + w_d + w_r;

  const scored: Recommendation[] = filtered.map((c) => scoreCandidate(c, quiz, profile, { w_q, w_p, w_c, w_d, w_r }));
  for (const r of scored) r.total = r.total / wSum; // normalizar a [0..1] aprox

  const CONFIDENCE_RANK: Record<Recommendation['confidence'], number> = { high: 0, medium: 1, low: 2 };
  scored.sort((a, b) => {
    if (Math.abs(b.total - a.total) > 1e-9) return b.total - a.total;
    if (a.confidence !== b.confidence) return CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    return a.model_id.localeCompare(b.model_id);
  });

  scored.forEach((r, i) => r.rank = i + 1);
  return scored.slice(0, 20);
}

function scoreCandidate(
  c: Candidate,
  quiz: QuizState,
  profile: UseCaseProfile,
  weights: { w_q: number; w_p: number; w_c: number; w_d: number; w_r: number },
): Recommendation {
  // Capability bonus: critical already hard-filtered, optional is extra
  let cap_adjust = 0.2;
  let optionalBonus = 0;
  for (const cap of profile.optionalCapabilities) {
    if (c.flags[cap]) optionalBonus += 0.05;
  }
  cap_adjust += Math.min(optionalBonus, 0.20);

  // Deployment adjustment
  let deploy_adjust = 0;
  if (quiz.deployment !== 'any') {
    if (quiz.deployment === 'cloud-api' && c.provider_type === 'cloud-api') deploy_adjust = 0.2;
    else if ((quiz.deployment === 'self-hosted-cpu' || quiz.deployment === 'self-hosted-gpu')
             && c.provider_type === 'self-hosted') deploy_adjust = 0.2;
    else if (c.provider_type !== 'cloud-api' && quiz.deployment === 'cloud-api') deploy_adjust = -0.5;
  }

  // Quality (weighted benchmark average)
  let calidad = 0;
  let totalWeight = 0;
  const benchmarksUsed: { id: string; score: number | null }[] = [];
  if (profile.benchmarks.length === 0) {
    calidad = QUALITY_DEFAULT;
  } else {
    for (const b of profile.benchmarks) {
      const score = c.benchmark_scores[b.id] ?? null;
      benchmarksUsed.push({ id: b.id, score });
      if (score != null) {
        calidad += b.weight * score;
        totalWeight += b.weight;
      }
    }
    calidad = totalWeight > 0 ? calidad / totalWeight / 100 : QUALITY_DEFAULT;
  }

  // Cost with bin
  let costo = 0;
  let monthly: number | null = null;
  if (c.input_cost != null && c.output_cost != null) {
    const v = VOLUME_BINS[quiz.budget];
    monthly = (v.inTokens / 1_000_000) * c.input_cost + (v.outTokens / 1_000_000) * c.output_cost;
    const cap = v.capUsd;
    if (cap === 0) costo = monthly === 0 ? 1 : 0;
    else if (!isFinite(cap)) costo = Math.max(0, 1 - monthly / MAX_MONTHLY_FOR_NOLIMIT);
    else costo = Math.max(0, 1 - monthly / cap);
  } else {
    costo = 0; // sin offering → no sabemos
  }

  // Language adjustment (proxy: open weights + community licenses son típicamente multilingües)
  let lang_adjust = 0;
  if (quiz.language === 'non-en' && isOpenSourceLicense(c.license)) lang_adjust = 0.1;
  else if (quiz.language === 'multi' && isOpenSourceLicense(c.license)) lang_adjust = 0.05;

  const totalRaw =
    weights.w_q * calidad +
    weights.w_p * costo +
    weights.w_c * cap_adjust +
    weights.w_d * deploy_adjust +
    weights.w_r * lang_adjust;

  // Confidence
  const scoreCount = benchmarksUsed.filter((b) => b.score != null).length;
  const confidence: 'high' | 'medium' | 'low' =
    profile.benchmarks.length === 0 ? 'low'
    : scoreCount >= 2 ? 'high'
    : scoreCount >= 1 ? 'medium'
    : 'low';

  // Notes
  const notes: string[] = [];
  notes.push('✓ Cumple las capacidades críticas para este caso.');
  if (c.input_cost === 0 && c.output_cost === 0) notes.push('✓ Open source · gratis si lo corres tú mismo.');
  if (monthly != null) notes.push(`≈ $${monthly.toFixed(monthly < 1 ? 2 : 1)}/mes con volumen ${quiz.budget}.`);
  if (c.context_window && c.context_window >= 100000) notes.push('✓ Contexto largo (≥ 100k tokens).');
  if (c.flags.cap_function_calling) notes.push('✓ Soporta function calling.');
  if (c.flags.cap_reasoning) notes.push('✓ Capacidad de razonamiento activa.');
  if (c.flags.mod_image_in) notes.push('✓ Acepta imágenes como input.');
  if (c.input_cost == null || c.output_cost == null) notes.push('⚠ Sin offering conocido para este modelo en este momento.');

  return {
    rank: 0,
    model_id: c.model_id,
    model_name: c.model_name,
    family: c.family,
    license: c.license,
    provider_id: c.provider_id,
    provider_name: c.provider_name,
    provider_type: c.provider_type,
    region: c.region,
    total: totalRaw,
    breakdown: { calidad, costo, capabilities: cap_adjust, despliegue: deploy_adjust, idioma: lang_adjust },
    weights: { q: weights.w_q, p: weights.w_p, c: weights.w_c, d: weights.w_d, r: weights.w_r },
    confidence,
    notes,
    benchmarks_used: benchmarksUsed,
    offering: { input_cost: c.input_cost, output_cost: c.output_cost, context_window: c.context_window, monthly_usd: monthly },
  };
}

function isOpenSourceLicense(license: string | null): boolean {
  if (!license) return false;
  return /apache|mit|open|community|llama|mrl|deepseek/i.test(license);
}

export function parseQuizFromUrl(params: URLSearchParams): QuizState {
  const useCase = (params.get('use') as UseCase) || 'chat-general';
  const deployment = (params.get('deploy') as Deployment) || 'any';
  const budget = (params.get('budget') as BudgetBin) || 'middle';
  const language = (params.get('lang') as LanguagePref) || 'multi';
  const qualityWeight = Math.max(0, Math.min(1, Number(params.get('qw') ?? '0.5')));
  const minContext = params.get('min_ctx') ? Number(params.get('min_ctx')) : undefined;
  const requiresFunctionCalling = params.get('req_fc') === '1';
  const requiresReasoning = params.get('req_reasoning') === '1';
  const openSourceOnly = params.get('open') === '1';
  return { useCase, deployment, budget, language, qualityWeight, minContext, requiresFunctionCalling, requiresReasoning, openSourceOnly };
}
