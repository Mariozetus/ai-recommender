# AI Model Recommender

Discover and compare AI models from OpenRouter. Get personalized recommendations based on your use case, budget, and preferences.

## Features

- **Catalog**: Browse 400+ AI models with filtering by category, provider, context window, and price
- **Recommendations**: Answer a few questions and get personalized AI model recommendations
- **Compare**: Side-by-side comparison of multiple models
- **Search**: Find models by name, provider, or description

## Tech Stack

- Astro with hybrid rendering (SSR + static)
- Tailwind CSS v4
- TypeScript
- Vercel adapter

## Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Update AI models data
pnpm update-data
```

## Environment Variables

Create a `.env` file:

```env
OPENROUTER_API_KEY=your_api_key_here
```

Get your API key from [OpenRouter](https://openrouter.ai/keys).

## Data

Models are fetched from OpenRouter API and stored in `data/ais.json`. The update script runs automatically via GitHub Actions every Sunday at midnight.

To manually update:

```bash
pnpm update-data
```

## Deploy

1. Connect your GitHub repo to Vercel
2. Add the `OPENROUTER_API_KEY` environment variable
3. Deploy

## Project Structure

```
src/
├── components/    # Astro components
├── layouts/       # Page layouts
├── lib/           # Shared types and scoring logic
├── pages/         # Routes (index, recommend, compare, models/[id])
data/
└── ais.json       # AI models data
scripts/
└── update-ais.mjs # Data fetching script
```

## Categories

- **chat**: General conversation models
- **coding**: Code generation and completion
- **reasoning**: Logical reasoning and math
- **image**: Image generation models
- **embedding**: Text embedding models
- **multimodal**: Models supporting multiple modalities
