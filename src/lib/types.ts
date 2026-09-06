export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  source: 'openrouter' | 'lmsys' | 'artificial-analysis' | 'manual';
  category: 'chat' | 'coding' | 'reasoning' | 'image' | 'embedding' | 'multimodal';
  context_window: number;
  input_price: number;
  output_price: number;
  tags: string[];
  url: string;
  benchmark?: {
    mmlu?: number;
    humaneval?: number;
    math?: number;
  };
  fetched_at: string;
  last_updated?: string;
}

export interface UserPreferences {
  use_case: 'chat' | 'coding' | 'reasoning' | 'image' | 'embedding' | 'multimodal';
  max_context: number;
  max_budget: number;
  preferred_features: string[];
}
