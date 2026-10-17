// sync/common.ts — utilidades compartidas por todos los syncs.

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export async function fetchWithRetry(
  url: string,
  opts: { tries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const { tries = 3, timeoutMs = 30_000 } = opts;
  let lastErr: unknown = null;
  for (let i = 0; i < tries; i++) {
    if (i > 0) {
      const wait = 5_000 * (i + 1);
      console.log(`  retry #${i + 1} after ${wait}ms`);
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, wait);
      await promise;
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`fetchWithRetry(${url}) failed after ${tries} tries: ${String(lastErr)}`);
}

export function validateOrThrow(schema: object, data: unknown, name: string): void {
  const validate: ValidateFunction = ajv.compile(schema);
  if (!validate(data)) {
    const errs = (validate.errors ?? [])
      .slice(0, 5)
      .map((e) => `${e.instancePath} ${e.message ?? 'invalid'}`);
    throw new Error(`Schema ${name} failed: ${errs.join('; ')}`);
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9./-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Map models.dev cost (USD / 1M tokens) to our schema (USD per 1M tokens). */
export function normalizeCost(input: number | null | undefined): number | null {
  if (input == null) return null;
  if (!Number.isFinite(input)) return null;
  if (input < 0) return null;
  if (input > 1000) return null; // sanity: >$1000/M tokens is almost certainly wrong
  return input;
}
