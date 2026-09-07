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
    mmlu?: number | null;
    mmlu_pro?: number | null;
    mmlu_redux?: number | null;
    humaneval?: number | null;
    mbpp?: number | null;
    math?: number | null;
    gpqa?: number | null;
    livecodebench?: number | null;
    arena_elo?: number | null;
    hellaswag?: number | null;
    truthfulqa?: number | null;
    winogrande?: number | null;
    arc_challenge?: number | null;
    ifeval?: number | null;
    mt_bench?: number | null;
    chatbot_arena_elo?: number | null;
    intelligence_index?: number | null;
    coding_index?: number | null;
    agentic_index?: number | null;
  };
  modalities?: {
    text?: boolean;
    image_input?: boolean;
    image_output?: boolean;
    audio_input?: boolean;
    audio_output?: boolean;
    file_input?: boolean;
  };
  pricing?: {
    free?: boolean;
    batch?: boolean;
  };
  supported_parameters?: string[];
  max_completion_tokens?: number | null;
  tokenizer?: string;
  fetched_at: string;
  last_updated?: string;
  hf_likes?: number;
  hf_downloads?: number;
  hf_id?: string;
  pipeline_tag?: string;
}

export interface UserPreferences {
  use_case: 'chat' | 'coding' | 'reasoning' | 'image' | 'embedding' | 'multimodal';
  max_context: number;
  max_budget: number;
  preferred_features: string[];
}

export interface ScoreWeights {
  category_match: number;
  context: number;
  cost: number;
  quality: number;
  features: number;
}

export interface ScoreBreakdown {
  category_match: number;
  context: number;
  cost: number;
  quality: number;
  features: number;
}
