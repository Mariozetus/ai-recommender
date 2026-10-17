// db/migrate.ts — aplica migraciones SQL desde ./drizzle a db/data/ai-recommender.db
// Idempotente: usa tabla _migrations para tracking.
import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DB_DIR = './db/data';
const DB_FILE = join(DB_DIR, 'ai-recommender.db');
const MIGRATIONS_DIR = './drizzle';

if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_FILE, { create: true });
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const appliedRows = db
  .query<{ name: string }, []>('SELECT name FROM _migrations')
  .all();
const applied = new Set(appliedRows.map((r) => r.name));

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

let count = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`✓ ${file} (ya aplicada)`);
    continue;
  }
  const sqlText = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  console.log(`→ Aplicando ${file} (${sqlText.length} bytes)`);
  const tx = db.transaction(() => {
    db.exec(sqlText);
    db.run('INSERT INTO _migrations (name) VALUES (?)', [file]);
  });
  tx();
  console.log(`✓ ${file}`);
  count++;
}

console.log(count === 0 ? 'Sin cambios. Base de datos al día.' : `Aplicadas ${count} migraciones.`);
db.close();
