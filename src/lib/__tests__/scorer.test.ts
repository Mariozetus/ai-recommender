import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  calculateDetailedScore,
  sortByScore,
  topRecommendations,
  DEFAULT_WEIGHTS,
  QUALITY_FIRST_WEIGHTS,
  BUDGET_FIRST_WEIGHTS,
  BALANCED_WEIGHTS,
} from '../scorer';
import type { AIModel, UserPreferences, ScoreWeights } from '../types';

const baseModel: AIModel = {
  id: 'test/model',
  name: 'Test Model',
  provider: 'Test',
  description: 'A test model',
  source: 'openrouter',
  category: 'chat',
  context_window: 128000,
  input_price: 3,
  output_price: 15,
  tags: ['vision', 'tools'],
  url: 'https://example.com',
  fetched_at: new Date().toISOString(),
};

const basePrefs: UserPreferences = {
  use_case: 'chat',
  max_context: 200000,
  max_budget: 50,
  preferred_features: ['vision', 'function-calling'],
};

describe('calculateScore', () => {
  it('returns a positive score for a matching category model', () => {
    const score = calculateScore(baseModel, basePrefs);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('penalizes models that exceed budget', () => {
    const highBudget = calculateScore(baseModel, basePrefs);
    const lowBudget = calculateScore(baseModel, { ...basePrefs, max_budget: 5 });
    expect(lowBudget).toBeLessThan(highBudget);
  });

  it('boosts models with high benchmark scores', () => {
    const noBench = calculateScore(baseModel, basePrefs);
    const withBench = calculateScore(
      { ...baseModel, benchmark: { mmlu: 90, humaneval: 95 } },
      basePrefs
    );
    expect(withBench).toBeGreaterThan(noBench);
  });

  it('boosts free models', () => {
    const freeScore = calculateScore({ ...baseModel, pricing: { free: true } }, basePrefs);
    const paidScore = calculateScore(baseModel, basePrefs);
    expect(freeScore).toBeGreaterThan(paidScore);
  });

  it('boosts models that match preferred features', () => {
    const withFeatures = calculateScore(
      { ...baseModel, tags: ['vision', 'function-calling', 'tools'] },
      basePrefs
    );
    const withoutFeatures = calculateScore({ ...baseModel, tags: [] }, basePrefs);
    expect(withFeatures).toBeGreaterThan(withoutFeatures);
  });

  it('penalizes models that exceed context window', () => {
    const smallContext = calculateScore(
      { ...baseModel, context_window: 5000 },
      basePrefs
    );
    const largeContext = calculateScore(
      { ...baseModel, context_window: 200000 },
      basePrefs
    );
    expect(largeContext).toBeGreaterThan(smallContext);
  });
});

describe('calculateDetailedScore', () => {
  it('returns breakdown with all 5 dimensions', () => {
    const result = calculateDetailedScore(baseModel, basePrefs);
    expect(result.breakdown).toHaveProperty('category_match');
    expect(result.breakdown).toHaveProperty('context');
    expect(result.breakdown).toHaveProperty('cost');
    expect(result.breakdown).toHaveProperty('quality');
    expect(result.breakdown).toHaveProperty('features');
    expect(result.total).toBe(result.breakdown.category_match * 0.25 +
      result.breakdown.context * 0.20 +
      result.breakdown.cost * 0.25 +
      result.breakdown.quality * 0.20 +
      result.breakdown.features * 0.10);
  });

  it('weights affect the total score', () => {
    const defaultResult = calculateDetailedScore(baseModel, basePrefs);
    const qualityFirst: ScoreWeights = { ...DEFAULT_WEIGHTS, quality: 80, cost: 5 };
    const qualityFirstResult = calculateDetailedScore(baseModel, basePrefs, qualityFirst);
    expect(defaultResult.total).not.toBe(qualityFirstResult.total);
  });
});

describe('sortByScore', () => {
  it('sorts models by score descending', () => {
    const models: AIModel[] = [
      { ...baseModel, id: 'cheap', input_price: 0.1, output_price: 0.1 },
      { ...baseModel, id: 'expensive', input_price: 50, output_price: 100 },
    ];
    const prefs: UserPreferences = {
      use_case: 'chat',
      max_context: 200000,
      max_budget: 100,
      preferred_features: [],
    };
    const sorted = sortByScore(models, prefs);
    expect(sorted[0].model.id).toBe('cheap');
    expect(sorted[1].model.id).toBe('expensive');
    expect(sorted[0].score).toBeGreaterThanOrEqual(sorted[1].score);
  });

  it('returns score breakdown for each model', () => {
    const models: AIModel[] = [baseModel];
    const sorted = sortByScore(models, basePrefs);
    expect(sorted[0].breakdown).toBeDefined();
    expect(sorted[0].breakdown.category_match).toBeDefined();
  });
});

describe('topRecommendations', () => {
  it('returns the top N models', () => {
    const models = Array.from({ length: 20 }, (_, i) => ({
      ...baseModel,
      id: `model-${i}`,
      input_price: i,
      output_price: i * 2,
    }));
    const top = topRecommendations(models, basePrefs, 5);
    expect(top).toHaveLength(5);
  });

  it('respects the limit parameter', () => {
    const models = Array.from({ length: 50 }, (_, i) => ({ ...baseModel, id: `m${i}` }));
    const top = topRecommendations(models, basePrefs, 10);
    expect(top).toHaveLength(10);
  });
});

describe('Preset weights', () => {
  it('QUALITY_FIRST_WEIGHTS values sum correctly', () => {
    expect(QUALITY_FIRST_WEIGHTS.quality).toBeGreaterThan(DEFAULT_WEIGHTS.quality);
  });
  it('BUDGET_FIRST_WEIGHTS values sum correctly', () => {
    expect(BUDGET_FIRST_WEIGHTS.cost).toBeGreaterThan(DEFAULT_WEIGHTS.cost);
  });
  it('BALANCED_WEIGHTS gives equal weight to all dimensions', () => {
    expect(BALANCED_WEIGHTS.category_match).toBe(BALANCED_WEIGHTS.context);
    expect(BALANCED_WEIGHTS.context).toBe(BALANCED_WEIGHTS.cost);
  });
});
