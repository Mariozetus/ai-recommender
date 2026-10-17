// db/seed-pages.ts — carga contenido educativo (glosario) en page_content.
// Idempotente: ON CONFLICT(slug, locale) DO UPDATE.

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';

const DB = './db/data/ai-recommender.db';
const db = new Database(DB);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

interface PageContent {
  slug: string;
  locale: 'en' | 'es';
  title: string;
  body_md: string;
  updated_at: string;
}

const items: PageContent[] = JSON.parse(readFileSync('./seed/page_content.json', 'utf8'));
const now = new Date().toISOString();
const updated = items.map((p) => ({ ...p, updated_at: now }));

const upsert = db.prepare(`
  INSERT INTO page_content (slug, locale, title, body_md, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(slug, locale) DO UPDATE SET
    title = excluded.title,
    body_md = excluded.body_md,
    updated_at = excluded.updated_at
`);

const tx = db.transaction(() => {
  for (const p of updated) {
    upsert.run(p.slug, p.locale, p.title, p.body_md, p.updated_at);
  }
});
tx();

const slugs = new Set(items.map((p) => p.slug));
const locales = new Set(items.map((p) => p.locale));
console.log(`✓ page_content seed: ${slugs.size} slugs × ${locales.size} locales = ${updated.length} filas`);
db.close();
