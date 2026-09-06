import type { AIModel, UserPreferences, ScoreWeights, ScoreBreakdown } from './types';

export const DEFAULT_WEIGHTS: ScoreWeights = {
  category_match: 25,
  context: 20,
  cost: 25,
  quality: 20,
  features: 10,
};

export const QUALITY_FIRST_WEIGHTS: ScoreWeights = {
  category_match: 15,
  context: 10,
  cost: 10,
  quality: 50,
  features: 15,
};

export const BUDGET_FIRST_WEIGHTS: ScoreWeights = {
  category_match: 20,
  context: 15,
  cost: 50,
  quality: 10,
  features: 5,
};

export const BALANCED_WEIGHTS: ScoreWeights = {
  category_match: 20,
  context: 20,
  cost: 20,
  quality: 20,
  features: 20,
};

function normalizeContext(model: AIModel, maxContext: number): number {
  const ratio = model.context_window / maxContext;
  return Math.min(1, ratio) * 100;
}

function normalizeCost(model: AIModel, maxBudget: number): number {
  if (model.pricing?.free) return 100;
  const totalCost = model.input_price + model.output_price;
  if (totalCost === 0) return 100;
  if (totalCost > maxBudget) return 0;
  const ratio = 1 - totalCost / maxBudget;
  return ratio * 100;
}

function normalizeQuality(model: AIModel): number {
  let score = 0;
  let count = 0;

  if (typeof model.benchmark?.mmlu === 'number') {
    score += model.benchmark.mmlu;
    count++;
  }
  if (typeof model.benchmark?.humaneval === 'number') {
    score += model.benchmark.humaneval;
    count++;
  }
  if (typeof model.benchmark?.math === 'number') {
    score += model.benchmark.math;
    count++;
  }
  if (typeof model.benchmark?.arena_elo === 'number') {
    score += Math.min(100, model.benchmark.arena_elo / 14);
    count++;
  }

  if (count === 0) return 50;
  return score / count;
}

function categoryMatchScore(model: AIModel, useCase: string): number {
  if (model.category === useCase) return 100;

  const related: Record<string, string[]> = {
    chat: ['multimodal', 'reasoning'],
    coding: ['reasoning', 'chat'],
    reasoning: ['coding', 'chat'],
    image: ['multimodal'],
    embedding: ['chat'],
    multimodal: ['chat', 'image'],
  };

  const relatedTo = related[useCase] || [];
  if (relatedTo.includes(model.category)) return 50;

  return 0;
}

function featuresScore(model: AIModel, preferredFeatures: string[]): number {
  if (preferredFeatures.length === 0) return 50;

  let matches = 0;
  const modelTagsLower = model.tags.map(t => t.toLowerCase());
  const modelDesc = model.description.toLowerCase();

  for (const feature of preferredFeatures) {
    const f = feature.toLowerCase();
    if (modelTagsLower.some(t => t.includes(f) || f.includes(t))) matches++;
    else if (modelDesc.includes(f)) matches += 0.5;
  }

  return Math.min(100, (matches / preferredFeatures.length) * 100);
}

export interface DetailedScore {
  total: number;
  breakdown: ScoreBreakdown;
}

export function calculateDetailedScore(
  model: AIModel,
  prefs: UserPreferences,
  weights: ScoreWeights = DEFAULT_WEIGHTS
): DetailedScore {
  const breakdown: ScoreBreakdown = {
    category_match: categoryMatchScore(model, prefs.use_case),
    context: normalizeContext(model, prefs.max_context),
    cost: normalizeCost(model, prefs.max_budget),
    quality: normalizeQuality(model),
    features: featuresScore(model, prefs.preferred_features),
  };

  const total =
    (breakdown.category_match * weights.category_match +
      breakdown.context * weights.context +
      breakdown.cost * weights.cost +
      breakdown.quality * weights.quality +
      breakdown.features * weights.features) /
    100;

  return { total: Math.round(total * 100) / 100, breakdown };
}

export function calculateScore(
  model: AIModel,
  prefs: UserPreferences,
  weights?: ScoreWeights
): number {
  return calculateDetailedScore(model, prefs, weights).total;
}

export function sortByScore(
  models: AIModel[],
  prefs: UserPreferences,
  weights?: ScoreWeights
): Array<{ model: AIModel; score: number; breakdown: ScoreBreakdown }> {
  return models
    .map(m => {
      const detailed = calculateDetailedScore(m, prefs, weights);
      return { model: m, score: detailed.total, breakdown: detailed.breakdown };
    })
    .sort((a, b) => b.score - a.score);
}

export function topRecommendations(
  models: AIModel[],
  prefs: UserPreferences,
  limit: number = 12,
  weights?: ScoreWeights
) {
  return sortByScore(models, prefs, weights).slice(0, limit);
}
