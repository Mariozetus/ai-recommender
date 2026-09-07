import type { AIModel } from './types';

const LANGUAGES: Record<string, { code: string; name: string; flag: string }> = {
  en: { code: 'en', name: 'Inglés', flag: '🇬🇧' },
  es: { code: 'es', name: 'Español', flag: '🇪🇸' },
  fr: { code: 'fr', name: 'Francés', flag: '🇫🇷' },
  de: { code: 'de', name: 'Alemán', flag: '🇩🇪' },
  it: { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  pt: { code: 'pt', name: 'Portugués', flag: '🇵🇹' },
  zh: { code: 'zh', name: 'Chino', flag: '🇨🇳' },
  ja: { code: 'ja', name: 'Japonés', flag: '🇯🇵' },
  ko: { code: 'ko', name: 'Coreano', flag: '🇰🇷' },
  ru: { code: 'ru', name: 'Ruso', flag: '🇷🇺' },
  ar: { code: 'ar', name: 'Árabe', flag: '🇸🇦' },
  hi: { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  nl: { code: 'nl', name: 'Holandés', flag: '🇳🇱' },
  pl: { code: 'pl', name: 'Polaco', flag: '🇵🇱' },
  tr: { code: 'tr', name: 'Turco', flag: '🇹🇷' },
  sv: { code: 'sv', name: 'Sueco', flag: '🇸🇪' },
};

const MULTILINGUAL_KEYWORDS: Record<string, string[]> = {
  gpt: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ru', 'ar', 'hi', 'nl', 'pl'],
  claude: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ru', 'ar', 'hi', 'nl', 'pl'],
  gemini: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ru', 'ar', 'hi', 'nl', 'pl', 'sv', 'tr'],
  llama: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh'],
  mistral: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ru', 'ar'],
  qwen: ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar'],
  deepseek: ['en', 'zh'],
  command: ['en', 'es', 'fr', 'de', 'it', 'pt'],
  grok: ['en'],
  nemotron: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ru'],
  phi: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja'],
  gemma: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko'],
  cohere: ['en', 'es', 'fr', 'de', 'it', 'pt'],
  yi: ['en', 'zh'],
  openai: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ru', 'ar', 'hi', 'nl', 'pl'],
};

function inferLanguages(modelId: string, name: string, description: string) {
  const id = (modelId + ' ' + name + ' ' + description).toLowerCase();
  const matches: Array<{ code: string; name: string; flag: string }> = [];

  for (const [keyword, langs] of Object.entries(MULTILINGUAL_KEYWORDS)) {
    if (id.includes(keyword)) {
      for (const langCode of langs) {
        if (!matches.find(m => m.code === langCode)) {
          matches.push(LANGUAGES[langCode]);
        }
      }
      break;
    }
  }

  if (matches.length === 0) {
    return [{ code: 'en', name: 'Inglés', flag: '🇬🇧' }];
  }

  return matches;
}

function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#\w+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanPrice(price: number): number {
  return Math.round(price * 100) / 100;
}

function inferStrengths(model: AIModel): string[] {
  const strengths: string[] = [];

  if (model.context_window >= 1000000) {
    strengths.push('Contexto ultra largo (1M+ tokens)');
  } else if (model.context_window >= 200000) {
    strengths.push('Contexto muy largo (200K+ tokens)');
  } else if (model.context_window >= 128000) {
    strengths.push('Contexto largo (128K+ tokens)');
  }

  if (model.input_price + model.output_price === 0) {
    strengths.push('Gratuito');
  } else if (model.input_price + model.output_price < 5) {
    strengths.push('Económico');
  }

  if (model.benchmark?.intelligence_index && model.benchmark.intelligence_index >= 60) {
    strengths.push('Alta inteligencia');
  }

  if (model.benchmark?.coding_index && model.benchmark.coding_index >= 70) {
    strengths.push('Excelente para código');
  }

  if (model.modalities?.image_input) {
    strengths.push('Soporta visión');
  }

  if (model.modalities?.image_output) {
    strengths.push('Genera imágenes');
  }

  if (model.supported_parameters?.includes('tools')) {
    strengths.push('Function calling');
  }

  if (model.supported_parameters?.includes('reasoning')) {
    strengths.push('Razonamiento avanzado');
  }

  if (model.pricing?.batch) {
    strengths.push('Batch API disponible');
  }

  return strengths;
}

export function sanitizeModel(raw: any): AIModel & {
  supported_languages?: Array<{ code: string; name: string; flag: string }>;
  strengths?: string[];
} {
  const id = String(raw.id || '').trim();
  const name = String(raw.name || '').trim();
  const provider = String(raw.provider || '').trim();
  const description = cleanText(String(raw.description || `Modelo de IA por ${provider}`).slice(0, 1000));

  return {
    id,
    name,
    provider,
    description,
    source: ['openrouter', 'lmsys', 'artificial-analysis', 'manual'].includes(raw.source) ? raw.source : 'manual',
    category: ['chat', 'coding', 'reasoning', 'image', 'embedding', 'multimodal'].includes(raw.category) ? raw.category : 'chat',
    context_window: Math.max(0, parseInt(String(raw.context_window)) || 0),
    input_price: cleanPrice(parseFloat(String(raw.input_price)) || 0),
    output_price: cleanPrice(parseFloat(String(raw.output_price)) || 0),
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 20).map((t: any) => String(t).slice(0, 50)) : [],
    url: String(raw.url || `https://openrouter.ai/models/${id}`),
    benchmark: raw.benchmark && typeof raw.benchmark === 'object' ? {
      mmlu: typeof raw.benchmark.mmlu === 'number' ? raw.benchmark.mmlu : null,
      mmlu_pro: typeof raw.benchmark.mmlu_pro === 'number' ? raw.benchmark.mmlu_pro : null,
      humaneval: typeof raw.benchmark.humaneval === 'number' ? raw.benchmark.humaneval : null,
      math: typeof raw.benchmark.math === 'number' ? raw.benchmark.math : null,
      gpqa: typeof raw.benchmark.gpqa === 'number' ? raw.benchmark.gpqa : null,
      livecodebench: typeof raw.benchmark.livecodebench === 'number' ? raw.benchmark.livecodebench : null,
      arena_elo: typeof raw.benchmark.arena_elo === 'number' ? raw.benchmark.arena_elo : null,
      intelligence_index: typeof raw.benchmark.intelligence_index === 'number' ? raw.benchmark.intelligence_index : null,
      coding_index: typeof raw.benchmark.coding_index === 'number' ? raw.benchmark.coding_index : null,
      agentic_index: typeof raw.benchmark.agentic_index === 'number' ? raw.benchmark.agentic_index : null,
    } : null,
    modalities: raw.modalities && typeof raw.modalities === 'object' ? {
      text: !!raw.modalities.text,
      image_input: !!raw.modalities.image_input,
      image_output: !!raw.modalities.image_output,
      audio_input: !!raw.modalities.audio_input,
      audio_output: !!raw.modalities.audio_output,
      file_input: !!raw.modalities.file_input,
    } : undefined,
    pricing: raw.pricing && typeof raw.pricing === 'object' ? {
      free: !!raw.pricing.free,
      batch: !!raw.pricing.batch,
    } : undefined,
    supported_parameters: Array.isArray(raw.supported_parameters)
      ? raw.supported_parameters.map((p: any) => String(p)).slice(0, 30)
      : undefined,
    max_completion_tokens: typeof raw.max_completion_tokens === 'number' && raw.max_completion_tokens > 0
      ? raw.max_completion_tokens
      : null,
    tokenizer: raw.tokenizer ? String(raw.tokenizer) : undefined,
    fetched_at: raw.fetched_at || new Date().toISOString(),
    last_updated: raw.last_updated || raw.fetched_at || new Date().toISOString(),
    supported_languages: inferLanguages(id, name, description),
    strengths: inferStrengths({
      id, name, provider, description,
      source: 'openrouter',
      category: raw.category || 'chat',
      context_window: raw.context_window || 0,
      input_price: raw.input_price || 0,
      output_price: raw.output_price || 0,
      tags: raw.tags || [],
      url: raw.url || '',
      benchmark: raw.benchmark,
      modalities: raw.modalities,
      pricing: raw.pricing,
      supported_parameters: raw.supported_parameters,
      fetched_at: raw.fetched_at || '',
    }),
  } as any;
}

export function sanitizeModels(rawModels: any[]): AIModel[] {
  return rawModels.map(sanitizeModel);
}
