import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, '..', 'data', 'ais.json');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN;

async function fetchOpenRouterModels() {
  if (!OPENROUTER_API_KEY) {
    console.warn('OPENROUTER_API_KEY not set, skipping OpenRouter');
    return [];
  }

  console.log('Fetching OpenRouter models...');
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
    source: 'openrouter' as const,
    category: inferCategory(model.id, model.name, model.description),
    context_window: model.context_length || 4096,
    input_price: model.pricing?.input ? parseFloat(model.pricing.input) * 1e6 : 0,
    output_price: model.pricing?.output ? parseFloat(model.pricing.output) * 1e6 : 0,
    tags: model.tags || [],
    url: model.openrouter_schema?.agent?.url || `https://openrouter.ai/models/${model.id}`,
    benchmark: null,
    fetched_at: new Date().toISOString(),
  }));
}

function inferCategory(id, name, description) {
  const text = `${id} ${name} ${description}`.toLowerCase();
  if (text.includes('coder') || text.includes('code')) return 'coding';
  if (text.includes('vision') || text.includes('image') || text.includes('sdxl') || text.includes('diffusion')) return 'image';
  if (text.includes('embedding') || text.includes('embed')) return 'embedding';
  if (text.includes('reason') || text.includes('math') || text.includes('think')) return 'reasoning';
  if (text.includes('vision') || text.includes('multi') || text.includes('gemini')) return 'multimodal';
  return 'chat';
}

async function mergeWithExisting(newModels, existingModels) {
  const existingMap = new Map(existingModels.map(m => [m.id, m]));
  const merged = [];

  for (const model of newModels) {
    const existing = existingMap.get(model.id);
    if (existing) {
      const manualFields = {
        description: existing.description !== model.description && existing.source === 'manual' ? existing.description : model.description,
        tags: existing.tags?.length > 0 && existing.source === 'manual' ? existing.tags : model.tags,
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

async function main() {
  console.log('Starting AI models update...');

  let existingModels = [];
  if (fs.existsSync(DATA_PATH)) {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    existingModels = data.models || [];
    console.log(`Found ${existingModels.length} existing models`);
  }

  const openRouterModels = await fetchOpenRouterModels();
  console.log(`Fetched ${openRouterModels.length} models from OpenRouter`);

  const allNewModels = [...openRouterModels];
  const mergedModels = await mergeWithExisting(allNewModels, existingModels);

  const output = {
    models: mergedModels,
    fetched_at: new Date().toISOString(),
    source: 'update-script'
  };

  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${mergedModels.length} models to ${DATA_PATH}`);

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
