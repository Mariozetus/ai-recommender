import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, '..', 'data', 'ais.json');
const ENV_PATH = path.join(__dirname, '..', '.env');

if (fs.existsSync(ENV_PATH)) {
  const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const AIModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  description: z.string(),
  source: z.enum(['openrouter', 'lmsys', 'artificial-analysis', 'manual']),
  category: z.enum(['chat', 'coding', 'reasoning', 'image', 'embedding', 'multimodal']),
  context_window: z.number(),
  input_price: z.number(),
  output_price: z.number(),
  tags: z.array(z.string()),
  url: z.string(),
  benchmark: z.object({
    mmlu: z.number().optional().nullable(),
    mmlu_pro: z.number().optional().nullable(),
    mmlu_redux: z.number().optional().nullable(),
    humaneval: z.number().optional().nullable(),
    mbpp: z.number().optional().nullable(),
    math: z.number().optional().nullable(),
    gpqa: z.number().optional().nullable(),
    livecodebench: z.number().optional().nullable(),
    hellaswag: z.number().optional().nullable(),
    truthfulqa: z.number().optional().nullable(),
    winogrande: z.number().optional().nullable(),
    arc_challenge: z.number().optional().nullable(),
    ifeval: z.number().optional().nullable(),
    mt_bench: z.number().optional().nullable(),
    arena_elo: z.number().optional().nullable(),
    chatbot_arena_elo: z.number().optional().nullable(),
    intelligence_index: z.number().optional().nullable(),
    coding_index: z.number().optional().nullable(),
    agentic_index: z.number().optional().nullable(),
  }).optional().nullable(),
  fetched_at: z.string(),
  modalities: z.object({
    text: z.boolean().optional(),
    image_input: z.boolean().optional(),
    image_output: z.boolean().optional(),
    audio_input: z.boolean().optional(),
    audio_output: z.boolean().optional(),
    file_input: z.boolean().optional(),
  }).optional(),
  pricing: z.object({
    free: z.boolean().optional(),
    batch: z.boolean().optional(),
  }).optional(),
  supported_parameters: z.array(z.string()).optional(),
  max_completion_tokens: z.number().optional().nullable(),
  tokenizer: z.string().optional(),
  hf_likes: z.number().optional(),
  hf_downloads: z.number().optional(),
  hf_id: z.string().optional(),
  pipeline_tag: z.string().optional().nullable(),
});

function inferCategory(id, name, description, modalities) {
  const text = `${id} ${name} ${description}`.toLowerCase();

  if (modalities?.image_output || text.includes('image-generation') || text.includes('stable-diffusion') || text.includes('dall-e')) {
    return 'image';
  }
  if (text.includes('embedding') || text.includes('embed') || text.includes('text-embedding')) {
    return 'embedding';
  }
  if (text.includes('coder') || text.includes('code')) return 'coding';
  if (text.includes('reason') || text.includes('math') || text.includes('think') || text.includes('deepseek-r1')) return 'reasoning';
  if (modalities?.image_input || text.includes('vision') || text.includes('gemini') || text.includes('multimodal') || text.includes('sdxl')) return 'multimodal';
  return 'chat';
}

function parseModalities(arch) {
  if (!arch) return undefined;
  const input = arch.input_modalities || [];
  const output = arch.output_modalities || [];
  return {
    text: input.includes('text') || output.includes('text'),
    image_input: input.includes('image'),
    image_output: output.includes('image'),
    audio_input: input.includes('audio'),
    audio_output: output.includes('audio'),
    file_input: input.includes('file'),
  };
}

async function fetchOpenRouterModels() {
  if (!OPENROUTER_API_KEY) {
    console.warn('OPENROUTER_API_KEY not set, skipping OpenRouter');
    return [];
  }

  console.log('Fetching OpenRouter models...');
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` }
    });

    if (!response.ok) {
      console.error('Failed to fetch OpenRouter models:', response.status);
      return [];
    }

    const data = await response.json();
    return data.data.map(model => {
      const modalities = parseModalities(model.architecture);
      const isFree = parseFloat(model.pricing?.prompt || '0') === 0 && parseFloat(model.pricing?.completion || '0') === 0;
      const aaBench = model.benchmarks?.artificial_analysis || {};
      const benchmark = {
        mmlu: model.benchmark?.mmlu ?? null,
        humaneval: model.benchmark?.humaneval ?? null,
        math: model.benchmark?.math ?? null,
        intelligence_index: aaBench.intelligence_index ?? null,
        coding_index: aaBench.coding_index ?? null,
        agentic_index: aaBench.agentic_index ?? null,
      };
      const cleanBenchmark = Object.fromEntries(
        Object.entries(benchmark).filter(([_, v]) => v !== null && v !== undefined)
      );
      const hasBench = Object.keys(cleanBenchmark).length > 0;
      const cleanBench = hasBench ? cleanBenchmark : null;

      return {
        id: model.id,
        name: model.name,
        provider: model.id.split('/')[0],
        description: model.description || `AI model by ${model.id.split('/')[0]}`,
        source: 'openrouter',
        category: inferCategory(model.id, model.name, model.description || '', modalities),
        context_window: model.context_length || model.top_provider?.context_length || 4096,
        input_price: model.pricing?.prompt ? parseFloat(model.pricing.prompt) * 1e6 : 0,
        output_price: model.pricing?.completion ? parseFloat(model.pricing.completion) * 1e6 : 0,
        tags: model.tags || [],
        url: `https://openrouter.ai/models/${model.id}`,
        benchmark: cleanBench,
        fetched_at: new Date().toISOString(),
        modalities,
        pricing: {
          free: isFree,
          batch: model.id.endsWith(':batch'),
        },
        supported_parameters: model.supported_parameters || [],
        max_completion_tokens: model.top_provider?.max_completion_tokens,
        tokenizer: model.architecture?.tokenizer,
      };
    });
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
    return [];
  }
}

async function fetchLMSYSModels() {
  console.log('Fetching LMSYS Arena models...');
  try {
    const response = await fetch('https://lmarena.ai/api/models', {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.warn('Failed to fetch LMSYS models:', response.status);
      return [];
    }

    const data = await response.json();
    return data.map(model => {
      const category = inferCategory(model.id || model.name, model.name, '');
      return {
        id: `lmsys-${model.id || model.name}`,
        name: model.name,
        provider: 'LMSYS',
        description: `LMSYS Arena model - ${model.name}`,
        source: 'lmsys',
        category,
        context_window: model.context_length || model.max_tokens || 32768,
        input_price: 0,
        output_price: 0,
        tags: ['lmsys', 'arena'],
        url: `https://lmarena.ai/?leaderboard`,
        benchmark: model.benchmarks ? {
          mmlu: model.benchmarks.mmlu,
          humaneval: model.benchmarks.humaneval,
          math: model.benchmarks.math,
        } : null,
        fetched_at: new Date().toISOString(),
      };
    });
  } catch (error) {
    console.warn('Error fetching LMSYS models:', error);
    return [];
  }
}

async function fetchArtificialAnalysisModels() {
  console.log('Fetching Artificial Analysis models...');
  try {
    const response = await fetch('https://artificialanalysis.ai/api/models', {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.warn('Failed to fetch Artificial Analysis models:', response.status);
      return [];
    }

    const data = await response.json();
    return data.models.map(model => ({
      id: `aa-${model.id}`,
      name: model.name,
      provider: model.provider || 'Unknown',
      description: model.description || `AI model - ${model.name}`,
      source: 'artificial-analysis',
      category: inferCategory(model.id, model.name, model.description || ''),
      context_window: model.context_length || 32768,
      input_price: model.pricing?.input || 0,
      output_price: model.pricing?.output || 0,
      tags: model.tags || [],
      url: model.url || `https://artificialanalysis.ai/models/${model.id}`,
      benchmark: model.benchmarks ? {
        mmlu: model.benchmarks.mmlu,
        humaneval: model.benchmarks.humaneval,
        math: model.benchmarks.math,
      } : null,
      fetched_at: new Date().toISOString(),
    }));
  } catch (error) {
    console.warn('Error fetching Artificial Analysis models:', error);
    return [];
  }
}

async function mergeWithExisting(newModels, existingModels) {
  const existingMap = new Map(existingModels.map(m => [m.id, m]));
  const merged = [];

  for (const model of newModels) {
    const existing = existingMap.get(model.id);
    if (existing) {
      const manualFields = {
        description: existing.source === 'manual' ? existing.description : model.description,
        tags: existing.source === 'manual' && existing.tags?.length > 0 ? existing.tags : model.tags,
      };
      merged.push({ ...model, ...manualFields });
      existingMap.delete(model.id);
    } else {
      merged.push(model);
    }
  }

  for (const [, model] of existingMap) {
    if (model.source === 'manual') {
      merged.push({ ...model, fetched_at: new Date().toISOString() });
    }
  }

  return merged;
}

const HF_CACHE_PATH = path.join(__dirname, '..', 'data', 'hf-cache.json');
const BENCHMARKS_PATH = path.join(__dirname, '..', 'data', 'benchmarks.json');

function loadHfCache() {
  if (fs.existsSync(HF_CACHE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(HF_CACHE_PATH, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveHfCache(cache) {
  fs.writeFileSync(HF_CACHE_PATH, JSON.stringify(cache, null, 2));
}

function loadCuratedBenchmarks() {
  if (!fs.existsSync(BENCHMARKS_PATH)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf-8'));
    return data.benchmarks || {};
  } catch {
    return {};
  }
}

const PROVIDER_TO_HF_ORG = {
  'meta-llama': ['meta-llama'],
  'mistralai': ['mistralai'],
  'google': ['google'],
  'qwen': ['Qwen'],
  'deepseek': ['deepseek-ai'],
  'microsoft': ['microsoft'],
  'cohere': ['CohereForAI'],
  'nvidia': ['nvidia'],
  'ibm-granite': ['ibm-granite'],
  'baidu': ['baidu'],
  'tencent': ['Tencent-Hunyuan'],
  'bytedance': ['ByteDance-Seed'],
  'xai': ['xai-org'],
  '01-ai': ['01-ai'],
  'allenai': ['allenai'],
  'amazon': ['amazon'],
};

async function fetchHuggingFaceMetadata(model) {
  const cache = loadHfCache();
  if (cache[model.id]) return cache[model.id];

  const provider = model.provider;
  const modelName = model.id.split('/')[1] || '';
  if (!modelName) return null;

  const orgCandidates = PROVIDER_TO_HF_ORG[provider] || [provider];

  for (const org of orgCandidates) {
    const hfId = `${org}/${modelName}`;
    try {
      const response = await fetch(`https://huggingface.co/api/models/${hfId}`, {
        headers: { 'User-Agent': 'ai-recommender-scraper' },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const result = {
        hf_likes: data.likes || 0,
        hf_downloads: data.downloads || 0,
        hf_id: hfId,
        pipeline_tag: data.pipeline_tag || null,
      };

      cache[model.id] = result;
      return result;
    } catch {
      continue;
    }
  }

  return null;
}

function validateModels(models) {
  const validated = [];
  const errors = [];

  for (const model of models) {
    try {
      const result = AIModelSchema.parse(model);
      validated.push(result);
    } catch (error) {
      const issues = (error && (error.issues || error.errors)) || [];
      const detail = Array.isArray(issues)
        ? issues.map(e => `${(e.path || []).join('.')}: ${e.message}`).join(', ')
        : String(error?.message || error);
      errors.push(`Model ${model.id}: ${detail}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`Validation errors in ${errors.length} models:`);
    errors.slice(0, 5).forEach(e => console.warn(`  - ${e}`));
    if (errors.length > 5) console.warn(`  ... and ${errors.length - 5} more`);
  }

  return validated;
}

async function main() {
  console.log('Starting AI models update...');

  let existingModels = [];
  if (fs.existsSync(DATA_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      existingModels = data.models || [];
      console.log(`Found ${existingModels.length} existing models`);
    } catch {
      console.warn('Could not read existing data file, starting fresh');
    }
  }

  const [openRouterModels, lmsysModels, aaModels] = await Promise.all([
    fetchOpenRouterModels(),
    fetchLMSYSModels(),
    fetchArtificialAnalysisModels(),
  ]);

  console.log(`Fetched ${openRouterModels.length} from OpenRouter, ${lmsysModels.length} from LMSYS, ${aaModels.length} from AA`);

  const allNewModels = [...openRouterModels, ...lmsysModels, ...aaModels];
  const mergedModels = await mergeWithExisting(allNewModels, existingModels);

  console.log('Loading curated benchmarks...');
  const curatedBenchmarks = loadCuratedBenchmarks();
  console.log(`Loaded benchmarks for ${Object.keys(curatedBenchmarks).length} models`);

  console.log('Fetching HuggingFace metadata...');
  const hfCache = loadHfCache();
  let hfUpdated = 0;
  const enrichedModels = await Promise.all(mergedModels.map(async (model) => {
    let enriched = { ...model };

    if (curatedBenchmarks[model.id]) {
      const cb = curatedBenchmarks[model.id];
      enriched.benchmark = {
        ...enriched.benchmark,
        ...cb,
      };
      enriched.benchmark = Object.fromEntries(
        Object.entries(enriched.benchmark).filter(([_, v]) => v !== null && v !== undefined && v !== '')
      );
      if (Object.keys(enriched.benchmark).length === 0) {
        enriched.benchmark = null;
      }
    }

    const hfCached = hfCache[model.id];
    const cacheAge = hfCached ? (Date.now() - hfCached._fetched_at) : Infinity;
    if (!hfCached || cacheAge > 7 * 24 * 60 * 60 * 1000) {
      const hf = await fetchHuggingFaceMetadata(model);
      if (hf) {
        hfUpdated++;
        if (hf.hf_likes > 0) enriched.hf_likes = hf.hf_likes;
        if (hf.hf_downloads > 0) enriched.hf_downloads = hf.hf_downloads;
        if (hf.hf_id) enriched.hf_id = hf.hf_id;
        if (hf.pipeline_tag) enriched.pipeline_tag = hf.pipeline_tag;
        hfCache[model.id] = { ...hf, _fetched_at: Date.now() };
      }
    } else if (hfCached) {
      if (hfCached.hf_likes > 0) enriched.hf_likes = hfCached.hf_likes;
      if (hfCached.hf_downloads > 0) enriched.hf_downloads = hfCached.hf_downloads;
      if (hfCached.hf_id) enriched.hf_id = hfCached.hf_id;
      if (hfCached.pipeline_tag) enriched.pipeline_tag = hfCached.pipeline_tag;
    }

    return enriched;
  }));

  saveHfCache(hfCache);
  console.log(`Updated ${hfUpdated} HuggingFace entries`);

  const validatedModels = validateModels(enrichedModels);

  const output = {
    models: validatedModels,
    fetched_at: new Date().toISOString(),
    source: 'update-script',
    stats: {
      openrouter: openRouterModels.length,
      lmsys: lmsysModels.length,
      'artificial-analysis': aaModels.length,
      huggingface: hfUpdated,
      curated_benchmarks: Object.keys(curatedBenchmarks).length,
    }
  };

  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${validatedModels.length} models to ${DATA_PATH}`);

  const { execSync } = await import('child_process');
  try {
    execSync('git diff --quiet data/ais.json', { cwd: path.join(__dirname, '..') });
    console.log('No changes to commit');
  } catch {
    console.log('Changes detected, committing...');
    execSync('git add data/ais.json', { cwd: path.join(__dirname, '..') });
    execSync('git commit -m "Update AI models data [skip ci]"', { cwd: path.join(__dirname, '..') });
    console.log('Committed changes');
  }
}

main().catch(console.error);
