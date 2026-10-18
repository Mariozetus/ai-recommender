// /api/health — endpoint JSON. En static mode, prerender=true serializa la respuesta a dist/api/health.json.
import { health } from '../../lib/data';

export const prerender = true;

export const GET = () =>
  new Response(JSON.stringify(health, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
