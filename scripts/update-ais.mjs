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
    mmlu: z.number().optional(),
    humaneval: z.number().optional(),
    math: z.number().optional(),
  }).optional().nullable(),
  fetched_at: z.string(),
  modalities: z.object({
    text: z.boolean().optional(),
    image: z.boolean().optional(),
    audio: z.boolean().optional(),
  }).optional(),
  pricing: z.object({
    free: z.boolean().optional(),
    batch: z.boolean().optional(),
  }).optional(),
});

function inferCategory(id, name, description) {
  const text = `${id} ${name} ${description}`.toLowerCase();
  if (text.includes('coder') || text.includes('code')) return 'coding';
  if (text.includes('embedding') || text.includes('embed')) return 'embedding';
  if (text.includes('reason') || text.includes('math') || text.includes('think')) return 'reasoning';
  if (text.includes('vision') || text.includes('multimodal') || text.includes('gemini') || text.includes('image-generation') || text.includes('sdxl') || text.includes('diffusion')) return 'multimodal';
  if (text.includes('image') || text.includes('stable-diffusion') || text.includes('dall-e')) return 'image';
  return 'chat';
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
    return data.data.map(model => ({
      id: model.id,
      name: model.name,
      provider: model.id.split('/')[0],
      description: model.description || `AI model by ${model.id.split('/')[0]}`,
      source: 'openrouter',
      category: inferCategory(model.id, model.name, model.description),
      context_window: model.context_length || 4096,
      input_price: model.pricing?.input ? parseFloat(model.pricing.input) * 1e6 : 0,
      output_price: model.pricing?.output ? parseFloat(model.pricing.output) * 1e6 : 0,
      tags: model.tags || [],
      url: model.openrouter_schema?.agent?.url || `https://openrouter.ai/models/${model.id}`,
      benchmark: null,
      fetched_at: new Date().toISOString(),
    }));
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

function validateModels(models) {
  const validated = [];
  const errors = [];

  for (const model of models) {
    try {
      const result = AIModelSchema.parse(model);
      validated.push(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(`Model ${model.id}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
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
  const validatedModels = validateModels(mergedModels);

  const output = {
    models: validatedModels,
    fetched_at: new Date().toISOString(),
    source: 'update-script',
    stats: {
      openrouter: openRouterModels.length,
      lmsys: lmsysModels.length,
      'artificial-analysis': aaModels.length,
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
