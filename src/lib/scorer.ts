import type { AIModel, UserPreferences } from './types';

export function calculateScore(model: AIModel, prefs: UserPreferences): number {
  let score = 0;

  if (model.category === prefs.use_case) {
    score += 40;
  }

  const contextPenalty = Math.max(0, model.context_window - prefs.max_context);
  score += Math.max(0, 20 - contextPenalty / 10000);

  const totalCost = model.input_price + model.output_price;
  const budgetPenalty = Math.max(0, totalCost - prefs.max_budget);
  score += Math.max(0, 20 - budgetPenalty * 2);

  if (model.benchmark?.mmlu) {
    score += model.benchmark.mmlu * 0.15;
  }
  if (model.benchmark?.humaneval) {
    score += model.benchmark.humaneval * 0.15;
  }

  const tagMatches = model.tags.filter(tag =>
    prefs.preferred_features.some(f => f.toLowerCase().includes(tag.toLowerCase()))
  ).length;
  score += tagMatches * 2;

  return Math.round(score * 100) / 100;
}

export function sortByScore(models: AIModel[], prefs: UserPreferences): AIModel[] {
  return [...models]
    .map(m => ({ model: m, score: calculateScore(m, prefs) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.model);
}
