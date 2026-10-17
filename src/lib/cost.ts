// src/lib/cost.ts — traduce coste token-level a $/mes con anclaje humano.
// Ver docs/RECOMMENDER.md §"Costo normalizado con anclaje humano".

export type BudgetBin = 'free' | 'low' | 'middle' | 'premium' | 'no-limit';

interface VolumeBin {
  /** tokens de input asumidos por mes */
  inTokens: number;
  /** tokens de output asumidos por mes */
  outTokens: number;
  /** descripción humana */
  label: string;
  /** techo de gasto en USD/mes (∞ si no aplica) */
  capUsd: number;
}

export const VOLUME_BINS: Record<BudgetBin, VolumeBin> = {
  free:     { inTokens:  100_000,  outTokens:  200_000, label: 'Gratis / self-host',  capUsd: 0 },
  low:      { inTokens:  100_000,  outTokens:  200_000, label: 'Menos de $5/mes',       capUsd: 5 },
  middle:   { inTokens:  500_000,  outTokens: 2_000_000, label: '$5 – $50/mes',         capUsd: 50 },
  premium:  { inTokens: 2_000_000, outTokens: 8_000_000, label: 'Más de $50/mes',       capUsd: 500 },
  'no-limit': { inTokens: 5_000_000, outTokens: 20_000_000, label: 'Sin techo',         capUsd: Number.POSITIVE_INFINITY },
};

export function monthlyCostUsd(
  inputCostPerMillion: number | null,
  outputCostPerMillion: number | null,
  bin: BudgetBin = 'middle',
): number | null {
  if (inputCostPerMillion == null || outputCostPerMillion == null) return null;
  const v = VOLUME_BINS[bin];
  return (v.inTokens / 1_000_000) * inputCostPerMillion
       + (v.outTokens / 1_000_000) * outputCostPerMillion;
}

export function costLabel(usd: number | null, bin: BudgetBin = 'middle'): string {
  if (usd == null) return '—';
  if (usd === 0) return 'Gratis';
  if (usd < 0.01) return '< $0.01';
  if (usd < 1) return `≈ $${usd.toFixed(2)}`;
  if (usd < 100) return `≈ $${usd.toFixed(1)}`;
  return `≈ $${Math.round(usd)}`;
}
