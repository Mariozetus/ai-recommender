// /api/health — health JSON endpoint. En build static (output: 'static'),
// prerender = true hace que el GET corra en build time y Astro serialice
// el resultado a dist/api/health.json. El script scripts/build-data.ts
// reescribe el body en cada build con datos reales de la DB.
import type { APIRoute } from 'astro';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const prerender = true;

export const GET: APIRoute = async () => {
  const path = join(process.cwd(), 'public/api/health.json');
  let body: string;
  if (existsSync(path)) {
    body = readFileSync(path, 'utf8');
  } else {
    body = JSON.stringify({ status: 'unknown', error: 'health.json not built — run bun run build:data first' });
  }
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
