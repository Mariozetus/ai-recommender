import { describe, it, expect } from 'vitest';
import { calculateScore, sortByScore } from '../scorer';
import type { AIModel, UserPreferences } from '../types';

const mockModel: AIModel = {
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

const mockPrefs: UserPreferences = {
  use_case: 'chat',
  max_context: 200000,
  max_budget: 50,
  preferred_features: ['vision', 'function-calling'],
};

describe('calculateScore', () => {
  it('adds 40 points for matching category', () => {
    const score = calculateScore(mockModel, mockPrefs);
    expect(score).toBeGreaterThan(40);
  });

  it('penalizes models over budget', () => {
    const expensivePrefs = { ...mockPrefs, max_budget: 5 };
    const cheapScore = calculateScore(mockModel, mockPrefs);
    const expensiveScore = calculateScore(mockModel, expensivePrefs);
    expect(expensiveScore).toBeLessThan(cheapScore);
  });

  it('adds points for benchmark scores', () => {
    const modelWithBenchmarks = {
      ...mockModel,
      benchmark: { mmlu: 85, humaneval: 90 },
    };
    const score = calculateScore(modelWithBenchmarks, mockPrefs);
    expect(score).toBeGreaterThan(40);
  });

  it('adds points for free models', () => {
    const freeModel = { ...mockModel, pricing: { free: true } };
    const paidModel = mockModel;
    const freeScore = calculateScore(freeModel, mockPrefs);
    const paidScore = calculateScore(paidModel, mockPrefs);
    expect(freeScore).toBeGreaterThan(paidScore);
  });
});

describe('sortByScore', () => {
  it('sorts models by score descending', () => {
    const models: AIModel[] = [
      { ...mockModel, id: 'cheap', input_price: 0.1, output_price: 0.1 },
      { ...mockModel, id: 'expensive', input_price: 50, output_price: 100 },
    ];

    const prefs: UserPreferences = {
      use_case: 'chat',
      max_context: 200000,
      max_budget: 100,
      preferred_features: [],
    };

    const sorted = sortByScore(models, prefs);
    expect(sorted[0].id).toBe('cheap');
    expect(sorted[1].id).toBe('expensive');
  });
});
