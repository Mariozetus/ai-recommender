import type { Config } from 'drizzle-kit';

export default {
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './db/data/ai-recommender.db',
  },
  verbose: true,
  strict: true,
} satisfies Config;
